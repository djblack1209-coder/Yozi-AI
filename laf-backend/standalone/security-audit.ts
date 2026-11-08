import type { Db } from 'mongodb';
import {
  SECURITY_AUDIT_COLLECTION,
  SECURITY_AUDIT_RETENTION_SECONDS,
  SECURITY_AUDIT_TTL_INDEX
} from '../functions/_shared/security-audit-retention.js';

const securityEvents = new Map([
  [401, 'authentication_denied'],
  [403, 'authorization_denied'],
  [429, 'rate_limited']
]);

export async function ensureSecurityAuditRetention(db: Db) {
  const collection = db.collection(SECURITY_AUDIT_COLLECTION);
  const indexes = await collection
    .listIndexes()
    .toArray()
    .catch((error) => {
      if (error.code === 26) return []; // A new database has no audit collection yet.
      throw error;
    });
  const previous = indexes.find((index) => index.key.created_at === 1 && Object.keys(index.key).length === 1);
  if (!previous) {
    await collection.createIndex(
      { created_at: 1 },
      { name: SECURITY_AUDIT_TTL_INDEX, expireAfterSeconds: SECURITY_AUDIT_RETENTION_SECONDS }
    );
    return;
  }
  // Turning a non-expiring historical index into TTL could delete old records.
  if (!Number.isFinite(previous.expireAfterSeconds)) throw new Error('Existing audit index has no expiry');
  if (previous.expireAfterSeconds < SECURITY_AUDIT_RETENTION_SECONDS) {
    await db.command({
      collMod: SECURITY_AUDIT_COLLECTION,
      index: { name: previous.name, expireAfterSeconds: SECURITY_AUDIT_RETENTION_SECONDS }
    });
  }
}

export function createSecurityAudit(getDb: () => Promise<Db>) {
  let retention: Promise<void>;
  const pending = new Set<Promise<void>>();

  function record(endpoint: string, httpCode: number, businessCode?: number) {
    const code = securityEvents.has(businessCode) ? businessCode : httpCode;
    const event = securityEvents.get(code);
    if (!event) return;
    const now = new Date();
    const operation = getDb()
      .then(async (db) => {
        retention ||= ensureSecurityAuditRetention(db).catch((error) => {
          retention = undefined;
          throw error;
        });
        await retention;
        // Only the server's route name and denial outcome cross this boundary.
        await db.collection(SECURITY_AUDIT_COLLECTION).insertOne({
          event,
          endpoint,
          code,
          severity: 'warning',
          timestamp: now,
          created_at: now
        });
      })
      .catch(() => console.error('[security-audit] event write failed'));
    pending.add(operation);
    void operation.then(() => pending.delete(operation));
  }

  return { record, flush: () => Promise.all(pending) };
}
