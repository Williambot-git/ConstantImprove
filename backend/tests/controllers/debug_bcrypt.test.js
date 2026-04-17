/**
 * Debug test for bcrypt mocking
 */
process.env.NODE_ENV = 'test';

const mockBcryptCompare = jest.fn();
const mockBcryptHash = jest.fn();

jest.mock('bcrypt', () => ({
  hash: mockBcryptHash,
  compare: mockBcryptCompare,
}));

describe('bcrypt mock debug', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBcryptHash.mockReset();
    mockBcryptHash.mockImplementation(() => Promise.resolve('hashed-password'));
    mockBcryptCompare.mockReset();
    mockBcryptCompare.mockImplementation(() => Promise.resolve(true));
  });

  test('mockImplementation returns true by default', async () => {
    const result = await mockBcryptCompare('password', 'hash');
    console.log('Default result:', result);
    expect(result).toBe(true);
  });

  test('mockResolvedValueOnce(false) overrides mockImplementation', async () => {
    mockBcryptCompare.mockResolvedValueOnce(false);
    const result = await mockBcryptCompare('password', 'hash');
    console.log('Once false result:', result);
    expect(result).toBe(false);
  });

  test('second call falls back to mockImplementation', async () => {
    mockBcryptCompare.mockResolvedValueOnce(false);
    const r1 = await mockBcryptCompare('a', 'b');
    const r2 = await mockBcryptCompare('c', 'd');
    console.log('r1:', r1, 'r2:', r2);
    expect(r1).toBe(false);
    expect(r2).toBe(true); // should fall back to mockImplementation
  });
});
