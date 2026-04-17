/**
 * bcrypt manual mock — placed at backend/__mocks__/bcrypt.js
 * Tests control compare/hash behavior via jest.mockResolvedValueOnce / mockReturnValueOnce
 */
const compareMock = jest.fn(() => Promise.resolve(true));
const hashMock = jest.fn(() => Promise.resolve('hashed-password'));

module.exports = {
  hash: hashMock,
  compare: compareMock,
};
