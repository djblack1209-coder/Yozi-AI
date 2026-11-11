import path from 'node:path';
import type { Db } from 'mongodb';
import type { RequestHandler } from 'express';
import { requireAdminAccess } from '../functions/_shared/admin-auth.js';

const DAY = 86400000;
const dayKey = (at: number) => new Date(at).toISOString().slice(0, 10);
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function createOperations(getDb: () => Promise<Db>, mailPool: { status: () => Promise<any> }) {
  const pending = new Set<Promise<any>>();
  function write(operation: (db: Db) => Promise<any>) {
    const task = getDb()
      .then(operation)
      .catch(() => console.error('[operations] metric write failed'));
    pending.add(task);
    void task.then(() => pending.delete(task));
  }
  function recordRequest(endpoint: string, status: number, duration: number) {
    const day = dayKey(Date.now());
    write((db) =>
      db.collection('operations_requests').updateOne(
        { _id: `${day}:${endpoint}` as any },
        {
          $set: { day, endpoint },
          $inc: { requests: 1, failures: status >= 500 ? 1 : 0, durationMs: duration }
        },
        { upsert: true }
      )
    );
  }
  function recordVisit(page: string) {
    const day = dayKey(Date.now());
    const section = page === '/account/' ? 'account' : /^\/(?:zh|en)?\/?$/.test(page) ? 'home' : 'other';
    write((db) =>
      db.collection('operations_visits').updateOne(
        { _id: `${day}:${section}` as any },
        {
          $set: { day, section },
          $inc: { visits: 1 }
        },
        { upsert: true }
      )
    );
  }
  function recordMaintenance() {
    write((db) =>
      db
        .collection('operations_maintenance')
        .insertOne({ event: 'backend_started', release: path.basename(process.cwd()), at: new Date() })
    );
  }

  function recordActivity(userId: string) {
    write((db) =>
      db
        .collection('operations_activity')
        .updateOne({ _id: userId as any }, { $max: { lastUsedAt: Date.now() } }, { upsert: true })
    );
  }

  async function users(db: Db, search: string, offset: number) {
    const query = search
      ? { $or: [{ email: new RegExp(escapeRegex(search), 'i') }, { nickname: new RegExp(escapeRegex(search), 'i') }] }
      : {};
    const rows = await db
      .collection('users')
      .find(query, {
        projection: {
          email: 1,
          nickname: 1,
          role: 1,
          status: 1,
          account_status: 1,
          is_deleted: 1,
          created_at: 1
        }
      })
      .sort({ _id: 1 })
      .skip(offset)
      .limit(51)
      .toArray();
    const ids = rows.slice(0, 50).map((r) => String(r._id));
    const accounts = await db
      .collection('learning_accounts')
      .find(
        { user_id: { $in: ids } },
        {
          projection: { user_id: 1, 'calls.at': 1, 'calls.status': 1, 'cost.spent': 1, 'cost.pending': 1 }
        }
      )
      .toArray();
    const states = await db
      .collection('learning_states')
      .find({ user_id: { $in: ids } }, { projection: { user_id: 1, revision: 1 } })
      .toArray();
    const activity = await db
      .collection('operations_activity')
      .find({ _id: { $in: ids } as any })
      .toArray();
    return {
      hasMore: rows.length > 50,
      offset,
      users: rows.slice(0, 50).map((row) => {
        const id = String(row._id),
          account = accounts.find((a) => a.user_id === id),
          state = states.find((s) => s.user_id === id);
        return {
          id,
          email: row.email || null,
          name: row.nickname || null,
          role: row.role || 'user',
          status:
            row.is_deleted || row.account_status === 'deleted'
              ? 'deleted'
              : row.status === 'blocked'
                ? 'blocked'
                : row.account_status || row.status || 'active',
          createdAt: row.created_at || null,
          calls: account?.calls?.length || 0,
          lastUsedAt:
            Math.max(
              activity.find((a) => String(a._id) === id)?.lastUsedAt || 0,
              ...(account?.calls || []).map((c) => Number(c.at) || 0)
            ) || null,
          settledCost: account?.cost?.spent ?? null,
          pendingCost: account?.cost?.pending ?? null,
          syncRevision: state?.revision ?? null
        };
      })
    };
  }

  const handler: RequestHandler = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = requireAdminAccess({ headers: req.headers });
    if (!auth.ok) return void res.status(auth.code).json({ code: auth.code, message: auth.message });
    const { view = 'overview', search = '', offset = 0 } = req.body || {};
    if (
      !['overview', 'users'].includes(view) ||
      typeof search !== 'string' ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    )
      return void res.status(400).json({ code: 400, message: '查询参数不正确' });
    try {
      const db = await getDb();
      if (view === 'users') return void res.json({ code: 0, data: await users(db, search, offset) });
      const at = Date.now(),
        firstDay = dayKey(at - 6 * DAY);
      const [totalUsers, active, requests, visits, maintenance, anomalies, pool, page] = await Promise.all([
        db.collection('users').countDocuments(),
        Promise.all([
          db.collection('learning_accounts').distinct('user_id', { 'calls.at': { $gte: at - 7 * DAY } }),
          db.collection('operations_activity').distinct('_id', { lastUsedAt: { $gte: at - 7 * DAY } })
        ]).then((groups) => new Set(groups.flat().map(String)).size),
        db
          .collection('operations_requests')
          .find({ day: { $gte: firstDay } }, { projection: { _id: 0 } })
          .toArray(),
        db
          .collection('operations_visits')
          .find({ day: { $gte: firstDay } }, { projection: { _id: 0 } })
          .toArray(),
        db
          .collection('operations_maintenance')
          .find({}, { projection: { _id: 0 } })
          .sort({ at: -1 })
          .limit(30)
          .toArray(),
        db
          .collection('security_audit_logs')
          .find({}, { projection: { _id: 0, event: 1, endpoint: 1, code: 1, timestamp: 1 } })
          .sort({ created_at: -1 })
          .limit(30)
          .toArray(),
        mailPool.status(),
        users(db, '', 0)
      ]);
      const days = Array.from({ length: 7 }, (_, i) => dayKey(at - (6 - i) * DAY));
      res.json({
        code: 0,
        data: {
          at,
          timezone: 'UTC',
          totalUsers,
          activeUsers7Days: active,
          subscriptionServiceEnabled: false,
          ...page,
          pool,
          requests,
          maintenance,
          anomalies,
          days: days.map((day) => ({
            day,
            visits: visits.some((r) => r.day === day)
              ? visits.filter((r) => r.day === day).reduce((n, r) => n + r.visits, 0)
              : null,
            requests: requests.some((r) => r.day === day)
              ? requests.filter((r) => r.day === day).reduce((n, r) => n + r.requests, 0)
              : null,
            failures: requests.some((r) => r.day === day)
              ? requests.filter((r) => r.day === day).reduce((n, r) => n + r.failures, 0)
              : null
          }))
        }
      });
    } catch {
      res.status(503).json({ code: 503, message: '运营数据暂时无法读取，请重试' });
    }
  };
  return { handler, recordRequest, recordVisit, recordMaintenance, recordActivity, flush: () => Promise.all(pending) };
}
