/**
 * emailService unit tests
 * 
 * Tests email sending methods with mocked nodemailer transporter and template loading.
 * Uses jest.unstable_mockModule for nodemailer since it uses require() internally.
 */

// Mock transporter that will be shared across tests
const mockTransporter = {
  sendMail: jest.fn().mockResolvedValue({ messageId: 'test-msg-id' })
};

// Track fs.readFileSync calls to control return values per test
let fsMockImpl;
let fsCallCount = 0;

// Mock nodemailer before requiring emailService
jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransport: jest.fn().mockReturnValue(mockTransporter)
  }
}));

// Mock fs for template loading
jest.unstable_mockModule('fs', () => ({
  readFileSync: jest.fn((...args) => {
    fsCallCount++;
    if (fsMockImpl) {
      return fsMockImpl(...args);
    }
    return '<html>{{name}} - {{content}}</html>';
  })
}));

// Mock path
jest.unstable_mockModule('path', () => ({
  join: jest.fn().mockReturnValue('/mock/templates/test.html')
}));

const nodemailer = require('nodemailer');
const EmailService = require('../../src/services/emailService');

// Replace the actual transporter on the singleton with our mock
// This is necessary because the singleton is already instantiated at module load
EmailService.transporter = mockTransporter;

describe('emailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fsMockImpl = null;
    fsCallCount = 0;
  });

  describe('loadTemplate', () => {
    it('should return fallback {{content}} when template file does not exist', () => {
      // Force fs.readFileSync to throw (template not found)
      fsMockImpl = jest.fn().mockImplementation(() => {
        const error = new Error('ENOENT: no such file or directory');
        error.code = 'ENOENT';
        throw error;
      });

      const result = EmailService.loadTemplate('nonExistentTemplate');
      expect(result).toBe('{{content}}');
    });

  });

  describe('sendTransactional', () => {
    it('should send an email successfully', async () => {
      const result = await EmailService.sendTransactional(
        'test@example.com',
        'Test Subject',
        'welcome',
        { name: 'Test User', content: 'Test content' }
      );

      expect(result.messageId).toBe('test-msg-id');
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Test Subject',
          from: expect.any(String)
        })
      );
    });

    it('should throw error when template not found', async () => {
      await expect(
        EmailService.sendTransactional(
          'test@example.com',
          'Test Subject',
          'nonExistentTemplate',
          { name: 'Test' }
        )
      ).rejects.toThrow('Template nonExistentTemplate not found');
    });

    it('should re-throw error when sendMail fails', async () => {
      const sendError = new Error('SMTP connection failed');
      mockTransporter.sendMail.mockRejectedValueOnce(sendError);

      await expect(
        EmailService.sendTransactional(
          'test@example.com',
          'Test Subject',
          'welcome',
          { name: 'Test User', content: 'Test content' }
        )
      ).rejects.toThrow('SMTP connection failed');
    });
  });

  describe('sendWelcomeEmail', () => {
    it('should send welcome email with correct template and subject', async () => {
      await EmailService.sendWelcomeEmail('user@example.com', 'John Doe');

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Welcome'),
          from: expect.any(String)
        })
      );
    });

    it('should include user name in the email data', async () => {
      await EmailService.sendWelcomeEmail('user@example.com', 'John Doe');

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('John Doe')
        })
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email with reset link', async () => {
      const resetLink = 'https://ahoyvpn.com/reset/abc123';
      await EmailService.sendPasswordResetEmail('user@example.com', resetLink);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Password Reset'),
          from: expect.any(String)
        })
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining(resetLink)
        })
      );
    });
  });

  describe('sendPaymentSuccessEmail', () => {
    it('should send payment success email with payment details', async () => {
      await EmailService.sendPaymentSuccessEmail(
        'user@example.com',
        '$29.99',
        'Monthly Plan',
        '2024-02-15'
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Payment Successful'),
          from: expect.any(String)
        })
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('$29.99')
        })
      );
    });
  });

  describe('sendPaymentFailedEmail', () => {
    it('should send payment failed email with failure details', async () => {
      const retryLink = 'https://ahoyvpn.com/retry/payment';
      await EmailService.sendPaymentFailedEmail(
        'user@example.com',
        'Monthly Plan',
        retryLink
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Payment Failed'),
          from: expect.any(String)
        })
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining(retryLink)
        })
      );
    });
  });

  describe('sendTrialEndingEmail', () => {
    it('should send trial ending email with days left', async () => {
      await EmailService.sendTrialEndingEmail('user@example.com', 3);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Trial Ends'),
          from: expect.any(String)
        })
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('3')
        })
      );
    });
  });

  describe('sendSubscriptionExpiringEmail', () => {
    it('should send subscription expiring email with renewal details', async () => {
      await EmailService.sendSubscriptionExpiringEmail(
        'user@example.com',
        'Yearly Plan',
        7,
        'https://ahoyvpn.com/renew',
        '2024-12-31'
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Expires in 7 Days'),
          from: expect.any(String)
        })
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('Yearly Plan')
        })
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('7')
        })
      );
    });
  });

  describe('sendSubscriptionCancelledEmail', () => {
    it('should send subscription cancelled email with expiry date', async () => {
      await EmailService.sendSubscriptionCancelledEmail(
        'user@example.com',
        '2024-12-31'
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Cancelled'),
          from: expect.any(String)
        })
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('2024-12-31')
        })
      );
    });
  });

  describe('sendAccountCreatedEmail', () => {
    it('should send account created email with VPN credentials', async () => {
      await EmailService.sendAccountCreatedEmail(
        'user@example.com',
        'vpnuser123',
        'SecurePass!99',
        '2024-12-31'
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Account Details'),
          from: expect.any(String)
        })
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('vpnuser123')
        })
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('SecurePass!99')
        })
      );
    });
  });

  describe('getSupportEmail', () => {
    it('should return the support email address', () => {
      const supportEmail = EmailService.getSupportEmail();
      expect(supportEmail).toBe('William@ahoyvpn.com');
    });
  });
});
