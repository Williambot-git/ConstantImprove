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

// Mock nodemailer before requiring emailService
jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransport: jest.fn().mockReturnValue(mockTransporter)
  }
}));

// Mock fs for template loading
jest.unstable_mockModule('fs', () => ({
  readFileSync: jest.fn().mockReturnValue('<html>{{name}} - {{content}}</html>')
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

  describe('getSupportEmail', () => {
    it('should return the support email address', () => {
      const supportEmail = EmailService.getSupportEmail();
      expect(supportEmail).toBe('William@ahoyvpn.com');
    });
  });
});
