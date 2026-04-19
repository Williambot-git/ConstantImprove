/**
 * affiliateUtils.js — Shared affiliate utility functions
 *
 * DRY: normalizeAffiliateCode is used by both paymentController.js (checkout
 * flow) and refRoute.js (referral link clicks). Keeping it here avoids the
 * duplication that existed before this extraction.
 */

/**
 * Normalize an affiliate/referral code for safe database lookup and storage.
 *
 * Strip anything that isn't alphanumeric, underscore, or hyphen. Truncate to
 * 64 chars (matching the affiliates.username column max length). Return null
 * for empty/whitespace-only input.
 *
 * Why strip special chars? Affiliate codes come from URL paths and form inputs.
 * Allowing only [a-zA-Z0-9_-] prevents injection and ensures consistent lookup.
 *
 * @param {string|undefined|null} value  Raw affiliate code from request
 * @returns {string|null}                 Normalized code or null if invalid
 */
const normalizeAffiliateCode = (value) => {
  const normalized = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return normalized || null;
};

module.exports = { normalizeAffiliateCode };
