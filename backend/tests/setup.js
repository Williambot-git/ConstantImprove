// Set test environment variables before any imports
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://placeholder:placeholder@localhost:5432/ahoyvpn_test';
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.REDIS_URL = 'redis://placeholder:placeholder@localhost:6379';
// Suppress console noise during tests
if (!global.console) global.console = {};
global.console.log = global.console.log || function() {};
global.console.error = global.console.error || function() {};
