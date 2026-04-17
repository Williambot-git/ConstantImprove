/**
 * AhoyVPN Frontend — Babel Configuration
 * ======================================
 * Babel config for Jest transforms in the frontend test suite.
 * 
 * WHY PRESET-ENV + PRESET-REACT:
 * - preset-env handles modern JS (const, arrow functions, etc.) → CommonJS
 * - preset-react handles JSX → h() calls that Jest/jsdom can render
 * 
 * WHY NOT TSC (TypeScript)?
 * - The frontend codebase is plain JS/JSX, not TypeScript
 * - Adding tsc as a Jest transform adds build overhead for no benefit
 * - If TS is added later, add @babel/preset-typescript here
 */
module.exports = {
  presets: [
    ['@babel/preset-env', {
      // Target Node.js so babel doesn't need heavy polyfills
      targets: { node: 'current' },
    }],
    ['@babel/preset-react', {
      // React 19 JSX transform — no need to import React in every file
      runtime: 'automatic',
    }],
  ],
};
