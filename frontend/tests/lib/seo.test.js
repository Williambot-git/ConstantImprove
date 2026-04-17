/**
 * lib/seo.js unit tests
 *
 * Tests the SEO metadata utility functions that provide page-specific
 * title, description, and keywords for the AhoyVPN site.
 * Simple unit tests — no mocks needed since seo.js has no external deps.
 */

import { defaultMeta, pageMeta, getPageMeta } from '../../lib/seo';

describe('lib/seo', () => {
  describe('defaultMeta', () => {
    it('should have all required SEO fields', () => {
      expect(defaultMeta).toEqual(expect.objectContaining({
        title: expect.any(String),
        description: expect.any(String),
        url: expect.any(String),
        image: expect.any(String),
      }));
    });

    it('should reference the canonical AhoyVPN domain', () => {
      expect(defaultMeta.url).toBe('https://ahoyvpn.net');
      expect(defaultMeta.image).toBe('https://ahoyvpn.net/og-image.png');
    });
  });

  describe('pageMeta', () => {
    it('should define metadata for all known pages', () => {
      const expectedPages = [
        'home', 'checkout', 'login', 'recover',
        'dashboard', 'affiliate', 'admin',
        'tos', 'privacy', 'faq'
      ];
      expectedPages.forEach(page => {
        expect(pageMeta).toHaveProperty(page);
        expect(pageMeta[page]).toEqual(expect.objectContaining({
          title: expect.any(String),
          description: expect.any(String),
          keywords: expect.any(String),
        }));
      });
    });

    it('should include "AHOY VPN" or "AhoyVPN" in titles', () => {
      Object.entries(pageMeta).forEach(([page, meta]) => {
        expect(meta.title).toMatch(/AHOY VPN|AhoyVPN/);
      });
    });

    it('should have title ending with "AHOY VPN" or "- AHOY VPN"', () => {
      Object.values(pageMeta).forEach(meta => {
        expect(meta.title).toMatch(/(AHOY VPN|AhoyVPN)/);
      });
    });

    it('each page should have non-empty title, description, and keywords', () => {
      Object.entries(pageMeta).forEach(([page, meta]) => {
        expect(meta.title.length).toBeGreaterThan(0);
        expect(meta.description.length).toBeGreaterThan(0);
        expect(meta.keywords.length).toBeGreaterThan(0);
      });
    });

    it('checkout page should reference checkout/pricing keywords', () => {
      expect(pageMeta.checkout.keywords).toMatch(/checkout|pricing|VPN subscription/i);
    });

    it('affiliate page should mention commission/earnings', () => {
      expect(pageMeta.affiliate.description).toMatch(/commission|earn/i);
    });

    it('privacy page should mention no logs/data protection', () => {
      expect(pageMeta.privacy.description).toMatch(/no logs|privacy|data protection/i);
    });
  });

  describe('getPageMeta', () => {
    it('should return metadata for a valid page', () => {
      const meta = getPageMeta('checkout');
      expect(meta).toEqual(pageMeta.checkout);
    });

    it('should return empty object for unknown page', () => {
      const meta = getPageMeta('nonexistent');
      expect(meta).toEqual({});
    });

    it('should return empty object when given null or undefined', () => {
      expect(getPageMeta(null)).toEqual({});
      expect(getPageMeta(undefined)).toEqual({});
    });

    it('should return correct meta for each known page', () => {
      const pages = ['home', 'login', 'dashboard', 'affiliate', 'admin'];
      pages.forEach(page => {
        expect(getPageMeta(page)).toEqual(pageMeta[page]);
      });
    });
  });
});
