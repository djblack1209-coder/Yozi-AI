import crypto from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';

function buildJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerBase64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${headerBase64}.${payloadBase64}`).digest('base64url');

  return `${headerBase64}.${payloadBase64}.${signature}`;
}

const originalJwtSecret = process.env.JWT_SECRET;

afterEach(() => {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

describe('shared auth verifyJWT', () => {
  it('marks activity only after authentication has passed', async () => {
    process.env.JWT_SECRET = 'unit_test_secret';
    const { requireAuth } = await import('../../laf-backend/functions/_shared/auth-middleware');
    const ctx = {
      headers: {
        authorization: 'Bearer ' + buildJwt({ userId: 'active_user', exp: Date.now() + 60_000 }, process.env.JWT_SECRET)
      }
    };
    expect(requireAuth(ctx).userId).toBe('active_user');
    expect(ctx.authenticatedUserId).toBe('active_user');
    const denied = { headers: { authorization: 'Bearer invalid' } };
    expect(requireAuth(denied).code).toBe(401);
    expect(denied.authenticatedUserId).toBeUndefined();
  });
  it('returns payload for valid token', async () => {
    process.env.JWT_SECRET = 'unit_test_secret';
    const { verifyJWT } = await import('../../laf-backend/functions/_shared/auth');

    const exp = Date.now() + 60_000;
    const token = buildJwt({ userId: 'u_auth_1', role: 'user', exp }, process.env.JWT_SECRET);

    const payload = verifyJWT(token);
    expect(payload).toBeTruthy();
    expect(payload.userId).toBe('u_auth_1');
    expect(payload.role).toBe('user');
  });

  it('returns null when JWT_SECRET is missing', async () => {
    delete process.env.JWT_SECRET;
    const { verifyJWT } = await import('../../laf-backend/functions/_shared/auth');

    const token = buildJwt({ userId: 'u_auth_2', exp: Date.now() + 60_000 }, 'another_secret');
    expect(verifyJWT(token)).toBeNull();
  });

  it('returns null when signature length mismatches', async () => {
    process.env.JWT_SECRET = 'unit_test_secret';
    const { verifyJWT } = await import('../../laf-backend/functions/_shared/auth');

    const token = buildJwt({ userId: 'u_auth_3', exp: Date.now() + 60_000 }, process.env.JWT_SECRET);
    const [h, p, s] = token.split('.');
    const tampered = `${h}.${p}.${s.slice(0, -1)}`;

    expect(verifyJWT(tampered)).toBeNull();
  });

  it('supports bearer extraction and secret config check', async () => {
    process.env.JWT_SECRET = 'unit_test_secret';
    const { extractBearerToken, isJwtSecretConfigured } = await import('../../laf-backend/functions/_shared/auth');

    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(extractBearerToken('  Bearer   token123  ')).toBe('token123');
    expect(extractBearerToken('Bearer')).toBe('');
    expect(extractBearerToken('Bearer   ')).toBe('');
    expect(extractBearerToken('  ')).toBe('');
    expect(extractBearerToken(123)).toBe('');
    expect(isJwtSecretConfigured()).toBe(true);
  });
});
