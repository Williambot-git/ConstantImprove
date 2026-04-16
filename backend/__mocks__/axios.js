/**
 * Manual mock for the axios library.
 * Placed at __mocks__/axios.js so that jest.mock('axios') automatically uses this.
 *
 * Supports TWO usage patterns:
 * 1. axios.get(url, config) — used by plisioService (module-level get/post)
 * 2. axios.create(config).get/post/put() — used by purewlService (instance methods)
 *
 * Key design:
 * - Module-level get/post/put are the canonical jest.fn() mocks.
 * - axios.create(config) returns an instance whose get/post/put DELEGATE to the
 *   module-level functions. This ensures that when a service does:
 *     axios.create(...); client = result; client.get(...)
 *   the module-level mock records the call AND tests can queue responses via:
 *     require('axios').get.mockResolvedValueOnce(...)
 *   (works for BOTH patterns since they use the same underlying functions).
 *
 * - The instance also has defaults.baseURL and defaults.headers populated from config,
 *   so tests can verify: service.client.defaults.baseURL === '...'
 */

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();

// axios.create(config) returns an instance with methods that delegate to module-level mocks.
// This ensures module-level mock state (including mockResolvedValueOnce queues) is shared
// between direct axios.get() calls and axios.create().get() calls.
const createAxiosInstance = (config = {}) => ({
  get: mockGet,
  post: mockPost,
  put: mockPut,
  defaults: {
    baseURL: config.baseURL || '',
    headers: { ...config.headers },
  },
});

module.exports = {
  get: mockGet,
  post: mockPost,
  put: mockPut,
  create: createAxiosInstance,
  // Expose the instance for tests that need direct access without spyOn:
  //   require('axios').__mockInstance__.post.mockResolvedValueOnce(...)
  // For purewlService (uses create), the instance is from the last create() call.
  __mockInstance__: createAxiosInstance(),
};
