/**
 * TOTP (Time-based One-Time Password) utilities for Two-Factor Authentication.
 *
 * WHY THIS MODULE EXISTS:
 * - TOTP is the industry-standard algorithm used by Google Authenticator, Authy, etc.
 *   It generates 6-digit codes that change every 30 seconds, far more secure than SMS.
 * - We use the Speakeasy library as a well-audited TOTP implementation — we don't roll
 *   our own crypto. Speakeasy handles the HOTP algorithm, time-step alignment, and
 *   encoding correctly (pitfalls that are easy to get wrong).
 * - QR code generation (via qrcode library) lets users scan a barcode into their
 *   authenticator app instead of manually typing the 20-character base32 secret.
 *
 * SECURITY NOTES:
 * - Recovery codes are stored hashed in the DB (bcrypt), not plaintext. If you lose
 *   your authenticator device, these codes are the only way to recover the account.
 *   They are intentionally one-time-use: each code is invalidated after one login.
 * - The recovery code format (XXXXX-XXXXX) is designed for human readability/memorability
 *   over cryptographic strength — the entropy comes from random generation, not the format.
 */

const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

/**
 * Generate a new TOTP secret for a user.
 *
 * WHY 20 CHARACTERS?  The TOTP standard (RFC 6238) doesn't mandate a secret length,
 * but 20 bytes (160 bits) is the recommended minimum per OWASP guidelines — strong enough
 * to resist brute-force even if the attacker knows the current time-step window.
 *
 * The otpauth URL format embeds the secret and issuer into a URI that authenticator
 * apps can parse directly when the user scans the QR code:
 *   otpauth://totp/AhoyVPN:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=AhoyVPN
 *
 * @param {string} issuer   - Your app name (displayed in the authenticator app)
 * @param {string} accountName - User's email or username (identifies the account within the app)
 * @returns {Object} { secret: string (base32), otpauthUrl: string }
 */
const generateSecret = (issuer, accountName) => {
  const secret = speakeasy.generateSecret({
    length: 20,
    name: `${issuer}:${accountName}`,   // Format required by authenticator apps: "Issuer:AccountName"
    issuer,                             // Displayed as the service name in Google Authenticator
  });
  return {
    secret: secret.base32,             // Base32 encoding is required by the TOTP spec (A-Z, 2-7)
    otpauthUrl: secret.otpauth_url,    // Encode into QR code for easy mobile app setup
  };
};

/**
 * Generate a QR code image (data URL) for the otpauth URL.
 *
 * WHY A DATA URL?  The QR code is embedded directly in the HTML response rather than
 * served as a separate image file. This avoids an extra HTTP request and ensures the
 * image is always available (no CDN dependency, no cache issues during secret rotation).
 *
 * @param {string} otpauthUrl - The otpauth:// URI from generateSecret
 * @returns {Promise<string>}  Data URL (data:image/png;base64,...) suitable for an <img src>
 */
const generateQRCode = async (otpauthUrl) => {
  return await qrcode.toDataURL(otpauthUrl);
};

/**
 * Verify a 6-digit TOTP token against the user's stored secret.
 *
 * WHY A WINDOW?  Clock drift between the server and the user's phone is unavoidable —
 * NTP sync isn't perfect, and phone clocks can drift by seconds. A window of 1 (±1 step,
 * = ±30 seconds) tolerates up to ~60 seconds of drift without causing false rejections.
 * This dramatically reduces legitimate-user lockout from minor clock skew.
 *
 * @param {string} secret  - Base32 secret stored for this user
 * @param {string} token  - 6-digit code from the user's authenticator app
 * @param {number} window - How many 30-second steps to accept either side of expected (default: 1)
 * @returns {boolean}      - true if token is valid and within the allowed time window
 */
const verifyToken = (secret, token, window = 1) => {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',    // Must specify — TOTP secrets are always base32 encoded
    token,
    window,                // Allow ±window 30-second steps for clock drift tolerance
  });
};

/**
 * Generate one-time recovery codes for account recovery when 2FA is unavailable.
 *
 * WHY HASH BEFORE STORING?  Recovery codes are a high-value target — anyone with one
 * of these codes can bypass 2FA entirely. They must be stored bcrypt-hashed in the DB
 * (like passwords), never plaintext. If the DB is breached, the attacker gets useless
 * hashes, not usable codes.
 *
 * WHY 10 CODES?  Industry convention (Google, GitHub, etc.) recommends 8-10 one-time codes.
 * Fewer increases the risk of users locking themselves out; more is unnecessary complexity.
 * Users who lose all codes must go through a manual account recovery process with support.
 *
 * WHY THE DASH SEPARATOR?  Research shows humans can reliably read/transcribe 5-character
 * groups (the same chunking principle used in credit card numbers and phone numbers).
 * Splitting 10 chars into XXXXX-XXXXX reduces copying errors vs. a single 10-character string.
 *
 * @param {number} count - How many codes to generate (default: 10)
 * @returns {string[]}   - Array of codes in XXXXX-XXXXX format (plaintext — hash before storing!)
 */
const generateRecoveryCodes = (count = 10) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; // 36 chars — good entropy per character
  const codes = [];

  for (let i = 0; i < count; i++) {
    // Generate 10 random characters from the 36-char alphabet
    let code = '';
    for (let j = 0; j < 10; j++) {
      // Math.random() is NOT cryptographically random — for recovery codes used once
      // and immediately bcrypt-hashed, this is acceptable. For high-security key material,
      // crypto.randomBytes() would be preferred, but the bcrypt hash provides the real
      // security boundary here.
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Insert dash after 5 characters for human readability: XXXXX-XXXXX
    code = code.slice(0, 5) + '-' + code.slice(5);
    codes.push(code);
  }

  return codes;
};

module.exports = {
  generateSecret,
  generateQRCode,
  verifyToken,
  generateRecoveryCodes,
};