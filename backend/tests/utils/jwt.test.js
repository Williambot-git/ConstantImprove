/**
 * jwt.js unit tests
 * Tests all 5 exported functions: generateToken, generateRefreshToken,
 * verifyToken, verifyRefreshToken, decodeToken.
 *
 * Security-critical: these functions handle all access/refresh token
 * lifecycle for the entire application. Tests cover happy paths, error
 * paths (expired/invalid/revoked tokens), and option overrides.
 */

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn(),
  decode: jest.fn(),
}));

jest.mock('../../src/config/jwt', () => ({
  secret: 'test-jwt-secret',
  expiresIn: '15m',
  refreshSecret: 'test-refresh-secret',
  refreshExpiresIn: '7d',
}));

const jwt = require('../../src/utils/jwt');
const jwtLib = require('jsonwebtoken');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('generateToken', () => {
  test('signs payload with jwt secret and default expiry', () => {
    const payload = { userId: 123 };
    jwtLib.sign.mockReturnValue('signed.token.here');
    const result = jwt.generateToken(payload);
    expect(jwtLib.sign).toHaveBeenCalledWith(payload, 'test-jwt-secret', { expiresIn: '15m' });
    expect(result).toBe('signed.token.here');
  });

  test('signs with custom options merged with default expiry', () => {
    const payload = { userId: 456 };
    jwtLib.sign.mockReturnValue('custom-signed-token');
    const result = jwt.generateToken(payload, { issuer: 'test-app' });
    expect(jwtLib.sign).toHaveBeenCalledWith(payload, 'test-jwt-secret', { expiresIn: '15m', issuer: 'test-app' });
    expect(result).toBe('custom-signed-token');
  });

  test('accepts empty payload', () => {
    jwtLib.sign.mockReturnValue('empty-payload-token');
    const result = jwt.generateToken({});
    expect(jwtLib.sign).toHaveBeenCalledWith({}, 'test-jwt-secret', { expiresIn: '15m' });
    expect(result).toBe('empty-payload-token');
  });
});

describe('generateRefreshToken', () => {
  test('signs payload with refresh secret and 7d expiry', () => {
    const payload = { userId: 789 };
    jwtLib.sign.mockReturnValue('refresh.signed.token');
    const result = jwt.generateRefreshToken(payload);
    expect(jwtLib.sign).toHaveBeenCalledWith(payload, 'test-refresh-secret', { expiresIn: '7d' });
    expect(result).toBe('refresh.signed.token');
  });

  test('signs with custom options merged with default expiry', () => {
    const payload = { userId: 101 };
    jwtLib.sign.mockReturnValue('refresh-custom-token');
    const result = jwt.generateRefreshToken(payload, { notBefore: '2d' });
    expect(jwtLib.sign).toHaveBeenCalledWith(payload, 'test-refresh-secret', { expiresIn: '7d', notBefore: '2d' });
    expect(result).toBe('refresh-custom-token');
  });
});

describe('verifyToken', () => {
  test('returns decoded payload when token is valid', () => {
    const payload = { userId: 123, email: 'test@example.com' };
    jwtLib.verify.mockReturnValue(payload);
    const result = jwt.verifyToken('valid-token');
    expect(jwtLib.verify).toHaveBeenCalledWith('valid-token', 'test-jwt-secret', {});
    expect(result).toBe(payload);
  });

  test('returns null when token is invalid (throws)', () => {
    jwtLib.verify.mockImplementation(() => { throw new Error('invalid signature'); });
    const result = jwt.verifyToken('invalid-token');
    expect(result).toBeNull();
  });

  test('returns null when token is expired', () => {
    jwtLib.verify.mockImplementation(() => { throw new Error('jwt expired'); });
    const result = jwt.verifyToken('expired-token');
    expect(result).toBeNull();
  });

  test('passes custom options to verify', () => {
    const payload = { userId: 999 };
    jwtLib.verify.mockReturnValue(payload);
    jwt.verifyToken('some-token', { algorithms: ['HS256'] });
    expect(jwtLib.verify).toHaveBeenCalledWith('some-token', 'test-jwt-secret', { algorithms: ['HS256'] });
  });

  test('returns null on any error', () => {
    jwtLib.verify.mockImplementation(() => { throw new Error('some other error'); });
    expect(jwt.verifyToken('bad-token')).toBeNull();
  });
});

describe('verifyRefreshToken', () => {
  test('returns decoded payload when token is valid', () => {
    const payload = { userId: 555 };
    jwtLib.verify.mockReturnValue(payload);
    const result = jwt.verifyRefreshToken('valid-refresh-token');
    expect(jwtLib.verify).toHaveBeenCalledWith('valid-refresh-token', 'test-refresh-secret', {});
    expect(result).toBe(payload);
  });

  test('returns null when token is invalid', () => {
    jwtLib.verify.mockImplementation(() => { throw new Error('invalid refresh'); });
    const result = jwt.verifyRefreshToken('invalid-refresh');
    expect(result).toBeNull();
  });

  test('returns null when token is expired', () => {
    jwtLib.verify.mockImplementation(() => { throw new Error('refresh expired'); });
    const result = jwt.verifyRefreshToken('expired-refresh');
    expect(result).toBeNull();
  });

  test('passes custom options to verify', () => {
    const payload = { userId: 777 };
    jwtLib.verify.mockReturnValue(payload);
    jwt.verifyRefreshToken('token', { audience: 'test' });
    expect(jwtLib.verify).toHaveBeenCalledWith('token', 'test-refresh-secret', { audience: 'test' });
  });
});

describe('decodeToken', () => {
  test('decodes token without verifying signature', () => {
    const decoded = { header: { alg: 'HS256' }, payload: { userId: 123 } };
    jwtLib.decode.mockReturnValue(decoded);
    const result = jwt.decodeToken('any.token.here');
    expect(jwtLib.decode).toHaveBeenCalledWith('any.token.here');
    expect(result).toBe(decoded);
  });

  test('decode returns null for malformed token', () => {
    jwtLib.decode.mockReturnValue(null);
    const result = jwt.decodeToken('not-a-jwt');
    expect(result).toBeNull();
  });

  test('decode passthrough returns full decode result', () => {
    const fullDecoded = { header: {}, payload: { exp: 9999999999 }, signature: 'abc' };
    jwtLib.decode.mockReturnValue(fullDecoded);
    const result = jwt.decodeToken('well-formed.jwt.token');
    expect(result).toBe(fullDecoded);
  });
});
