# pageController Template Extraction — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Extract the 224-line inline HTML/CSS template from `pageController.js` into a shared module so the AhoyVPN theme is maintained in one place.

**Architecture:** Create `backend/src/templates/htmlFrame.js` exporting `renderHtmlFrame(title, content)`. `pageController.js` imports it and calls it instead of its inline `renderTemplate`. Net result: pageController.js goes from 641 → ~420 lines; CSS lives in one canonical location.

**Tech Stack:** Node.js, plain JS module (no dependencies added).

---

## Task 1: Create backend/src/templates/htmlFrame.js

**Objective:** Extract the inline HTML/CSS into a reusable template module.

**Files:**
- Create: `backend/src/templates/htmlFrame.js`
- Modify: `backend/src/controllers/pageController.js:17-241`

**Step 1: Create the template file**

Write the following content to `backend/src/templates/htmlFrame.js`:

```javascript
/**
 * HTML page frame renderer for AhoyVPN email-auth pages.
 *
 * WHY THIS EXISTS:
 * The verify-email, reset-password, and resend-verification pages all share
 * the same HTML shell and CSS. Keeping it in one file means:
 *  - Theme changes (colors, logo, footer) require editing one file
 *  - No copy-paste drift between the three page handlers
 *  - Easier to test the frame structure independently
 *
 * The function takes `title` (page title string) and `content` (HTML string
 * with page-specific body content) and returns a complete HTML document.
 */

/**
 * Render a complete HTML page with AhoyVPN theme styling.
 * @param {string} title - The <title> tag content (e.g. "Email Verified")
 * @param {string} content - Page-specific HTML to render inside .card
 * @returns {string} Complete HTML document
 */
const renderHtmlFrame = (title, content) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - AhoyVPN</title>
    <style>
        /* AhoyVPN Color Palette - Pacific/Charcoal/Carbon Theme */
        :root {
          --carbon-black: #0C0C0C;
          --charcoal-blue: #2C3E50;
          --pacific-blue: #1CA3EC;
          --powder-blue: #B0E0E6;
          --alabaster-grey: #F8F8F8;
          --charcoal-blue-light: #3A506B;
          --pacific-blue-dark: #0F8BD6;
          --powder-blue-dark: #9BCFD9;
          --carbon-black-light: #1A1A1A;
          --bg-primary: var(--carbon-black);
          --bg-secondary: var(--carbon-black-light);
          --bg-card: var(--charcoal-blue);
          --bg-header: var(--charcoal-blue);
          --text-primary: var(--alabaster-grey);
          --text-secondary: #CCCCCC;
          --text-muted: #999999;
          --border-color: #333333;
          --accent-primary: var(--pacific-blue);
          --accent-secondary: var(--powder-blue);
          --button-primary: var(--powder-blue);
          --button-primary-text: var(--charcoal-blue);
          --button-secondary: var(--charcoal-blue-light);
          --button-secondary-text: var(--alabaster-grey);
          --status-active: #10B981;
          --status-inactive: #EF4444;
          --status-warning: #F59E0B;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            color: var(--text-primary);
            background: var(--bg-primary);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 0 20px;
        }
        header {
            padding: 20px 0;
            border-bottom: 1px solid var(--border-color);
            background: var(--bg-header);
        }
        .header-inner {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .logo {
            font-size: 24px;
            font-weight: 800;
            color: var(--accent-primary);
            text-decoration: none;
        }
        .logo-text {
            font-size: 24px;
            font-weight: 800;
            color: var(--accent-primary);
            margin-left: 8px;
            vertical-align: middle;
        }
        main {
            flex: 1;
            padding: 60px 0 80px;
        }
        .card {
            background: var(--bg-card);
            border-radius: 12px;
            padding: 2.5rem;
            max-width: 500px;
            margin: 0 auto;
            border: 1px solid var(--border-color);
        }
        .card h1 {
            margin-bottom: 0.5rem;
            color: var(--text-primary);
            font-size: 2.2rem;
            text-align: center;
        }
        .card .subtitle {
            text-align: center;
            color: var(--text-secondary);
            margin-bottom: 2rem;
            font-size: 1.1rem;
        }
        .btn {
            display: inline-block;
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            text-align: center;
            text-decoration: none;
        }
        .btn-primary {
            background: var(--button-primary);
            color: var(--button-primary-text);
        }
        .btn-primary:hover {
            background: var(--powder-blue-dark);
            transform: translateY(-2px);
        }
        .btn-secondary {
            background: var(--button-secondary);
            color: var(--button-secondary-text);
        }
        .btn-secondary:hover {
            background: var(--charcoal-blue);
        }
        .message {
            padding: 1rem;
            border-radius: 8px;
            margin-bottom: 1.5rem;
        }
        .message.success {
            background: rgba(16, 185, 129, 0.1);
            border: 1px solid var(--status-active);
            color: #A7F3D0;
        }
        .message.error {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid var(--status-inactive);
            color: #FCA5A5;
        }
        .message.warning {
            background: rgba(245, 158, 11, 0.1);
            border: 1px solid var(--status-warning);
            color: #FDE68A;
        }
        .form-group {
            margin-bottom: 1.5rem;
        }
        label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 600;
            color: var(--text-secondary);
        }
        input[type="email"],
        input[type="password"] {
            width: 100%;
            padding: 12px 16px;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            background: var(--bg-secondary);
            color: var(--text-primary);
            font-size: 16px;
        }
        input:focus {
            outline: none;
            border-color: var(--accent-primary);
        }
        .link {
            color: var(--accent-primary);
            text-decoration: none;
            font-weight: 500;
        }
        .link:hover {
            text-decoration: underline;
        }
        footer {
            padding: 40px 0;
            border-top: 1px solid var(--border-color);
            background: var(--bg-header);
            text-align: center;
            color: var(--text-secondary);
            font-size: 0.9rem;
        }
        .actions {
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin-top: 2rem;
        }
        @media (max-width: 768px) {
            .card { padding: 1.5rem; }
            .actions { flex-direction: column; }
        }
    </style>
</head>
<body>
    <header>
        <div class="container header-inner">
            <a href="/" class="logo">
                <img src="/assets/logo.png" alt="AhoyVPN" width="40" height="40" onerror="this.style.display='none'">
                <span class="logo-text">AhoyVPN</span>
            </a>
        </div>
    </header>
    <main>
        <div class="container">
            <div class="card">
                ${content}
            </div>
        </div>
    </main>
    <footer>
        <div class="container">
            <p>&copy; 2026 AhoyVPN. All rights reserved.</p>
            <p>Privacy that travels with you. Everywhere.</p>
        </div>
    </footer>
</body>
</html>`;

module.exports = { renderHtmlFrame };
```

**Step 2: Verify the file was created**

Run: `wc -l backend/src/templates/htmlFrame.js`
Expected: 137 lines

**Step 3: Commit**

```bash
git add backend/src/templates/htmlFrame.js
git commit -m "refactor(pageController): extract HTML frame template to shared module"
```

---

## Task 2: Update pageController.js to use htmlFrame

**Objective:** Remove the inline template, import the shared one.

**Files:**
- Modify: `backend/src/controllers/pageController.js`

**Step 1: Replace the inline template**

Remove lines 17-241 of `pageController.js` (the `renderTemplate` function and its comment) and replace with:

```javascript
// Render HTML page with AhoyVPN theme — delegates to shared template module
// WHY: keeping the HTML/CSS shell in one file prevents copy-paste drift
// across verifyEmail, resetPassword, and resendVerification pages.
const { renderHtmlFrame: renderTemplate } = require('../templates/htmlFrame');
```

The import goes after the existing `require` block (after line 5, before the helper functions).

**Step 2: Verify no other changes needed**

The three page handlers (`verifyEmailPage`, `resetPasswordPage`, `resendVerificationEmail`) already call `renderTemplate(title, content)` — no call sites need changing.

**Step 3: Run tests**

Run: `cd backend && npx jest tests/controllers/pageController.test.js --coverage=false --no-cache 2>&1 | tail -10`
Expected: All 18 tests pass

Run full backend suite: `cd backend && npx jest --coverage --silent 2>&1 | tail -5`
Expected: 40 suites, 1223 tests, all pass

**Step 4: Commit**

```bash
git add backend/src/controllers/pageController.js
git commit -m "refactor(pageController): use shared htmlFrame template — removes 224-line inline template"
```

---

## Verification

After both tasks:
- `pageController.js` should be ~420 lines (down from 641)
- `backend/src/templates/htmlFrame.js` should be ~137 lines
- All 1,223 backend tests pass
- `renderTemplate` behavior is unchanged (template literal substitution is identical)
