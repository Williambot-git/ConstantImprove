/**
 * AhoyVPN Backend - Placeholder Configuration Consolidation
 * 
 * This file consolidates all environment variables used throughout the codebase
 * with placeholder defaults. In production, these should be set in .env or
 * environment-level configuration.
 * 
 * Usage: Import this file and destructure the configs you need:
 *   const { db, payment, vpn, email, security } = require('./config/placeholder-config');
 */

// =============================================================================
// DATABASE CONFIGURATION
// =============================================================================

const db = {
  // Primary database connection (PostgreSQL)
  // Used by: src/index.js, check_payout.js, setup-admin.js, migrate_final.js
  connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/ahoyvpn',
  
  // Enable SSL for production database connections
  // Used by: check_payout.js, setup-admin.js
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  
  // Affiliate/side database connection (separate database for affiliate system)
  // Used by: src/config/database.js
  affiliateConnectionString: process.env.DATABASE_AFFILIATE_URL || null,
  
  // Individual database connection components (alternative to DATABASE_URL)
  // Used by: check_env.js for environment diagnostics
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  name: process.env.DB_NAME || 'ahoyvpn',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
};

// =============================================================================
// PAYMENT PROCESSOR CONFIGURATIONS
// =============================================================================

const payment = {
  // ------------------ Plisio (Cryptocurrency) ------------------
  // Plisio API key for cryptocurrency payments
  // Used by: src/controllers/paymentController.js, src/controllers/webhookController.js,
  //         src/services/plisioService.js
  plisioApiKey: process.env.PLISIO_API_KEY || '',
  
  // Plisio webhook secret for verifying incoming webhooks
  // Used by: docs/COMPLETION_CHECKLIST.md
  plisioSecretKey: process.env.PLISIO_SECRET_KEY || '',
  
  // Plisio API base URL (typically https://plisio.net/api/v1)
  // Used by: src/config/paymentConfig.js
  plisioApiUrl: process.env.PLISIO_API_URL || 'https://plisio.net/api/v1',
  
  // Enable/disable Plisio polling for payment confirmation
  // Used by: src/index.js (DISABLE_PLISIO_POLLING check)
  disablePlisioPolling: process.env.DISABLE_PLISIO_POLLING === 'true',
  
  // ------------------ Authorize.net ------------------
  // Authorize.net API login ID for credit card processing
  // Used by: src/services/authorizeNetUtils.js, src/config/paymentConfig.js
  authorizeNetApiLoginId: process.env.AUTHORIZE_NET_API_LOGIN_ID || '',
  
  // Authorize.net transaction key
  // Used by: src/services/authorizeNetUtils.js, src/config/paymentConfig.js
  authorizeNetTransactionKey: process.env.AUTHORIZE_NET_TRANSACTION_KEY || '',
  
  // Authorize.net signature key for webhook verification
  // Used by: src/controllers/webhookController.js
  authorizeSignatureKey: process.env.AUTHORIZE_SIGNATURE_KEY || '',
  
  // Authorize.net environment (sandbox vs production)
  // Used by: src/config/paymentConfig.js (auto-set based on NODE_ENV)
  authorizeEnvironment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
  
  // Enable Authorize.net debug logging
  // Used by: src/controllers/paymentController.js (multiple DEBUG_AUTHORIZE_NET checks)
  debugAuthorizeNet: process.env.DEBUG_AUTHORIZE_NET === 'true',
  
  // ------------------ PaymentsCloud ------------------
  // PaymentsCloud secret for webhook signature verification
  // Used by: src/controllers/webhookController.js
  paycloudSecret: process.env.PAYCLOUD_SECRET || '',
  
  // ------------------ ZipTax (Sales Tax) ------------------
  // ZipTax API key for sales tax rate lookups
  // Used by: src/services/ziptaxService.js
  ziptaxApiKey: process.env.ZIPTAX_API_KEY || '',
  
  // Operating cost per user in dollars (used for margin calculations)
  // Used by: src/controllers/paymentController.js
  operatingCostPerUser: parseFloat(process.env.OPERATING_COST_PER_USER) || 1.20,
};

// =============================================================================
// VPN PROVIDER CONFIGURATIONS
// =============================================================================

const vpn = {
  // ------------------ VPNResellers ------------------
  // VPNResellers API token for account provisioning
  // Used by: src/config/paymentConfig.js
  vpnResellersApiToken: process.env.VPN_RESELLERS_API_TOKEN || '',
  
  // VPNResellers plan IDs for different subscription intervals
  // Used by: src/config/paymentConfig.js
  vpnResellersPlanIds: {
    month: process.env.VPN_RESELLERS_PLAN_MONTHLY_ID || '',
    quarter: process.env.VPN_RESELLERS_PLAN_QUARTERLY_ID || '',
    semiAnnual: process.env.VPN_RESELLERS_PLAN_SEMIANNUAL_ID || '',
    year: process.env.VPN_RESELLERS_PLAN_ANNUAL_ID || '',
  },
  
  // VPNResellers API base URL
  // Used by: src/config/paymentConfig.js
  vpnResellersApiUrl: process.env.VPN_RESELLERS_API_URL || 'https://api.vpnresellers.com',
  
  // ------------------ PureWL (Atom VPN) ------------------
  // PureWL API base URL
  // Used by: src/services/purewlService.js
  purewlBaseUrl: process.env.PUREWL_BASE_URL || 'https://atomapi.com',
  
  // PureWL secret key for API authentication
  // Used by: src/services/purewlService.js
  purewlSecretKey: process.env.PUREWL_SECRET_KEY || '',
  
  // PureWL reseller ID
  // Used by: src/services/purewlService.js
  purewlResellerId: process.env.PUREWL_RESELLER_ID || '',
};

// =============================================================================
// EMAIL / SMTP CONFIGURATION
// =============================================================================

const email = {
  // SMTP server hostname
  // Used by: src/services/emailService.js
  smtpHost: process.env.SMTP_HOST || 'smtp.example.com',
  
  // SMTP server port (typically 587 for TLS, 465 for SSL, 25 for plain)
  // Used by: src/services/emailService.js
  smtpPort: parseInt(process.env.SMTP_PORT) || 587,
  
  // Use TLS/SSL for SMTP connection
  // Used by: src/services/emailService.js
  smtpSecure: process.env.SMTP_SECURE === 'true',
  
  // SMTP authentication username
  // Used by: src/services/emailService.js
  smtpUser: process.env.SMTP_USER || '',
  
  // SMTP authentication password
  // Used by: src/services/emailService.js
  smtpPass: process.env.SMTP_PASS || '',
  
  // From address for transactional emails
  // Used by: src/services/emailService.js
  emailFromTransactional: process.env.EMAIL_FROM_TRANSACTIONAL || 'noreply@ahoyvpn.net',
};

// =============================================================================
// FRONTEND / API URL CONFIGURATIONS
// =============================================================================

const urls = {
  // Frontend application base URL
  // Used by: src/controllers/paymentController.js, src/controllers/pageController.js,
  //         src/controllers/affiliateController.js, src/controllers/customerController.js
  frontendUrl: process.env.FRONTEND_URL || 'https://ahoyvpn.net',
  
  // API base URL (fallback when frontend URL not available)
  // Used by: src/controllers/paymentController.js
  apiBaseUrl: process.env.API_BASE_URL || 'https://api.ahoyvpn.net',
  
  // CORS allowed origin
  // Used by: src/index.js
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};

// =============================================================================
// SECURITY CONFIGURATIONS
// =============================================================================

const security = {
  // ------------------ JWT / Authentication ------------------
  // JWT secret for signing access tokens (15m expiry)
  // Used by: src/controllers/customerController.js, src/controllers/adminController.js,
  //         src/controllers/ahoymanController.js, src/controllers/affiliateController.js,
  //         src/controllers/affiliateAuthController.js, src/middleware/authMiddleware_new.js
  jwtSecret: process.env.JWT_SECRET || 'your-jwt-secret-change-in-production',
  
  // Refresh token secret (7d expiry)
  // Used by: src/controllers/customerController.js, src/controllers/adminController.js,
  //         src/controllers/ahoymanController.js, src/controllers/affiliateController.js,
  //         src/controllers/affiliateAuthController.js
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || 'your-refresh-token-secret-change-in-production',
  
  // ------------------ CSRF Protection ------------------
  // CSRF secret for token generation
  // Used by: src/middleware/authMiddleware_new.js (CSRF token generation)
  csrfSecret: process.env.CSRF_SECRET || 'your-csrf-secret-change-in-production',
  
  // Node environment (development, production, test)
  // Used by: src/index.js, src/controllers/customerController.js,
  //         src/middleware/securityMiddleware.js (various production checks)
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Disable cleanup jobs flag
  // Used by: src/index.js (DISABLE_CLEANUP check)
  disableCleanup: process.env.DISABLE_CLEANUP === 'true',
};

// =============================================================================
// RATE LIMITING CONFIGURATIONS
// =============================================================================

const rateLimiting = {
  // Rate limit window in milliseconds (default: 15 minutes)
  // Used by: src/index.js
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  
  // Maximum requests per window
  // Used by: src/index.js
  maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
};

// =============================================================================
// REDIS CONFIGURATION
// =============================================================================

const redis = {
  // Redis connection URL for session/cache storage
  // Used by: tests/setup.js
  url: process.env.REDIS_URL || 'redis://localhost:6379',
};

// =============================================================================
// AFFILIATE CONFIGURATIONS
// =============================================================================

const affiliate = {
  // Minimum payout threshold in cents
  // Used by: src/controllers/affiliateDashboardController.js
  minPayoutCents: parseInt(process.env.MIN_PAYOUT_CENTS) || 1000, // default $10
};

// =============================================================================
// PLAN PRICING CONFIGURATION
// =============================================================================

const PLANS = {
  // Plan pricing in dollars (these should match the database plan records)
  // Used by: src/config/paymentConfig.js (plan pricing references)
  monthly: parseFloat(process.env.PLAN_PRICE_MONTHLY) || 9.99,
  quarterly: parseFloat(process.env.PLAN_PRICE_QUARTERLY) || 24.99,
  semiAnnual: parseFloat(process.env.PLAN_PRICE_SEMIANNUAL) || 44.99,
  annual: parseFloat(process.env.PLAN_PRICE_ANNUAL) || 79.99,
};

// =============================================================================
// SERVER CONFIGURATION
// =============================================================================

const server = {
  // Server port
  // Used by: src/index.js
  port: parseInt(process.env.PORT) || 3000,
};

// =============================================================================
// EXPORT ALL CONFIGURATIONS
// =============================================================================

module.exports = {
  // Database
  db,
  
  // Payment processors
  payment,
  
  // VPN providers
  vpn,
  
  // Email/SMTP
  email,
  
  // URL configurations
  urls,
  
  // Security
  security,
  
  // Rate limiting
  rateLimiting,
  
  // Redis
  redis,
  
  // Affiliate
  affiliate,
  
  // Plan pricing
  PLANS,
  
  // Server
  server,
};
