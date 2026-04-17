# errorMiddleware + vpnController Tests Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add unit tests for two backend items at 0% coverage — errorMiddleware (16 lines, trivially coverable) and vpnController (connect/disconnect/getConnections stubs).

**Architecture:** Express middleware/controller pattern. errorMiddleware exports `notFound` and `errorHandler`. vpnController has stub functions that return 501.

**Tech Stack:** Jest, supertest-style mocking, db.query mocking via jest.mock('../config/database').

---

## Task 1: errorMiddleware Unit Tests

**Objective:** Write unit tests covering both exported functions in errorMiddleware.js

**Files:**
- Create: `backend/tests/middleware/errorMiddleware.test.js`
- Test subject: `backend/src/middleware/errorMiddleware.js`

**Step 1: Write failing test**

```javascript
// tests/middleware/errorMiddleware.test.js
const { notFound, errorHandler } = require('../../src/middleware/errorMiddleware');

describe('errorMiddleware', () => {
  describe('notFound', () => {
    it('creates error with correct message and 404 status', () => {
      const req = { originalUrl: '/api/test' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      notFound(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Not found - /api/test',
      }));
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('errorHandler', () => {
    it('returns 500 when res.statusCode is 200', () => {
      const err = new Error('Test error');
      const req = {};
      const res = { statusCode: 200, status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Test error',
      }));
    });

    it('uses existing res.statusCode when not 200', () => {
      const err = new Error('Not found');
      const req = {};
      const res = { statusCode: 404, status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('hides stack trace in production', () => {
      const err = new Error('Test');
      const req = {};
      const res = { statusCode: 500, status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      errorHandler(err, req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        stack: null,
      }));

      process.env.NODE_ENV = originalEnv;
    });

    it('exposes stack trace in development', () => {
      const err = new Error('Test');
      const req = {};
      const res = { statusCode: 500, status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      errorHandler(err, req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        stack: expect.any(String),
      }));

      process.env.NODE_ENV = originalEnv;
    });
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd backend && npx jest tests/middleware/errorMiddleware.test.js -v`
Expected: FAIL — file doesn't exist yet

**Step 3: Create minimal implementation**

errorMiddleware.js already exists at 16 lines with correct implementations — just needs tests.

**Step 4: Run test to verify pass**

Run: `cd backend && npx jest tests/middleware/errorMiddleware.test.js -v`
Expected: PASS — all 6 tests pass

**Step 5: Check coverage**

Run: `cd backend && npx jest tests/middleware/errorMiddleware.test.js --coverage`
Expected: 100% line, branch, function coverage

**Step 6: Commit**

```bash
cd /tmp/Decontaminate/backend
git add tests/middleware/errorMiddleware.test.js
git commit -m "test(backend): add errorMiddleware unit tests (6 cases, 100% coverage)"
```

---

## Task 2: vpnController Unit Tests

**Objective:** Write unit tests for vpnController functions (getServers, getWireGuardConfig, getOpenVPNConfig, connect, disconnect, getConnections)

**Files:**
- Create: `backend/tests/controllers/vpnController.test.js`
- Test subject: `backend/src/controllers/vpnController.js`

**Step 1: Explore the code**

Read `backend/src/controllers/vpnController.js`. It exports:
- `getServers` — returns static server list (us-east, us-west, eu-central)
- `getWireGuardConfig` — looks up vpn_accounts row, calls vpnResellersService.getAccount(), generates WireGuard config
- `getOpenVPNConfig` — similar to WireGuard but generates OpenVPN config
- `connect` — 501 stub
- `disconnect` — 501 stub
- `getConnections` — 501 stub

**Step 2: Write tests for getServers, getWireGuardConfig, getOpenVPNConfig**

```javascript
// tests/controllers/vpnController.test.js
const vpnController = require('../../src/controllers/vpnController');
const vpnResellersService = require('../../src/services/vpnResellersService');

jest.mock('../../src/services/vpnResellersService');

describe('vpnController', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = { user: { id: 1, email: 'test@example.com' } };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      set: jest.fn(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('getServers', () => {
    it('returns static server list with 200', async () => {
      await vpnController.getServers(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        servers: expect.any(Array),
      }));
      const servers = mockRes.json.mock.calls[0][0].servers;
      expect(servers.length).toBeGreaterThan(0);
      expect(servers[0]).toHaveKeys(['name', 'location', 'country', 'ip', 'protocols']);
    });
  });

  describe('getWireGuardConfig', () => {
    it('returns 401 when no user on req', async () => {
      const reqNoUser = {};
      await vpnController.getWireGuardConfig(reqNoUser, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('returns 404 when no vpn_account found', async () => {
      vpnResellersService.getAccount.mockResolvedValue(null);
      await vpnController.getWireGuardConfig(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('returns wireguard config on success', async () => {
      vpnResellersService.getAccount.mockResolvedValue({
        id: 1,
        username: 'wg_user',
        password: 'wg_pass',
        vpn_server_ip: '1.2.3.4',
        vpn_port: 51820,
        allowed_ips: '0.0.0.0/0',
      });
      await vpnController.getWireGuardConfig(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        type: 'wireguard',
        config: expect.stringContaining('[Interface]'),
      }));
    });
  });

  describe('getOpenVPNConfig', () => {
    it('returns 401 when no user on req', async () => {
      const reqNoUser = {};
      await vpnController.getOpenVPNConfig(reqNoUser, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('returns 404 when no vpn_account found', async () => {
      vpnResellersService.getAccount.mockResolvedValue(null);
      await vpnController.getOpenVPNConfig(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('returns openvpn config on success', async () => {
      vpnResellersService.getAccount.mockResolvedValue({
        id: 1,
        username: 'ovpn_user',
        password: 'ovpn_pass',
        vpn_server_ip: '1.2.3.4',
        vpn_port: 1194,
      });
      await vpnController.getOpenVPNConfig(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        type: 'openvpn',
        config: expect.stringContaining('client'),
      }));
    });
  });

  describe('connect / disconnect / getConnections', () => {
    it('connect returns 501 with daemon needed message', async () => {
      await vpnController.connect(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(501);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringContaining('daemon'),
      }));
    });

    it('disconnect returns 501 with daemon needed message', async () => {
      await vpnController.disconnect(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(501);
    });

    it('getConnections returns 501 with daemon needed message', async () => {
      await vpnController.getConnections(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(501);
    });
  });
});
```

**Step 3: Run test to verify failure**

Run: `cd backend && npx jest tests/controllers/vpnController.test.js -v`
Expected: FAIL — test file doesn't exist

**Step 4: Run test to verify pass after creation**

Expected: PASS — all 10+ tests pass

**Step 5: Check coverage**

Run: `cd backend && npx jest tests/controllers/vpnController.test.js --coverage`
Expected: >90% line coverage (connect/disconnect/getConnections return 501 in 1 line each)

**Step 6: Commit**

```bash
cd /tmp/Decontaminate/backend
git add tests/controllers/vpnController.test.js
git commit -m "test(backend): add vpnController unit tests (10 cases)"
```

---

## Verification

After all tasks:
```bash
cd /tmp/Decontaminate/backend && npm test -- --coverage --silent 2>&1 | tail -20
```

Expected:
- Backend: 917+ tests passing
- errorMiddleware: 100% coverage
- vpnController: >90% coverage
