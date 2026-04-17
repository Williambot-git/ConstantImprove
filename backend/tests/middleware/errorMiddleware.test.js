/**
 * errorMiddleware — Unit Tests
 * ==============================
 * Tests both exported functions in src/middleware/errorMiddleware.js:
 *   - notFound(req, res, next) — creates 404 error with req.originalUrl
 *   - errorHandler(err, req, res, next) — formats error response by status code
 *
 * These are Express error-handling middleware (4-arg signature). They are
 * registered at the app level and handle 404s (notFound) and all thrown
 * errors (errorHandler). Production vs development only affects stack
 * trace exposure — the function signature and logic are identical.
 */

const { notFound, errorHandler } = require('../../src/middleware/errorMiddleware');

describe('errorMiddleware', () => {
  describe('notFound', () => {
    it('creates error with req.originalUrl in message', () => {
      const req = { originalUrl: '/api/vpn/servers' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      notFound(req, res, next);

      const errorPassed = next.mock.calls[0][0];
      expect(errorPassed.message).toBe('Not found - /api/vpn/servers');
    });

    it('sets res.status to 404', () => {
      const req = { originalUrl: '/api/unknown' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      notFound(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('passes error to next middleware', () => {
      const req = { originalUrl: '/api/test' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      notFound(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    });
  });

  describe('errorHandler', () => {
    let originalEnv;

    beforeEach(() => {
      // Capture and restore NODE_ENV between tests since errorHandler
      // reads process.env.NODE_ENV to decide stack trace visibility.
      originalEnv = process.env.NODE_ENV;
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('returns 500 when res.statusCode is 200 (default error)', () => {
      const err = new Error('Database connection failed');
      const req = {};
      const res = {
        statusCode: 200,
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('preserves existing status code when not 200', () => {
      const err = new Error('Forbidden');
      const req = {};
      const res = {
        statusCode: 403,
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns error message in response body', () => {
      const err = new Error('Something went wrong');
      const req = {};
      const res = {
        statusCode: 500,
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      errorHandler(err, req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Something went wrong' })
      );
    });

    it('exposes stack trace in development mode', () => {
      process.env.NODE_ENV = 'development';
      const err = new Error('Dev error');
      err.stack = 'Error: Dev error\n    at Test.fn (test.js:10:5)';

      const req = {};
      const res = {
        statusCode: 500,
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      errorHandler(err, req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ stack: expect.any(String) })
      );
    });

    it('hides stack trace in production mode', () => {
      process.env.NODE_ENV = 'production';
      const err = new Error('Production error');
      err.stack = 'Error: Production error\n    at Test.fn (test.js:10:5)';

      const req = {};
      const res = {
        statusCode: 500,
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      errorHandler(err, req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ stack: null })
      );
    });

    it('handles 400 status code correctly', () => {
      const err = new Error('Bad request');
      const req = {};
      const res = {
        statusCode: 400,
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Bad request' })
      );
    });
  });
});
