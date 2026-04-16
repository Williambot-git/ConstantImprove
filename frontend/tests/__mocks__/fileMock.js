/**
 * AhoyVPN Frontend — Static File Mock for Jest
 * ============================================
 * Images, SVGs, and other static assets are mocked as empty strings.
 * 
 * WHY: Jest runs in Node.js — it can't load binary image files from disk.
 * Returning an empty string prevents crashes when code imports image files.
 * 
 * For snapshot tests that need the "src" of an image, returning a predictable
 * string like '/test-image-stub' lets us verify the correct file is being referenced.
 */
module.exports = '/test-image-stub';
