const User = require('../models/userModel');
const db = require('../config/database');
const VpnResellersService = require('./vpnResellersService');
const paymentConfig = require('../config/paymentConfig');
const crypto = require('crypto');
const { validatePasswordComplexity } = require('../middleware/passwordValidation');

const vpnResellersService = new VpnResellersService();
const PLAN_DURATION_DAYS = {
  month: 30,
  quarter: 90,
  semi_annual: 183,
  year: 365
};

// Generate a random password for VPN account
function generateVpnPassword(length = 12) {
  return crypto.randomBytes(length).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, length);
}

function resolvePlanId(interval) {
  const lookup = paymentConfig.vpnResellers.planIds || {};
  return lookup[String(interval || '').toLowerCase()] || null;
}

function resolvePlanDuration(interval) {
  return PLAN_DURATION_DAYS[String(interval || '').toLowerCase()] || PLAN_DURATION_DAYS.month;
}

async function createUser(email = null, planKey = null) {
  // Check if email already exists
  if (email) {
    const existing = await User.findByEmail(email);
    if (existing) {
      throw new Error('Email already in use');
    }
  }
  
  // Create numeric account (for customer identification)
  // But force password change on first login for PCI compliance
  const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days trial
  
  const user = await User.createNumericAccount({
    email,
    trialEndsAt
  });
  
  // Note: User will be forced to set a password on first login
  // This meets PCI DSS Requirement 8.3.1
  
  return user;
}

// Create user with user-set password (for admin/affiliate registration)
async function createUserWithPassword(email, password, isAffiliate = false) {
  // Validate email
  if (!email) {
    throw new Error('Email is required');
  }
  
  // Check if email already exists
  const existing = await User.findByEmail(email);
  if (existing) {
    throw new Error('Email already in use');
  }
  
  // Validate password complexity
  const validation = validatePasswordComplexity(password);
  if (!validation.valid) {
    throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
  }
  
  // Create user with user-set password
  const user = await User.create({
    email,
    password,
    isAffiliate
  });
  
  return user;
}

async function getPlanIdByKey(planKey) {
  const intervalMap = {
    monthly: 'month',
    quarterly: 'quarter',
    semiAnnual: 'semi_annual',
    annual: 'year'
  };
  const interval = intervalMap[planKey];
  if (!interval) {
    throw new Error('Invalid plan key');
  }
  const query = 'SELECT id FROM plans WHERE interval = $1 LIMIT 1';
  const result = await db.query(query, [interval]);
  if (result.rows.length === 0) {
    throw new Error('Plan not found in database');
  }
  return result.rows[0].id;
}

async function createSubscription(userId, planKey, paymentMethod = null, affiliateId = null) {
  const planId = await getPlanIdByKey(planKey);
  
  // Check for existing active subscription
  const existingSub = await db.query(
    `SELECT id FROM subscriptions 
     WHERE user_id = $1 AND status = 'active' 
     AND current_period_end > NOW()`,
    [userId]
  );
  
  if (existingSub.rows.length > 0) {
    throw new Error('User already has an active subscription');
  }
  
  // Calculate dates based on plan
  const now = new Date();
  let periodEnd = new Date(now);
  
  switch (planKey) {
    case 'monthly':
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      break;
    case 'quarterly':
      periodEnd.setMonth(periodEnd.getMonth() + 3);
      break;
    case 'semiAnnual':
      periodEnd.setMonth(periodEnd.getMonth() + 6);
      break;
    case 'annual':
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      break;
    default:
      periodEnd.setMonth(periodEnd.getMonth() + 1);
  }
  
  const subscription = await db.query(
    `INSERT INTO subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end, created_at, updated_at)
     VALUES (uuid_generate_v4(), $1, $2, 'active', $3, $4, NOW(), NOW())
     RETURNING *`,
    [userId, planId, now, periodEnd]
  );
  
  // Update user's trial ends at if they had one
  await db.query(
    `UPDATE users SET trial_ends_at = NULL, updated_at = NOW() WHERE id = $1`,
    [userId]
  );
  
  return subscription.rows[0];
}

async function getUserWithSubscription(userId) {
  const userQuery = `
    SELECT u.*, 
           s.plan_id, s.status as subscription_status, s.current_period_end,
           p.name as plan_name, p.interval as plan_interval, p.price_cents
    FROM users u
    LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
    LEFT JOIN plans p ON s.plan_id = p.id
    WHERE u.id = $1
  `;
  
  const userResult = await db.query(userQuery, [userId]);
  
  if (userResult.rows.length === 0) {
    throw new Error('User not found');
  }
  
  return userResult.rows[0];
}

async function getUserSubscription(userId) {
  const query = `
    SELECT s.*, p.name as plan_name, p.interval, p.amount_cents, p.currency
    FROM subscriptions s
    JOIN plans p ON s.plan_id = p.id
    WHERE s.user_id = $1 AND s.status = 'active'
    ORDER BY s.created_at DESC
    LIMIT 1
  `;
  const result = await db.query(query, [userId]);
  if (result.rows.length === 0) {
    return null;
  }
  const subscription = result.rows[0];
  // Map interval to plan_key (used by frontend)
  const intervalMap = {
    'month': 'monthly',
    'quarter': 'quarterly',
    'semi_annual': 'semiAnnual',
    'year': 'annual'
  };
  subscription.plan_key = intervalMap[subscription.interval] || subscription.interval;
  // Also provide camelCase version for frontend compatibility
  subscription.planKey = subscription.plan_key;
  return subscription;
}

/**
 * Create a new VPN account or extend an existing one.
 *
 * @param {number} userId          - The user ID
 * @param {string} accountNumber    - PureWL account number (used in username prefix)
 * @param {string} planInterval     - 'month', 'quarter', 'semi_annual', or 'year'
 * @param {{ renew?: boolean }} opts - Options
 * @param {boolean} opts.renew      - If true, extends expiry on the existing vpn_accounts
 *                                    row instead of creating new VPN Resellers credentials.
 *                                    Used by ARB subscription renewal webhooks to prevent
 *                                    orphaning the user's current credentials each month.
 */
async function createVpnAccount(userId, accountNumber, planInterval, { renew = false } = {}) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  if (!resolvePlanId(planInterval)) {
    throw new Error(`VPN Resellers plan ID not configured for interval '${planInterval}'`);
  }

  // ── Renewal path: extend expiry on existing VPN account, no new credentials ──
  // When an ARB subscription fires its monthly renewal webhook we do NOT want to
  // create fresh VPN Resellers credentials (that orphans the old sub-account).
  // Instead we extend the expiry on the row we already have.
  if (renew) {
    const existing = await db.query(
      'SELECT id, purewl_uuid, purewl_username, purewl_password FROM vpn_accounts WHERE user_id = $1',
      [userId]
    );
    if (existing.rows.length > 0) {
      const durationDays = resolvePlanDuration(planInterval);
      const newExpiry = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
      const newExpiryYmd = newExpiry.toISOString().slice(0, 10);

      // Update local expiry
      await db.query(
        'UPDATE vpn_accounts SET expiry_date = $1, updated_at = NOW() WHERE user_id = $2',
        [newExpiryYmd, userId]
      );

      // Sync expiry to VPN Resellers so the server recognises it
      const { purewl_uuid: existingUuid } = existing.rows[0];
      if (existingUuid) {
        try {
          await vpnResellersService.setExpiry(existingUuid, newExpiryYmd);
        } catch (warn) {
          console.warn('Failed to sync VPN Resellers expiry during renewal:', warn.message || warn);
        }
      }

      const updated = await db.query('SELECT * FROM vpn_accounts WHERE user_id = $1', [userId]);
      return {
        username: updated.rows[0]?.purewl_username,
        password: updated.rows[0]?.purewl_password,   // unchanged — kept from original creation
        accountId: existingUuid,
        account: updated.rows[0],
        renewed: true                                 // signals this was a renewal, not a fresh create
      };
    }
    // No existing row — fall through to normal creation (first-time setup after a gap)
  }

  const baseUsername = `user_${accountNumber}`;
  let username = baseUsername;
  const password = generateVpnPassword();

  // Ensure username is available
  try {
    const check = await vpnResellersService.checkUsername(baseUsername);
    const checkMsg = check?.data?.message || '';
    if (!/not taken/i.test(checkMsg)) {
      username = `${baseUsername}_${Date.now().toString().slice(-4)}`;
    }
  } catch (error) {
    // If check endpoint fails, fall back to a randomized username
    username = `${baseUsername}_${Date.now().toString().slice(-4)}`;
  }

  // VPN Resellers v3.2 create account endpoint accepts username/password
  const created = await vpnResellersService.createAccount({ username, password });
  const createdData = created?.data || created;
  const accountId = createdData?.id ? String(createdData.id) : null;

  if (!accountId) {
    throw new Error('VPN Resellers account ID missing from create response');
  }

  // Set expiry based on selected billing interval
  const durationDays = resolvePlanDuration(planInterval);
  const expiryDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  const expiryDateYmd = expiryDate.toISOString().slice(0, 10);

  try {
    await vpnResellersService.setExpiry(accountId, expiryDateYmd);
  } catch (error) {
    console.warn('Failed setting VPN Resellers expiry date:', error.message || error);
  }

  const allowedCountries = createdData?.allowed_countries || [];

  const result = await db.query(
    `INSERT INTO vpn_accounts (user_id, purewl_username, purewl_password, purewl_uuid, expiry_date, status, allowed_countries, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'active', $6::jsonb, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       purewl_username = EXCLUDED.purewl_username,
       purewl_password = EXCLUDED.purewl_password,
       purewl_uuid = EXCLUDED.purewl_uuid,
       expiry_date = EXCLUDED.expiry_date,
       status = EXCLUDED.status,
       allowed_countries = EXCLUDED.allowed_countries,
       updated_at = NOW()
     RETURNING *`,
    [userId, username, password, accountId, expiryDate, JSON.stringify(allowedCountries)]
  );

  return {
    username,
    password,
    accountId,
    account: result.rows[0]
  };
}

module.exports = {
  createUser,
  createUserWithPassword,
  createSubscription,
  getUserWithSubscription,
  getUserSubscription,
  createVpnAccount,
  getPlanIdByKey
};
