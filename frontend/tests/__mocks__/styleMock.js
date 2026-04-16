/**
 * AhoyVPN Frontend — CSS Mock for Jest
 * ====================================
 * CSS Modules, regular CSS imports, Less, SCSS, etc. are all mocked as empty objects.
 * 
 * WHY: Jest doesn't process CSS — it just needs to not crash when encountering
 * @import or require() of stylesheets. We return an empty object as the "module."
 * 
 * IMPORTANT: Components that apply styles via CSS Modules won't have those styles
 * applied in tests. This is acceptable for unit tests — we test logic/behavior,
 * not styling. Style testing is better done with visual regression tools.
 */
module.exports = {};
