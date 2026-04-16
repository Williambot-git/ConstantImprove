// AhoyVPN Backend — ESLint flat config
// ESLint v9+ uses this file automatically; no .eslintrc needed
module.exports = [
  {
    files: ["src/**/*.js", "tests/**/*.js", "scripts/**/*.js"],
    ignores: ["node_modules/", "coverage/", "*.test.js"],
    languageOptions: {
      globals: {
        // Node.js
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        Buffer: "readonly",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        // Express
        req: "readonly",
        res: "readonly",
        next: "readonly",
        // Jest
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        jest: "readonly",
      },
      sourceType: "commonjs",
    },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
];
