const db = require('../config/database');
const crypto = require('crypto');
const emailService = require('../services/emailService');
const log = require('../utils/logger');
const User = require('../models/userModel');

// --- Token helpers (used by verifyEmailPage and resetPasswordPage) ---
// Hash token (same as authController_csrf)
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Generate random token
const generateRandomToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Render HTML page with AhoyVPN theme — delegates to shared template module.
// WHY: keeping the HTML/CSS shell in one file prevents copy-paste drift
// across verifyEmail, resetPassword, and resendVerification pages.
const { renderHtmlFrame: renderTemplate } = require('../templates/htmlFrame');

// --- Email verification page ---
const verifyEmailPage = async (req, res) => {
  try {
    const { token } = req.params;
    
    if (!token) {
      return res.status(400).send(renderTemplate('Invalid Link', `
        <h1>Invalid Verification Link</h1>
        <p class="subtitle">The verification link is missing a token.</p>
        <div class="message error">
          <p>Please check the email we sent you and click the link again.</p>
        </div>
        <div class="actions">
          <a href="/" class="btn btn-secondary">Return Home</a>
          <a href="/contact" class="btn btn-primary">Contact Support</a>
        </div>
      `));
    }
    
    const tokenHash = hashToken(token);
    
    // Find token with user email
    const result = await db.query(
      `SELECT evt.*, u.id as user_id, u.email, u.email_verified
       FROM email_verify_tokens evt
       JOIN users u ON evt.user_id = u.id
       WHERE evt.token_hash = $1`,
      [tokenHash]
    );
    
    if (result.rows.length === 0) {
      // Token not found (invalid or already used)
      return res.status(400).send(renderTemplate('Invalid Link', `
        <h1>Invalid Verification Link</h1>
        <p class="subtitle">This verification link is invalid or has already been used.</p>
        <div class="message error">
          <p>If you haven't verified your email yet, you can request a new verification email below.</p>
        </div>
        <form id="resendForm" method="POST" action="/api/auth/resend-verification">
          <div class="form-group">
            <label for="email">Your Email Address</label>
            <input type="email" id="email" name="email" placeholder="you@example.com" required>
          </div>
          <button type="submit" class="btn btn-primary">Send New Verification Email</button>
        </form>
        <script>
          document.getElementById('resendForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const response = await fetch(e.target.action, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: formData.get('email') })
            });
            const data = await response.json();
            if (response.ok) {
              alert('A new verification email has been sent. Please check your inbox.');
            } else {
              alert('Error: ' + (data.error || 'Unable to send email.'));
            }
          });
        </script>
      `));
    }
    
    const verifyToken = result.rows[0];
    const userId = verifyToken.user_id;
    const email = verifyToken.email;
    const isExpired = new Date(verifyToken.expires_at) < new Date();
    
    if (isExpired) {
      // Token expired
      return res.status(400).send(renderTemplate('Link Expired', `
        <h1>Verification Link Expired</h1>
        <p class="subtitle">This verification link has expired.</p>
        <div class="message warning">
          <p>Verification links are valid for 24 hours. Please request a new one.</p>
        </div>
        <form id="resendForm" method="POST" action="/api/auth/resend-verification">
          <input type="hidden" name="email" value="${email}">
          <p>Click the button below to send a new verification email to <strong>${email}</strong>.</p>
          <button type="submit" class="btn btn-primary">Send New Verification Email</button>
        </form>
        <script>
          document.getElementById('resendForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const response = await fetch(e.target.action, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: formData.get('email') })
            });
            const data = await response.json();
            if (response.ok) {
              alert('A new verification email has been sent. Please check your inbox.');
            } else {
              alert('Error: ' + (data.error || 'Unable to send email.'));
            }
          });
        </script>
      `));
    }
    
    // Token valid and not expired
    // Check if already verified
    if (verifyToken.email_verified) {
      return res.send(renderTemplate('Already Verified', `
        <h1>Email Already Verified</h1>
        <p class="subtitle">Your email address has already been verified.</p>
        <div class="message success">
          <p>You can now log in to your AhoyVPN account.</p>
        </div>
        <div class="actions">
          <a href="/login" class="btn btn-primary">Go to Login</a>
          <a href="/" class="btn btn-secondary">Return Home</a>
        </div>
      `));
    }
    
    // Update user to verified
    await db.query(
      'UPDATE users SET email_verified = true WHERE id = $1',
      [userId]
    );
    
    // Delete used token
    await db.query('DELETE FROM email_verify_tokens WHERE id = $1', [verifyToken.id]);
    
    res.send(renderTemplate('Email Verified', `
      <h1>✅ Email Verified!</h1>
      <p class="subtitle">Your email has been successfully verified.</p>
      <div class="message success">
        <p>You can now log in to your AhoyVPN account.</p>
      </div>
      <div class="actions">
        <a href="/login" class="btn btn-primary">Go to Login</a>
        <a href="/" class="btn btn-secondary">Return Home</a>
      </div>
    `));
    
  } catch (error) {
    log.error('Verify email page error:', { error: error.message });
    res.status(500).send(renderTemplate('Error', `
      <h1>Something Went Wrong</h1>
      <p class="subtitle">An unexpected error occurred.</p>
      <div class="message error">
        <p>Please try again later or contact support.</p>
      </div>
      <div class="actions">
        <a href="/" class="btn btn-secondary">Return Home</a>
        <a href="/contact" class="btn btn-primary">Contact Support</a>
      </div>
    `));
  }
};

// --- Password reset page ---
const resetPasswordPage = async (req, res) => {
  try {
    const { token } = req.params;
    
    if (!token) {
      return res.status(400).send(renderTemplate('Invalid Link', `
        <h1>Invalid Reset Link</h1>
        <p class="subtitle">The password reset link is missing a token.</p>
        <div class="message error">
          <p>Please check the email we sent you and click the link again.</p>
        </div>
        <div class="actions">
          <a href="/" class="btn btn-secondary">Return Home</a>
          <a href="/forgot-password" class="btn btn-primary">Request New Reset</a>
        </div>
      `));
    }
    
    const tokenHash = hashToken(token);
    
    // Find valid, unused token
    const result = await db.query(
      `SELECT prt.*, u.id as user_id, u.email 
       FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.id
       WHERE prt.token_hash = $1 AND prt.used = false`,
      [tokenHash]
    );
    
    if (result.rows.length === 0) {
      // Token not found or already used
      return res.status(400).send(renderTemplate('Invalid Link', `
        <h1>Invalid Reset Link</h1>
        <p class="subtitle">This password reset link is invalid or has already been used.</p>
        <div class="message error">
          <p>You can request a new password reset link below.</p>
        </div>
        <form id="forgotForm" method="POST" action="/api/auth/forgot-password">
          <div class="form-group">
            <label for="email">Your Email Address</label>
            <input type="email" id="email" name="email" placeholder="you@example.com" required>
          </div>
          <button type="submit" class="btn btn-primary">Send New Reset Link</button>
        </form>
        <script>
          document.getElementById('forgotForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const response = await fetch(e.target.action, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: formData.get('email') })
            });
            const data = await response.json();
            if (response.ok) {
              alert('A new password reset link has been sent. Please check your inbox.');
            } else {
              alert('Error: ' + (data.error || 'Unable to send email.'));
            }
          });
        </script>
      `));
    }
    
    const resetToken = result.rows[0];
    const email = resetToken.email;
    const isExpired = new Date(resetToken.expires_at) < new Date();
    
    if (isExpired) {
      // Token expired
      return res.status(400).send(renderTemplate('Link Expired', `
        <h1>Reset Link Expired</h1>
        <p class="subtitle">This password reset link has expired.</p>
        <div class="message warning">
          <p>Password reset links are valid for 30 minutes. Please request a new one.</p>
        </div>
        <form id="forgotForm" method="POST" action="/api/auth/forgot-password">
          <input type="hidden" name="email" value="${email}">
          <p>Click the button below to send a new password reset link to <strong>${email}</strong>.</p>
          <button type="submit" class="btn btn-primary">Send New Reset Link</button>
        </form>
        <script>
          document.getElementById('forgotForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const response = await fetch(e.target.action, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: formData.get('email') })
            });
            const data = await response.json();
            if (response.ok) {
              alert('A new password reset link has been sent. Please check your inbox.');
            } else {
              alert('Error: ' + (data.error || 'Unable to send email.'));
            }
          });
        </script>
      `));
    }
    
    // Token valid and not expired – show reset form
    res.send(renderTemplate('Set New Password', `
      <h1>Set New Password</h1>
      <p class="subtitle">Enter your new password below.</p>
      <form id="resetPasswordForm" method="POST" action="/api/auth/reset-password">
        <input type="hidden" name="token" value="${token}">
        <div class="form-group">
          <label for="password">New Password</label>
          <input type="password" id="password" name="password" placeholder="At least 8 characters" required>
          <small style="color: var(--text-muted); display: block; margin-top: 0.5rem;">
            Must be at least 8 characters with a letter and number.
          </small>
        </div>
        <div class="form-group">
          <label for="confirmPassword">Confirm New Password</label>
          <input type="password" id="confirmPassword" name="confirmPassword" placeholder="Confirm your password" required>
        </div>
        <button type="submit" class="btn btn-primary">Reset Password</button>
      </form>
      <script>
        document.getElementById('resetPasswordForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          const password = formData.get('password');
          const confirmPassword = formData.get('confirmPassword');
          
          if (password.length < 8) {
            alert('Password must be at least 8 characters.');
            return;
          }
          if (!/(?=.*[a-zA-Z])(?=.*\\d)/.test(password)) {
            alert('Password must contain at least one letter and one number.');
            return;
          }
          if (password !== confirmPassword) {
            alert('Passwords do not match.');
            return;
          }
          
          const response = await fetch(e.target.action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: formData.get('token'), password })
          });
          const data = await response.json();
          if (response.ok) {
            alert('Password reset successful! You can now log in.');
            window.location.href = '/login';
          } else {
            alert('Error: ' + (data.error || 'Password reset failed.'));
          }
        });
      </script>
    `));
    
  } catch (error) {
    log.error('Reset password page error:', { error: error.message });
    res.status(500).send(renderTemplate('Error', `
      <h1>Something Went Wrong</h1>
      <p class="subtitle">An unexpected error occurred.</p>
      <div class="message error">
        <p>Please try again later or contact support.</p>
      </div>
      <div class="actions">
        <a href="/" class="btn btn-secondary">Return Home</a>
        <a href="/contact" class="btn btn-primary">Contact Support</a>
      </div>
    `));
  }
};

// --- Resend verification email (API) ---
const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const user = await User.findByEmail(email);
    if (!user) {
      // For security, don't reveal that user doesn't exist
      return res.status(200).json({ 
        success: true, 
        message: 'If an account exists with this email, a verification link has been sent.' 
      });
    }
    
    if (user.email_verified) {
      return res.status(400).json({ error: 'Email already verified' });
    }
    
    // Delete any existing verification tokens for this user
    await db.query('DELETE FROM email_verify_tokens WHERE user_id = $1', [user.id]);
    
    // Generate new token
    const verifyToken = generateRandomToken();
    const tokenHash = hashToken(verifyToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    // Store new token
    await db.query(
      'INSERT INTO email_verify_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );
    
    // Send verification email
    const frontendUrl = process.env.FRONTEND_URL || 'https://ahoyvpn.net';
    const verificationLink = `${frontendUrl}/verify-email/${verifyToken}`;
    
    // Log verification link for debugging (production logs go to monitoring)
    log.error("New verification link for :", {email: email, verificationLink: verificationLink});
    
    // Send email via emailService (if template exists)
    try {
      await emailService.sendTransactional(
        email,
        'Verify Your AhoyVPN Email',
        'verification',
        { verificationLink }
      );
    } catch (emailError) {
      log.error('Failed to send verification email:', { error: emailError.message });
    }
    
    res.status(200).json({
      success: true,
      message: 'If an account exists with this email, a verification link has been sent.',
    });
    
  } catch (error) {
    log.error('Resend verification error:', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  verifyEmailPage,
  resetPasswordPage,
  resendVerificationEmail,
};