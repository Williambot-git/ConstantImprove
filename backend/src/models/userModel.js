const db = require('../config/database');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { validatePasswordComplexity, isPasswordReused, hashPassword, addToPasswordHistory, SALT_ROUNDS } = require('../middleware/passwordValidation');

const User = {
  // Generate numeric account number (8 digits)
  generateAccountNumber() {
    return String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
  },

  // Generate numeric password (8 digits) - DEPRECATED for PCI compliance
  generateNumericPassword() {
    return String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
  },

  // Create numeric account (called after payment confirmation) - DEPRECATED
  async createNumericAccount({ email = null, trialEndsAt = null }) {
    // Generate numeric credentials
    const accountNumber = this.generateAccountNumber();
    const numericPassword = this.generateNumericPassword();
    const numericPasswordHash = await bcrypt.hash(numericPassword, SALT_ROUNDS);

    const query = `
      INSERT INTO users (
        email, password_hash, account_number, numeric_password_hash, 
        is_numeric_account, is_active, trial_ends_at, created_at, updated_at,
        password_changed_at, force_password_change
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW(), true)
      RETURNING id, account_number, numeric_password_hash, trial_ends_at, created_at
    `;
    
    const values = [
      email, // Optional email (not used for login)
      numericPasswordHash, // Store as password_hash for compatibility
      accountNumber,
      numericPasswordHash,
      true, // is_numeric_account
      true, // is_active
      trialEndsAt
    ];
    
    const result = await db.query(query, values);
    
    return {
      ...result.rows[0],
      numericPassword // Return plaintext password to show user once
    };
  },

  // Create numeric account with user-set password (PCI DSS compliant)
  async createNumericAccountWithPassword({ email, password, trialEndsAt = null }) {
    // Validate password complexity
    const validation = validatePasswordComplexity(password);
    if (!validation.valid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
    }

    // Generate account number
    const accountNumber = this.generateAccountNumber();
    
    // Hash the password
    const passwordHash = await hashPassword(password);

    const query = `
      INSERT INTO users (
        email, account_number, password_hash, is_numeric_account, is_active, 
        trial_ends_at, created_at, updated_at, password_changed_at, 
        force_password_change
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW(), false)
      RETURNING id, email, account_number, is_numeric_account, is_active, trial_ends_at, created_at
    `;
    
    const values = [
      email || null,
      accountNumber,
      passwordHash,
      true, // is_numeric_account
      false, // is_active (not active until purchase)
      trialEndsAt
    ];
    
    const result = await db.query(query, values);
    
    // Add to password history
    await addToPasswordHistory(result.rows[0].id, passwordHash);
    
    return result.rows[0];
  },

  // Create traditional email-based account with user-set password
  async create({ email, password, trialEndsAt, isAffiliate = false }) {
    // Validate password complexity
    const validation = validatePasswordComplexity(password);
    if (!validation.valid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
    }

    // Hash the password
    const passwordHash = await hashPassword(password);

    const query = `
      INSERT INTO users (
        email, password_hash, is_affiliate, is_active, trial_ends_at, 
        created_at, updated_at, password_changed_at, force_password_change
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW(), false)
      RETURNING id, email, is_affiliate, is_active, trial_ends_at, created_at
    `;
    
    const values = [
      email,
      passwordHash,
      isAffiliate,
      true, // is_active
      trialEndsAt
    ];
    
    const result = await db.query(query, values);
    
    // Add to password history
    await addToPasswordHistory(result.rows[0].id, passwordHash);
    
    return result.rows[0];
  },

  // Create admin user with user-set password
  async createAdmin({ username, password }) {
    // Validate password complexity
    const validation = validatePasswordComplexity(password);
    if (!validation.valid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
    }

    // Hash the password
    const passwordHash = await hashPassword(password);

    const query = `
      INSERT INTO admin_users (
        username, password_hash, role, is_active, created_at, updated_at
      )
      VALUES ($1, $2, 'admin', true, NOW(), NOW())
      RETURNING id, username, role, is_active
    `;
    
    const values = [username, passwordHash];
    
    const result = await db.query(query, values);
    
    return result.rows[0];
  },

  // Update user password with validation
  async updatePassword(userId, newPassword, oldPassword = null) {
    // Validate new password complexity
    const validation = validatePasswordComplexity(newPassword);
    if (!validation.valid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
    }

    // Check if password was used in last 4 passwords
    const isReused = await isPasswordReused(userId, newPassword);
    if (isReused) {
      throw new Error('Cannot reuse any of your last 4 passwords');
    }

    // If old password provided, verify it
    if (oldPassword) {
      const user = await this.findById(userId);
      const isValid = await bcrypt.compare(oldPassword, user.password_hash);
      if (!isValid) {
        throw new Error('Current password is incorrect');
      }
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password and clear force_password_change flag
    const query = `
      UPDATE users 
      SET password_hash = $1, 
          password_changed_at = NOW(), 
          force_password_change = false,
          updated_at = NOW()
      WHERE id = $2
      RETURNING id, email, password_changed_at
    `;
    
    const result = await db.query(query, [newPasswordHash, userId]);
    
    // Add to password history
    await addToPasswordHistory(userId, newPasswordHash);
    
    return result.rows[0];
  },

  // Find user by ID
  async findById(id) {
    const query = `SELECT * FROM users WHERE id = $1`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  },

  // Find user by email
  async findByEmail(email) {
    const query = `SELECT * FROM users WHERE email = $1`;
    const result = await db.query(query, [email]);
    return result.rows[0];
  },

  // Find user by account number
  async findByAccountNumber(accountNumber) {
    const query = `SELECT * FROM users WHERE account_number = $1`;
    const result = await db.query(query, [accountNumber]);
    return result.rows[0];
  },

  // Verify password
  async verifyPassword(userId, password) {
    const user = await this.findById(userId);
    if (!user) {
      return false;
    }
    return await bcrypt.compare(password, user.password_hash);
  },

  // Compare password directly with hash (used by authController)
  async comparePassword(password, hash) {
    if (!hash) return false;
    return await bcrypt.compare(password, hash);
  },

  // Check if password needs to be changed
  async needsPasswordChange(userId) {
    const user = await this.findById(userId);
    if (!user) {
      return false;
    }

    // Check force_password_change flag
    if (user.force_password_change) {
      return true;
    }

    // Check 90-day expiration
    const passwordChangedAt = new Date(user.password_changed_at);
    const now = new Date();
    const daysSinceChange = (now - passwordChangedAt) / (1000 * 60 * 60 * 24);

    return daysSinceChange > 90;
  },

  // Generic update — updates arbitrary fields for a user (called by authController for last_login)
  async update(userId, fields) {
    const setClauses = Object.keys(fields)
      .map((key, i) => `${key} = $${i + 2}`)
      .join(', ');
    const values = [userId, ...Object.values(fields)];
    const query = `UPDATE users SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`;
    const result = await db.query(query, values);
    return result.rows[0];
  },

  // Update last 2FA verification timestamp (called by verify2FALogin, verifyRecoveryCode)
  async updateLast2faVerification(userId) {
    const query = `UPDATE users SET last_2fa_verification = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`;
    const result = await db.query(query, [userId]);
    return result.rows[0];
  },

  // Store TOTP secret temporarily (not yet enabled) — called by enable2FA
  async setTotpSecret(userId, secret) {
    const query = `UPDATE users SET totp_secret = $1, updated_at = NOW() WHERE id = $2 RETURNING *`;
    const result = await db.query(query, [secret, userId]);
    return result.rows[0];
  },

  // Enable TOTP for a user (totp_enabled = true) — called by verify2FA after token validation
  async enableTotp(userId) {
    const query = `UPDATE users SET totp_enabled = true, updated_at = NOW() WHERE id = $1 RETURNING *`;
    const result = await db.query(query, [userId]);
    return result.rows[0];
  },

  // Generate and store recovery codes for a user — called by verify2FA
  async generateAndStoreRecoveryCodes(userId, count = 10) {
    const recoveryCodes = [];
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      recoveryCodes.push(code);
    }
    // Store hashed versions in DB (plaintext returned to user once only)
    const hashedCodes = recoveryCodes.map(code => crypto.createHash('sha256').update(code).digest('hex'));
    const query = `UPDATE users SET recovery_codes = $1, updated_at = NOW() WHERE id = $2 RETURNING *`;
    await db.query(query, [JSON.stringify(hashedCodes), userId]);
    return recoveryCodes; // Return plaintext for one-time display
  },

  // Verify a recovery code against stored hashed codes — called by verifyRecoveryCode
  async verifyRecoveryCode(userId, code) {
    const user = await this.findById(userId);
    if (!user || !user.recovery_codes) return false;
    const hashedInput = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
    try {
      const storedCodes = JSON.parse(user.recovery_codes);
      const index = storedCodes.indexOf(hashedInput);
      if (index === -1) return false;
      // Remove used code (one-time use)
      storedCodes.splice(index, 1);
      const query = `UPDATE users SET recovery_codes = $1, updated_at = NOW() WHERE id = $2 RETURNING *`;
      await db.query(query, [JSON.stringify(storedCodes), userId]);
      return true;
    } catch {
      return false;
    }
  },

  // Disable TOTP for a user — called by disable2FA
  async disableTotp(userId) {
    const query = `UPDATE users SET totp_enabled = false, totp_secret = NULL, recovery_codes = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`;
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }
};

module.exports = User;
