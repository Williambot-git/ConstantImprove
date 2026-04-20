/**
 * URL Inference Utilities
 * ======================
 * Centralizes the logic for inferring the application's base URL from incoming
 * HTTP requests. This handles the proxy scenario where x-forwarded-* headers
 * tell us the original URL the client used, even though the request arrived
 * at an internal address.
 *
 * Used throughout the codebase wherever we need to construct callback URLs,
 * redirect URLs, or links back to the frontend — instead of hardcoding
 * FRONTEND_URL in every location.
 *
 * @module urlUtils
 */

/**
 * Default fallback base URL when no forwarded headers are present.
 * In production, this should match the publicly visible frontend URL.
 * @type {string}
 */
const DEFAULT_FRONTEND_URL = process.env.FRONTEND_URL || 'https://ahoyvpn.net';

/**
 * Default fallback API base URL when no forwarded headers are present.
 * @type {string}
 */
const DEFAULT_API_BASE_URL = process.env.API_BASE_URL || 'https://api.ahoyvpn.net';

/**
 * Infer the application's base URL from an HTTP request.
 *
 * Proxies (nginx, load balancers, CDN) set x-forwarded-proto and x-forwarded-host
 * to preserve the original URL the client requested. We use these to build correct
 * redirect/callback URLs even when the server hears the request on an internal port.
 *
 * @param {object} req - Express request object
 * @returns {{ appBaseUrl: string, apiBaseUrl: string, baseUrl: string }}
 */
function inferBaseUrls(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  const directHost = req.headers.host;

  // Build the URL the client actually used (or would have used)
  const inferredUrl = (forwardedHost || directHost)
    ? `${forwardedProto || 'https'}://${forwardedHost || directHost}`
    : null;

  // Strip trailing slashes and /api suffix to get the frontend base
  const appBaseUrl = (inferredUrl || DEFAULT_FRONTEND_URL)
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '');

  // Strip /api suffix to get the API base (or use inferredUrl as-is if it has no /api)
  let apiBaseUrl;
  if (inferredUrl) {
    apiBaseUrl = inferredUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
  } else {
    apiBaseUrl = DEFAULT_API_BASE_URL;
  }

  return {
    appBaseUrl,
    apiBaseUrl,
    baseUrl: appBaseUrl,
  };
}

module.exports = { inferBaseUrls, DEFAULT_FRONTEND_URL, DEFAULT_API_BASE_URL };
