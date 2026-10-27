import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  settings: { AUTH_DATABASE_URL: 'postgres://inert@localhost/test', AUTH_SECRET: 'inert', RESEND_API_KEY: 'inert', RESEND_FROM_EMAIL: 'inert@example.com' },
  query: vi.fn(), end: vi.fn(), info: vi.fn(), error: vi.fn(), pool: vi.fn(),
}));
vi.mock('../config.js', () => ({ config: mocks.settings }));
vi.mock('../logger.js', () => ({ logger: { info: mocks.info, error: mocks.error } }));
vi.mock('./engine.js', () => ({ authPool: mocks.pool }));
import { checkAuthReadiness } from './readiness.js';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.settings.AUTH_SECRET = 'inert';
  mocks.pool.mockReturnValue({ query: mocks.query, end: mocks.end });
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.end.mockResolvedValue(undefined);
});

it('checks private table access without retrieving identities and closes its connection', async () => {
  await checkAuthReadiness();
  expect(mocks.query.mock.calls[0]?.[0]).toContain('where false');
  expect(mocks.info).toHaveBeenCalledWith({ authentication: 'ready' }, 'Authentication database ready');
  expect(mocks.end).toHaveBeenCalledOnce();
});

it('logs only the setting name when configuration is missing', async () => {
  mocks.settings.AUTH_SECRET = '';
  await checkAuthReadiness();
  expect(mocks.error).toHaveBeenCalledWith({ reason: 'auth_settings_missing', missing: ['AUTH_SECRET'] }, 'Authentication readiness failed');
  expect(mocks.pool).not.toHaveBeenCalled();
});

it('distinguishes a missing migration and still closes the connection', async () => {
  mocks.query.mockRejectedValue({ code: '42P01', message: 'private diagnostic' });
  await checkAuthReadiness();
  expect(mocks.error).toHaveBeenCalledWith({ reason: 'auth_tables_missing' }, 'Authentication readiness failed');
  expect(mocks.end).toHaveBeenCalledOnce();
});

it('does not log a password or driver object on authentication failure', async () => {
  mocks.query.mockRejectedValue({ code: '28P01', message: 'password=private-marker', detail: 'secret SQL' });
  await checkAuthReadiness();
  expect(mocks.error).toHaveBeenCalledWith({ reason: 'database_password_rejected' }, 'Authentication readiness failed');
  expect(JSON.stringify(mocks.error.mock.calls)).not.toMatch(/private-marker|secret SQL/);
});
