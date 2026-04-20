/**
 * logger.js unit tests
 *
 * WHY THIS FILE EXISTS:
 * logger.js is the sole logging utility for the entire backend. All services,
 * middleware, and controllers route their output through it. Testing it ensures
 * log output is consistent, level-filtering works correctly, and the env-based
 * level detection behaves as expected in different NODE_ENV / LOG_LEVEL combos.
 *
 * APPROACH: Since logger reads process.env at load time, we test each behavior
 * by calling the logger methods and verifying which console.* methods are invoked.
 * We mock console.error/warn/log at the global level and restore them after.
 */

const { spawn } = require('child_process');

// Runs a snippet as a subprocess with isolated env, returns captured stdout/stderr
const runWithEnv = (env, snippet) => {
  return new Promise((resolve) => {
    const child = spawn(
      'node',
      ['-e', snippet],
      { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let sout = '';
    let serr = '';
    child.stdout.on('data', (d) => { sout += d.toString(); });
    child.stderr.on('data', (d) => { serr += d.toString(); });
    child.on('close', () => resolve({ stdout: sout, stderr: serr }));
  });
};

describe('logger.js', () => {
  describe('level filtering — LOG_LEVEL env var', () => {
    test('error always prints regardless of LOG_LEVEL', async () => {
      const { stderr } = await runWithEnv(
        { LOG_LEVEL: 'error', NODE_ENV: 'production' },
        `
        const log = require('./src/utils/logger');
        log.error('err-test', { code: 'E001' });
        `
      );
      expect(stderr).toMatch(/\[ERROR\] err-test.*"code":"E001"/);
    });

    test('warn does NOT print when LOG_LEVEL=error', async () => {
      const { stdout, stderr } = await runWithEnv(
        { LOG_LEVEL: 'error', NODE_ENV: 'production' },
        `
        const log = require('./src/utils/logger');
        log.warn('should-not-appear');
        `
      );
      const combined = stdout + stderr;
      expect(combined).not.toMatch(/WARN/);
    });

    test('warn prints when LOG_LEVEL=warn', async () => {
      const { stderr } = await runWithEnv(
        { LOG_LEVEL: 'warn', NODE_ENV: 'production' },
        `
        const log = require('./src/utils/logger');
        log.warn('warn-test');
        `
      );
      expect(stderr).toMatch(/\[WARN\] warn-test/);
    });

    test('info prints when LOG_LEVEL=info', async () => {
      const { stdout } = await runWithEnv(
        { LOG_LEVEL: 'info', NODE_ENV: 'production' },
        `
        const log = require('./src/utils/logger');
        log.info('info-test');
        `
      );
      expect(stdout).toMatch(/\[INFO\] info-test/);
    });

    test('info does NOT print when LOG_LEVEL=warn', async () => {
      const { stdout, stderr } = await runWithEnv(
        { LOG_LEVEL: 'warn', NODE_ENV: 'production' },
        `
        const log = require('./src/utils/logger');
        log.info('should-not-appear');
        `
      );
      const combined = stdout + stderr;
      expect(combined).not.toMatch(/INFO/);
    });

    test('debug prints when LOG_LEVEL=debug', async () => {
      const { stdout } = await runWithEnv(
        { LOG_LEVEL: 'debug', NODE_ENV: 'production' },
        `
        const log = require('./src/utils/logger');
        log.debug('debug-test');
        `
      );
      expect(stdout).toMatch(/\[DEBUG\] debug-test/);
    });

    test('debug does NOT print when LOG_LEVEL=info', async () => {
      const { stdout, stderr } = await runWithEnv(
        { LOG_LEVEL: 'info', NODE_ENV: 'production' },
        `
        const log = require('./src/utils/logger');
        log.debug('should-not-appear');
        `
      );
      const combined = stdout + stderr;
      expect(combined).not.toMatch(/DEBUG/);
    });

    test('unknown LOG_LEVEL falls back to info', async () => {
      const { stdout } = await runWithEnv(
        { LOG_LEVEL: 'not_a_level', NODE_ENV: 'production' },
        `
        const log = require('./src/utils/logger');
        log.info('info-after-bad-level');
        `
      );
      expect(stdout).toMatch(/\[INFO\] info-after-bad-level/);
    });
  });

  describe('level filtering — NODE_ENV defaults (no LOG_LEVEL set)', () => {
    test('production NODE_ENV defaults to info (suppresses debug)', async () => {
      const { stdout, stderr } = await runWithEnv(
        { NODE_ENV: 'production' },
        `
        const log = require('./src/utils/logger');
        log.info('prod-info');
        log.debug('prod-debug-should-not-appear');
        `
      );
      const combined = stdout + stderr;
      expect(combined).toMatch(/\[INFO\] prod-info/);
      expect(combined).not.toMatch(/DEBUG.*prod-debug/);
    });

    test('development NODE_ENV defaults to debug', async () => {
      const { stdout } = await runWithEnv(
        { NODE_ENV: 'development' },
        `
        const log = require('./src/utils/logger');
        log.debug('dev-debug');
        `
      );
      expect(stdout).toMatch(/\[DEBUG\] dev-debug/);
    });

    test('unknown NODE_ENV defaults to debug', async () => {
      const { stdout } = await runWithEnv(
        { NODE_ENV: 'unknown_env' },
        `
        const log = require('./src/utils/logger');
        log.debug('unknown-env-debug');
        `
      );
      expect(stdout).toMatch(/\[DEBUG\] unknown-env-debug/);
    });
  });

  describe('output routing', () => {
    test('error uses console.error (stderr)', async () => {
      const { stderr, stdout } = await runWithEnv(
        { LOG_LEVEL: 'debug', NODE_ENV: 'production' },
        `
        const log = require('./src/utils/logger');
        log.error('routed-to-stderr');
        `
      );
      expect(stderr).toMatch(/\[ERROR\] routed-to-stderr/);
      expect(stdout).not.toMatch(/ERROR/);
    });

    test('warn uses console.warn (stderr)', async () => {
      const { stderr } = await runWithEnv(
        { LOG_LEVEL: 'debug', NODE_ENV: 'production' },
        `
        const log = require('./src/utils/logger');
        log.warn('routed-to-stderr');
        `
      );
      // In Node.js, console.warn writes to stderr, not stdout
      expect(stderr).toMatch(/\[WARN\] routed-to-stderr/);
    });

    test('info uses console.log (stdout)', async () => {
      const { stdout } = await runWithEnv(
        { LOG_LEVEL: 'debug', NODE_ENV: 'production' },
        `
        const log = require('./src/utils/logger');
        log.info('routed-to-stdout');
        `
      );
      expect(stdout).toMatch(/\[INFO\] routed-to-stdout/);
    });

    test('debug uses console.log (stdout)', async () => {
      const { stdout } = await runWithEnv(
        { LOG_LEVEL: 'debug', NODE_ENV: 'production' },
        `
        const log = require('./src/utils/logger');
        log.debug('debug-to-stdout');
        `
      );
      expect(stdout).toMatch(/\[DEBUG\] debug-to-stdout/);
    });
  });

  describe('formatMessage', () => {
    test('includes ISO timestamp', async () => {
      const { stderr } = await runWithEnv(
        { LOG_LEVEL: 'error', NODE_ENV: 'production' },
        `
        const log = require('./src/utils/logger');
        log.error('ts-test');
        `
      );
      // ISO format: 2026-04-20T02:00:00.000Z
      expect(stderr).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\]/);
    });

    test('level appears in uppercase brackets', async () => {
      const { stdout } = await runWithEnv(
        { LOG_LEVEL: 'info', NODE_ENV: 'production' },
        `
        const log = require('./src/utils/logger');
        log.info('caps-test');
        `
      );
      expect(stdout).toMatch(/\[INFO\] caps-test/);
    });

    test('non-empty meta appended as JSON', async () => {
      const { stderr } = await runWithEnv(
        { LOG_LEVEL: 'error', NODE_ENV: 'production' },
        `
        const log = require('./src/utils/logger');
        log.error('meta-test', { subscriptionId: 123, userId: 456 });
        `
      );
      expect(stderr).toMatch(/"subscriptionId":123/);
      expect(stderr).toMatch(/"userId":456/);
    });

    test('empty meta object produces no JSON suffix', async () => {
      const { stderr } = await runWithEnv(
        { LOG_LEVEL: 'error', NODE_ENV: 'production' },
        `
        const log = require('./src/utils/logger');
        log.error('no-meta');
        `
      );
      // Should be exactly: [TIMESTAMP] [ERROR] no-meta
      // with no trailing {}-style content
      expect(stderr).toMatch(/^\[.+?\]\s\[ERROR\]\sno-meta\s*$/);
    });

    test('meta with numeric and string values formats correctly', async () => {
      const { stderr } = await runWithEnv(
        { LOG_LEVEL: 'error', NODE_ENV: 'production' },
        `
        const log = require('./src/utils/logger');
        log.error('mixed-meta', { count: 42, name: 'test', active: true });
        `
      );
      expect(stderr).toMatch(/"count":42/);
      expect(stderr).toMatch(/"name":"test"/);
      expect(stderr).toMatch(/"active":true/);
    });
  });
});
