// Set test environment variables before any imports
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://placeholder:***@localhost:5432/ahoyvpn_test';
process.env.JWT_SECRET='test-j...tion';
process.env.REDIS_URL = 'redis://placeholder:***@localhost:6379';

// Suppress console noise during tests.
// WHY WE OVERRIDE INSTEAD OF WRAP: global.console.error is already a native function,
// so `global.console.error = global.console.error || function(){}` is a no-op (|| sees
// a truthy left-hand side and never uses the right-hand side). We must unconditionally
// replace the methods to suppress output that pollutes test runner output.
if (!global.console) global.console = {};
global.console.log = function() {};   // suppress info/debug noise
global.console.warn = function() {};   // suppress deprecation/advisory noise
global.console.error = function() {};  // suppress expected-error-path logging
