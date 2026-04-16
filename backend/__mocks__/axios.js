/**
 * Manual mock for the axios library.
 * Placed at __mocks__/axios.js so that jest.mock('axios') automatically uses this.
 *
 * The service (plisioService) calls axios.get(url, config), so we need:
 * - axios.get: a jest mock function that returns promises (mockResolvedValue, mockRejectedValue)
 *
 * This is the standard Jest manual mock pattern — much cleaner than factory functions.
 */

const mockGet = jest.fn();

module.exports = {
  get: mockGet
};
