/**
 * Unit tests for lib/sanitize.js — XSS prevention and input sanitization utilities
 *
 * WHY THESE TESTS MATTER:
 * sanitize.js is a security-critical library. Every function here prevents attacks:
 * - sanitizeHtml: prevents XSS via injected script tags
 * - sanitizeUrl: prevents javascript: protocol injection
 * - sanitizeEmail: prevents email header injection
 * - sanitizeText: prevents injection in text contexts
 * - sanitizeNumber: prevents NaN pollution / injection
 * - sanitizeAffiliateId: enforces format to prevent CSRF-like attacks
 * - sanitizeFormData: applies field-specific rules consistently
 * - preventXss: alias for sanitizeHtml (convenience wrapper)
 *
 * These functions are used in 6 frontend pages (login, checkout, affiliate,
 * ahoyman, recover, admin) and handle ALL user input before it reaches React.
 */

import {
  sanitizeHtml,
  sanitizeUrl,
  sanitizeEmail,
  sanitizeText,
  sanitizeNumber,
  sanitizeAffiliateId,
  sanitizeFormData,
  preventXss,
} from '../../lib/sanitize';

describe('sanitizeHtml — escapes HTML special characters', () => {
  test('escapes ampersand', () => {
    expect(sanitizeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  test('escapes less-than and greater-than (prevents script injection)', () => {
    expect(sanitizeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
    );
  });

  test('escapes double quotes (prevents attribute injection)', () => {
    expect(sanitizeHtml('"injected"')).toBe('&quot;injected&quot;');
  });

  test('escapes single quotes (prevents attribute injection)', () => {
    expect(sanitizeHtml("'injected'")).toBe('&#x27;injected&#x27;');
  });

  test('escapes backticks (prevents template literal injection)', () => {
    expect(sanitizeHtml('`injected`')).toBe('&#x60;injected&#x60;');
  });

  test('escapes equals sign (prevents attribute binding)', () => {
    expect(sanitizeHtml('a=b')).toBe('a&#x3D;b');
  });

  test('escapes forward slash (can break out of HTML tags)', () => {
    expect(sanitizeHtml('foo/bar')).toBe('foo&#x2F;bar');
  });

  test('returns empty string for non-string input', () => {
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(undefined)).toBe('');
    expect(sanitizeHtml(123)).toBe('');
    expect(sanitizeHtml({})).toBe('');
  });

  test('returns empty string for empty string input', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  test('preserves safe text unchanged', () => {
    expect(sanitizeHtml('Hello World')).toBe('Hello World');
    expect(sanitizeHtml('Plain text only.')).toBe('Plain text only.');
  });

  test('handles mixed content — escapes dangerous, keeps text', () => {
    const result = sanitizeHtml('Hello <b>World</b> & Friends');
    // All special chars are escaped; safe content characters are preserved
    expect(result).toContain('Hello');
    expect(result).toContain('World');
    expect(result).toContain('&lt;'); // escaped <
    expect(result).toContain('&gt;'); // escaped >
    expect(result).toContain('&amp;'); // escaped &
    expect(result).toContain('&#x2F;'); // escaped /
  });
});

describe('sanitizeUrl — blocks dangerous protocols, validates URL format', () => {
  test('allows http:// URLs', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  test('allows https:// URLs', () => {
    expect(sanitizeUrl('https://ahoyvpn.net/checkout')).toBe('https://ahoyvpn.net/checkout');
  });

  test('blocks javascript: protocol (XSS attack vector)', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeUrl('javascript:void(0)')).toBe('');
  });

  test('blocks data: protocol (can embed malicious content)', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
  });

  test('blocks vbscript: protocol', () => {
    expect(sanitizeUrl('vbscript:msgbox("xss")')).toBe('');
  });

  test('blocks file: protocol', () => {
    expect(sanitizeUrl('file:///etc/passwd')).toBe('');
  });

  test('allows relative URLs starting with /', () => {
    expect(sanitizeUrl('/checkout')).toBe('/checkout');
    expect(sanitizeUrl('/affiliate/MRBOSSNIGGA')).toBe('/affiliate/MRBOSSNIGGA');
  });

  test('allows relative URLs starting with ? (query strings)', () => {
    expect(sanitizeUrl('?redirect=/dashboard')).toBe('?redirect=/dashboard');
  });

  test('allows relative URLs starting with # (hash fragments)', () => {
    expect(sanitizeUrl('#section')).toBe('#section');
  });

  test('rejects invalid absolute URLs (no protocol or malformed)', () => {
    expect(sanitizeUrl('not-a-url')).toBe('');
    expect(sanitizeUrl('just some text')).toBe('');
  });

  test('rejects invalid protocols on malformed URLs', () => {
    expect(sanitizeUrl('javascript://example.com')).toBe('');
  });

  test('returns empty string for non-string input', () => {
    expect(sanitizeUrl(null)).toBe('');
    expect(sanitizeUrl(undefined)).toBe('');
    expect(sanitizeUrl(123)).toBe('');
  });

  test('returns empty string for empty string', () => {
    expect(sanitizeUrl('')).toBe('');
  });
});

describe('sanitizeEmail — strips dangerous chars, validates format', () => {
  test('accepts valid email addresses', () => {
    expect(sanitizeEmail('user@example.com')).toBe('user@example.com');
    expect(sanitizeEmail('test.user@domain.co.uk')).toBe('test.user@domain.co.uk');
    expect(sanitizeEmail('user+tag@gmail.com')).toBe('user+tag@gmail.com');
  });

  test('strips angle brackets', () => {
    // < and > are stripped; inner content and () / pass through
    expect(sanitizeEmail('<b>test</b>@example.com')).toBe('btest/b@example.com');
    // alert(1) inside brackets: <> stripped, inner text preserved
    expect(sanitizeEmail('<script>alert(1)</script>@example.com')).toBe('scriptalert(1)/script@example.com');
    expect(sanitizeEmail('user<bold>@example.com')).toBe('userbold@example.com');
  });

  test('strips double quotes', () => {
    expect(sanitizeEmail('"user"@example.com')).toBe('user@example.com');
  });

  test('strips backticks', () => {
    expect(sanitizeEmail('`user`@example.com')).toBe('user@example.com');
  });

  test('strips single quotes', () => {
    expect(sanitizeEmail("O'Reilly@example.com")).toBe('OReilly@example.com');
  });

  test('rejects email without @', () => {
    expect(sanitizeEmail('notanemail')).toBe('');
    expect(sanitizeEmail('no-at-sign')).toBe('');
  });

  test('rejects email without domain', () => {
    expect(sanitizeEmail('user@')).toBe('');
    expect(sanitizeEmail('user@  ')).toBe('');
  });

  test('rejects email without local part', () => {
    expect(sanitizeEmail('@example.com')).toBe('');
  });

  test('rejects email with spaces', () => {
    expect(sanitizeEmail('user name@example.com')).toBe('');
  });

  test('returns empty string for non-string input', () => {
    expect(sanitizeEmail(null)).toBe('');
    expect(sanitizeEmail(undefined)).toBe('');
    expect(sanitizeEmail(123)).toBe('');
  });
});

describe('sanitizeText — removes dangerous characters, keeps readable text', () => {
  test('preserves plain text', () => {
    expect(sanitizeText('Hello World')).toBe('Hello World');
    expect(sanitizeText('Plain text. Numbers 123.')).toBe('Plain text. Numbers 123.');
  });

  test('strips angle brackets', () => {
    expect(sanitizeText('<script>')).toBe('script');
    expect(sanitizeText('a < b')).toBe('a  b');
    expect(sanitizeText('<x>test</x>')).toBe('xtest/x'); // / is escaped char stripped but preserves text content
  });

  test('strips double quotes', () => {
    expect(sanitizeText('"hello"')).toBe('hello');
    expect(sanitizeText('say "hello"')).toBe('say hello'); // spaces collapsed by trim
  });
  test('trims whitespace', () => {
    expect(sanitizeText('  hello  ')).toBe('hello');
  });

  test('returns empty string for non-string input', () => {
    expect(sanitizeText(null)).toBe('');
    expect(sanitizeText(undefined)).toBe('');
    expect(sanitizeText(123)).toBe('');
  });

  test('returns empty string for empty string', () => {
    expect(sanitizeText('')).toBe('');
  });
});

describe('sanitizeNumber — extracts valid numeric strings', () => {
  test('accepts plain integers', () => {
    expect(sanitizeNumber('123')).toBe('123');
    expect(sanitizeNumber('0')).toBe('0');
    expect(sanitizeNumber('999999')).toBe('999999');
  });

  test('accepts decimal numbers', () => {
    expect(sanitizeNumber('123.45')).toBe('123.45');
    expect(sanitizeNumber('0.99')).toBe('0.99');
    expect(sanitizeNumber('5999.00')).toBe('5999.00');
  });

  test('strips non-numeric characters', () => {
    expect(sanitizeNumber('$123.45')).toBe('123.45');
    expect(sanitizeNumber('1,234.56')).toBe('1234.56');
    expect(sanitizeNumber('abc123def')).toBe('123');
  });

  test('rejects invalid numbers (NaN)', () => {
    expect(sanitizeNumber('not-a-number')).toBe('');
    expect(sanitizeNumber('hello')).toBe('');
  });

  test('returns empty string for non-string input', () => {
    expect(sanitizeNumber(null)).toBe('');
    expect(sanitizeNumber(undefined)).toBe('');
    expect(sanitizeNumber({})).toBe('');
  });

  test('returns empty string for empty string', () => {
    expect(sanitizeNumber('')).toBe('');
  });
});

describe('sanitizeAffiliateId — enforces 8-16 alphanumeric format', () => {
  test('accepts valid affiliate IDs (8-16 alphanumeric)', () => {
    expect(sanitizeAffiliateId('MRBOSSNIGGA')).toBe('MRBOSSNIGGA');
    expect(sanitizeAffiliateId('ABC12345')).toBe('ABC12345');
    expect(sanitizeAffiliateId('Aff12345678')).toBe('AFF12345678'); // uppercased
  });

  test('accepts IDs with underscores and hyphens', () => {
    // Underscores and hyphens are stripped by the regex, resulting in 8 chars — valid
    expect(sanitizeAffiliateId('ABC_12345')).toBe('ABC12345');
    expect(sanitizeAffiliateId('ABC-12345')).toBe('ABC12345');
  });

  test('converts to uppercase (normalization)', () => {
    expect(sanitizeAffiliateId('mrbossnigga')).toBe('MRBOSSNIGGA');
    expect(sanitizeAffiliateId('MrBossNigga')).toBe('MRBOSSNIGGA');
  });

  test('rejects IDs shorter than 8 characters', () => {
    expect(sanitizeAffiliateId('ABC')).toBe('');
    expect(sanitizeAffiliateId('1234567')).toBe('');
  });

  test('rejects IDs longer than 16 characters', () => {
    // 16 chars (ABCDEFGHIJKLMNOP) is the maximum valid length
    expect(sanitizeAffiliateId('ABCDEFGHIJKLMNOPQR')).toBe(''); // 18 chars → rejected
    expect(sanitizeAffiliateId('ABCDEFGHIJKLMNOPQRSTUV')).toBe(''); // 22 chars → rejected
  });

  test('strips non-alphanumeric characters', () => {
    expect(sanitizeAffiliateId('ABC!@#$%12345')).toBe('ABC12345'); // 8 chars — exactly valid
    expect(sanitizeAffiliateId('ABC 123 45678')).toBe('ABC12345678'); // 11 chars — valid (8-16 range)
  });

  test('returns empty string for non-string input', () => {
    expect(sanitizeAffiliateId(null)).toBe('');
    expect(sanitizeAffiliateId(undefined)).toBe('');
    expect(sanitizeAffiliateId(123)).toBe('');
  });
});

describe('sanitizeFormData — applies field-specific sanitization rules', () => {
  const rules = {
    email: 'email',
    homepage: 'url',
    quantity: 'number',
    comment: 'html',
    affiliateCode: 'affiliate',
  };

  test('applies email rule to email field', () => {
    // sanitizeEmail strips < > " ` but NOT /
    const result = sanitizeFormData({ email: '<b>test</b>@example.com' }, rules);
    expect(result.email).toBe('btest/b@example.com'); // tags stripped, / passes through
  });

  test('applies url rule to url field', () => {
    const result = sanitizeFormData({ homepage: 'javascript:alert(1)' }, rules);
    expect(result.homepage).toBe(''); // blocked dangerous protocol
  });

  test('applies number rule to numeric field', () => {
    const result = sanitizeFormData({ quantity: '$19.99' }, rules);
    expect(result.quantity).toBe('19.99');
  });

  test('applies html rule to html field', () => {
    const result = sanitizeFormData({ comment: '<script>alert(1)</script>Hello' }, rules);
    expect(result.comment).not.toContain('<script>');
    expect(result.comment).toContain('Hello');
  });

  test('applies affiliate rule to affiliate field', () => {
    const result = sanitizeFormData({ affiliateCode: 'mrbossnigga' }, rules);
    expect(result.affiliateCode).toBe('MRBOSS NIGGA'.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
  });

  test('uses default text sanitization when no rule matches', () => {
    const result = sanitizeFormData({ name: '<script>alert(1)</script>John' }, rules);
    expect(result.name).toBe('scriptalert(1)/scriptJohn'); // angle brackets and quotes stripped by default
  });

  test('handles empty data object', () => {
    const result = sanitizeFormData({}, {});
    expect(result).toEqual({});
  });

  test('handles mixed fields with and without rules', () => {
    const result = sanitizeFormData(
      { email: 'a@b.com', unknown: '<x>test</x>' },
      rules
    );
    expect(result.email).toBe('a@b.com');
    expect(result.unknown).toBe('xtest/x'); // / is stripped, result preserved
  });
});

describe('preventXss — alias for sanitizeHtml (convenience wrapper)', () => {
  test('behaves identically to sanitizeHtml', () => {
    expect(preventXss('<script>alert(1)</script>')).toBe(sanitizeHtml('<script>alert(1)</script>'));
    expect(preventXss('Hello & World')).toBe(sanitizeHtml('Hello & World'));
    expect(preventXss('"quoted"')).toBe(sanitizeHtml('"quoted"'));
  });

  test('returns empty string for non-string input', () => {
    expect(preventXss(null)).toBe('');
    expect(preventXss(undefined)).toBe('');
    expect(preventXss(123)).toBe('');
  });
});
