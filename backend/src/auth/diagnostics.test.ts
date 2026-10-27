import { expect, it } from 'vitest';
import { authFailureReason } from './diagnostics.js';

it('classifies PostgreSQL errors wrapped by adapters without exposing their messages', () => {
  expect(authFailureReason({ cause: { code: '28P01', message: 'password=private' } }))
    .toBe('database_password_rejected');
  expect(authFailureReason(new AggregateError([{ code: 'ENOTFOUND' }], 'private host')))
    .toBe('database_hostname_not_found');
});

it('never emits arbitrary error fields or inherited object properties', () => {
  for (const code of ['postgres://user:private@host', 'constructor', '__proto__', 'toString'])
    expect(authFailureReason({ code, message: 'private SQL and email' })).toBe('unexpected_auth_error');
});

it('terminates when a driver error has a cyclic cause', () => {
  const error: { cause?: unknown } = {};
  error.cause = error;
  expect(authFailureReason(error)).toBe('unexpected_auth_error');
});
