/**
 * ziptaxService unit tests
 *
 * Tests the single public method: lookupCombinedSalesTaxRate({ countryCode, region, postalCode, taxabilityCode })
 *
 * Each test covers:
 * - Successful API response (response code 100)
 * - Error responses (missing API key, invalid response code, network failure)
 * - Edge cases (empty summaries, missing fields, non-USA countries)
 *
 * Uses axios mocking pattern (service uses axios, not node-fetch like vpnResellersService).
 */

// Set API key BEFORE require — service singleton reads it at construction time
process.env.ZIPTAX_API_KEY = 'test-api-key-for单元-tests';

// Mock axios — the service uses axios for HTTP calls
jest.mock('axios');

const axios = require('axios');

// We test the actual service (singleton instance)
const ziptaxService = require('../../src/services/ziptaxService');

describe('ziptaxService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper: mock a successful axios response
  const mockAxiosSuccess = (responseData, status = 200) => {
    axios.get.mockResolvedValueOnce({
      status,
      data: responseData
    });
  };

  describe('lookupCombinedSalesTaxRate', () => {
    it('should return combined sales tax rate for valid US address', async () => {
      const mockResponse = {
        metadata: { response: { code: 100, name: 'SUCCESS', message: 'success' } },
        taxSummaries: [
          { taxType: 'SALES_TAX', rate: 0.06 }
        ]
      };
      mockAxiosSuccess(mockResponse);

      const result = await ziptaxService.lookupCombinedSalesTaxRate({
        countryCode: 'USA',
        region: 'PA',
        postalCode: '15417'
      });

      expect(result.rate).toBe(0.06);
      expect(axios.get).toHaveBeenCalledWith(
        'https://api.zip-tax.com/request/v60',
        expect.objectContaining({
          params: expect.objectContaining({
            address: 'PA 15417',
            countryCode: 'USA',
            format: 'json',
            addressDetailExtended: 'false'
          }),
          headers: expect.objectContaining({
            'X-API-KEY': expect.any(String),
            Accept: 'application/json'
          }),
          timeout: 8000
        })
      );
    });

    it('should handle Canadian postal codes', async () => {
      const mockResponse = {
        metadata: { response: { code: 100, name: 'SUCCESS', message: 'success' } },
        taxSummaries: [
          { taxType: 'GST', rate: 0.05 }
        ]
      };
      mockAxiosSuccess(mockResponse);

      const result = await ziptaxService.lookupCombinedSalesTaxRate({
        countryCode: 'CAN',
        region: 'ON',
        postalCode: 'M5V2T6'
      });

      expect(result.rate).toBe(0.05);
      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({ countryCode: 'CAN' })
        })
      );
    });

    it('should throw error when API key is not configured', async () => {
      // Save and clear API key
      const originalKey = process.env.ZIPTAX_API_KEY;
      delete process.env.ZIPTAX_API_KEY;

      // Re-require the service to get fresh instance without API key
      jest.resetModules();
      jest.mock('axios'); // re-register mock after resetModules
      const axiosFresh = require('axios');
      const serviceNoKey = require('../../src/services/ziptaxService');

      await expect(
        serviceNoKey.lookupCombinedSalesTaxRate({ region: 'PA', postalCode: '15417' })
      ).rejects.toThrow('ZipTax API key (ZIPTAX_API_KEY) is not configured');

      // Restore
      process.env.ZIPTAX_API_KEY = originalKey;
    });

    it('should throw error when region is missing', async () => {
      await expect(
        ziptaxService.lookupCombinedSalesTaxRate({ postalCode: '15417' })
      ).rejects.toThrow('Missing region or postalCode for ZipTax lookup');
    });

    it('should throw error when postal code is missing', async () => {
      await expect(
        ziptaxService.lookupCombinedSalesTaxRate({ region: 'PA' })
      ).rejects.toThrow('Missing region or postalCode for ZipTax lookup');
    });

    it('should throw error on non-100 response code', async () => {
      const mockResponse = {
        metadata: { response: { code: 200, name: 'INVALID_REQUEST', message: 'Bad request' } }
      };
      mockAxiosSuccess(mockResponse);

      await expect(
        ziptaxService.lookupCombinedSalesTaxRate({ region: 'PA', postalCode: '15417' })
      ).rejects.toThrow('ZipTax error (code=200, name=INVALID_REQUEST): Bad request');
    });

    it('should return 0 rate when tax summaries array is empty', async () => {
      const mockResponse = {
        metadata: { response: { code: 100, name: 'SUCCESS', message: 'success' } },
        taxSummaries: []
      };
      mockAxiosSuccess(mockResponse);

      const result = await ziptaxService.lookupCombinedSalesTaxRate({
        region: 'DE',
        postalCode: '19801'
      });

      expect(result.rate).toBe(0);
    });

    it('should fallback to first summary if SALES_TAX not present', async () => {
      const mockResponse = {
        metadata: { response: { code: 100, name: 'SUCCESS', message: 'success' } },
        taxSummaries: [
          { taxType: 'VAT', rate: 0.19 },
          { taxType: 'CST', rate: 0.07 }
        ]
      };
      mockAxiosSuccess(mockResponse);

      const result = await ziptaxService.lookupCombinedSalesTaxRate({
        region: 'XX',
        postalCode: '00000'
      });

      // Falls back to first entry (VAT at 0.19)
      expect(result.rate).toBe(0.19);
    });

    it('should return 0 for non-numeric rate', async () => {
      const mockResponse = {
        metadata: { response: { code: 100, name: 'SUCCESS', message: 'success' } },
        taxSummaries: [
          { taxType: 'SALES_TAX', rate: 'not-a-number' }
        ]
      };
      mockAxiosSuccess(mockResponse);

      const result = await ziptaxService.lookupCombinedSalesTaxRate({
        region: 'PA',
        postalCode: '15417'
      });

      expect(result.rate).toBe(0);
    });

    it('should return 0 for negative rate', async () => {
      const mockResponse = {
        metadata: { response: { code: 100, name: 'SUCCESS', message: 'success' } },
        taxSummaries: [
          { taxType: 'SALES_TAX', rate: -0.05 }
        ]
      };
      mockAxiosSuccess(mockResponse);

      const result = await ziptaxService.lookupCombinedSalesTaxRate({
        region: 'PA',
        postalCode: '15417'
      });

      expect(result.rate).toBe(0);
    });

    it('should throw error on unexpected response format', async () => {
      mockAxiosSuccess(null);

      await expect(
        ziptaxService.lookupCombinedSalesTaxRate({ region: 'PA', postalCode: '15417' })
      ).rejects.toThrow('Unexpected ZipTax response format');
    });

    it('should throw error on network failure', async () => {
      axios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        ziptaxService.lookupCombinedSalesTaxRate({ region: 'PA', postalCode: '15417' })
      ).rejects.toThrow('ZipTax lookup failed');
    });

    it('should pass taxabilityCode when provided', async () => {
      const mockResponse = {
        metadata: { response: { code: 100, name: 'SUCCESS', message: 'success' } },
        taxSummaries: [{ taxType: 'SALES_TAX', rate: 0.0625 }]
      };
      mockAxiosSuccess(mockResponse);

      await ziptaxService.lookupCombinedSalesTaxRate({
        region: 'CA',
        postalCode: '92618',
        taxabilityCode: 31001
      });

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({ taxabilityCode: 31001 })
        })
      );
    });

    it('should normalize whitespace in region and postal code', async () => {
      const mockResponse = {
        metadata: { response: { code: 100, name: 'SUCCESS', message: 'success' } },
        taxSummaries: [{ taxType: 'SALES_TAX', rate: 0.05 }]
      };
      mockAxiosSuccess(mockResponse);

      await ziptaxService.lookupCombinedSalesTaxRate({
        region: '  CA  ',
        postalCode: '  92618  '
      });

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({ address: 'CA 92618' })
        })
      );
    });

    // ─────────────────────────────────────────────────────────────────
    // Branch coverage: line 39 — normalizedCountry ternary (CAN path)
    // Line 39: normalizedCountry === 'CAN' ? 'CAN' : 'USA'
    // 'CAN' takes the TRUE path (countryCode passed as 'CAN')
    // 'USA' and other values take the FALSE path (covered by 'USA' test above)
    // Already covered by 'should handle Canadian postal codes' test above.
    // No additional test needed.
    // ─────────────────────────────────────────────────────────────────

    it('should use USA countryCode for non-CAN values (line 39 ternary false branch)', async () => {
      const mockResponse = {
        metadata: { response: { code: 100, name: 'SUCCESS', message: 'success' } },
        taxSummaries: [{ taxType: 'SALES_TAX', rate: 0.07 }]
      };
      mockAxiosSuccess(mockResponse);

      // Pass 'AUS' (not CAN) — ternary should evaluate to false and use 'USA'
      await ziptaxService.lookupCombinedSalesTaxRate({
        countryCode: 'AUS',
        region: 'NY',
        postalCode: '10001'
      });

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({ countryCode: 'USA' })
        })
      );
    });

    it('should default to USA when countryCode is null/undefined (line 39 ternary)', async () => {
      const mockResponse = {
        metadata: { response: { code: 100, name: 'SUCCESS', message: 'success' } },
        taxSummaries: [{ taxType: 'SALES_TAX', rate: 0.05 }]
      };
      mockAxiosSuccess(mockResponse);

      // @ts-ignore — intentionally passing null to exercise || '' fallback
      await ziptaxService.lookupCombinedSalesTaxRate({
        countryCode: null,
        region: 'TX',
        postalCode: '73301'
      });

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({ countryCode: 'USA' })
        })
      );
    });

    // ─────────────────────────────────────────────────────────────────
    // Branch coverage: lines 82-83 — data.metadata || {} and metadata.response || {}
    // These default empty objects kick in when API response is missing those fields.
    // ─────────────────────────────────────────────────────────────────

    it('should use empty metadata object when data.metadata is missing (line 82 branch)', async () => {
      // Response has no metadata field at all — data.metadata || {} should default to {}
      const mockResponse = {
        taxSummaries: [{ taxType: 'SALES_TAX', rate: 0.06 }]
        // metadata is completely absent
      };
      mockAxiosSuccess(mockResponse);

      // With no metadata.response.code, the code !== 100 check should throw
      await expect(
        ziptaxService.lookupCombinedSalesTaxRate({ region: 'FL', postalCode: '33101' })
      ).rejects.toThrow();
    });

    it('should use empty response object when metadata.response is missing (line 83 branch)', async () => {
      // metadata exists but response is absent — metadata.response || {} defaults to {}
      const mockResponse = {
        metadata: {
          // response is absent — respInfo = {}
        },
        taxSummaries: [{ taxType: 'SALES_TAX', rate: 0.06 }]
      };
      mockAxiosSuccess(mockResponse);

      // typeof undefined !== 'number' → throws with "ZipTax error (code=undefined...)"
      await expect(
        ziptaxService.lookupCombinedSalesTaxRate({ region: 'NY', postalCode: '10001' })
      ).rejects.toThrow('ZipTax error');
    });

    // ─────────────────────────────────────────────────────────────────
    // Branch coverage: lines 84-91 — error code != 100 branch
    // Tested by 'should throw error on non-100 response code' above.
    // Additional test for code=0 case (edge case in the || check)
    // ─────────────────────────────────────────────────────────────────

    it('should throw error when response code is 0 (falsy number — typeof check passes)', async () => {
      // typeof 0 === 'number' is true, but 0 !== 100, so it enters the error branch
      const mockResponse = {
        metadata: { response: { code: 0, name: 'ZERO_CODE', message: 'Zero code received' } }
      };
      mockAxiosSuccess(mockResponse);

      await expect(
        ziptaxService.lookupCombinedSalesTaxRate({ region: 'CA', postalCode: '90001' })
      ).rejects.toThrow('ZipTax error (code=0, name=ZERO_CODE): Zero code received');
    });

    it('should throw error when response code is a string "100" (type coercion fails)', async () => {
      // typeof '100' !== 'number' — enters error branch with code='100' (string)
      const mockResponse = {
        metadata: { response: { code: '100', name: 'SUCCESS', message: 'Success' } }
      };
      mockAxiosSuccess(mockResponse);

      await expect(
        ziptaxService.lookupCombinedSalesTaxRate({ region: 'WA', postalCode: '98101' })
      ).rejects.toThrow('ZipTax error');
    });

    // ─────────────────────────────────────────────────────────────────
    // Branch coverage: lines 111-116 — error re-throw logic
    // msg.startsWith('ZipTax error') — re-throw as-is
    // msg.startsWith('Unexpected ZipTax') — re-throw as-is
    // else — wrap as generic 'ZipTax lookup failed'
    // ─────────────────────────────────────────────────────────────────

    it('should re-throw errors starting with ZipTax error verbatim (line 114)', async () => {
      axios.get.mockRejectedValueOnce(new Error('ZipTax error (code=500, name=SERVER_ERROR): Internal error'));

      await expect(
        ziptaxService.lookupCombinedSalesTaxRate({ region: 'IL', postalCode: '60601' })
      ).rejects.toThrow('ZipTax error (code=500, name=SERVER_ERROR): Internal error');
    });

    it('should re-throw errors starting with Unexpected ZipTax verbatim (line 114)', async () => {
      axios.get.mockRejectedValueOnce(new Error('Unexpected ZipTax response format'));

      await expect(
        ziptaxService.lookupCombinedSalesTaxRate({ region: 'OH', postalCode: '44101' })
      ).rejects.toThrow('Unexpected ZipTax response format');
    });

    it('should wrap non-ZipTax errors as generic "ZipTax lookup failed" (line 117)', async () => {
      axios.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(
        ziptaxService.lookupCombinedSalesTaxRate({ region: 'GA', postalCode: '30301' })
      ).rejects.toThrow('ZipTax lookup failed');
    });

    it('should wrap errors with empty message as generic "ZipTax lookup failed"', async () => {
      axios.get.mockRejectedValueOnce(new Error(''));

      await expect(
        ziptaxService.lookupCombinedSalesTaxRate({ region: 'AZ', postalCode: '85001' })
      ).rejects.toThrow('ZipTax lookup failed');
    });

    // ─────────────────────────────────────────────────────────────────
    // Branch coverage: lines 63-65 — taxabilityCode conditional
    // Tested by 'should pass taxabilityCode when provided' above.
    // The !== null check is the only untaken branch (undefined case).
    // ─────────────────────────────────────────────────────────────────

    it('should NOT pass taxabilityCode when omitted (undefined — nullish check)', async () => {
      const mockResponse = {
        metadata: { response: { code: 100, name: 'SUCCESS', message: 'success' } },
        taxSummaries: [{ taxType: 'SALES_TAX', rate: 0.05 }]
      };
      mockAxiosSuccess(mockResponse);

      await ziptaxService.lookupCombinedSalesTaxRate({
        region: 'NV',
        postalCode: '89101'
        // taxabilityCode intentionally omitted
      });

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.not.objectContaining(['taxabilityCode'])
        })
      );
    });

    // ─────────────────────────────────────────────────────────────────
    // Branch coverage: line 89 — name || 'unknown' fallback
    // When API returns a response code error but name field is missing/falsy,
    // we fall back to 'unknown'. This is an edge case in the error formatting.
    // ─────────────────────────────────────────────────────────────────

    it('should use "unknown" as name fallback when response name is missing (line 89)', async () => {
      // API returns error code but no name field
      const mockResponse = {
        metadata: { response: { code: 400, message: 'Bad request' } }
        // name is absent — should fall back to 'unknown'
      };
      mockAxiosSuccess(mockResponse);

      await expect(
        ziptaxService.lookupCombinedSalesTaxRate({ region: 'MA', postalCode: '02101' })
      ).rejects.toThrow('ZipTax error (code=400, name=unknown): Bad request');
    });

    it('should use "Request failed" as message fallback when response message is missing (line 89)', async () => {
      // API returns error with no message field
      const mockResponse = {
        metadata: { response: { code: 500, name: 'SERVER_ERROR' } }
        // message is absent
      };
      mockAxiosSuccess(mockResponse);

      await expect(
        ziptaxService.lookupCombinedSalesTaxRate({ region: 'CO', postalCode: '80201' })
      ).rejects.toThrow('ZipTax error (code=500, name=SERVER_ERROR): Request failed');
    });

    // ─────────────────────────────────────────────────────────────────
    // Branch coverage: line 106 — Number.isFinite(rate) check
    // safeRate = Number.isFinite(rate) && rate >= 0 ? rate : 0
    // Already covered: rate is negative (line 105 test), rate is non-number (line 103 test)
    // Remaining: rate is Infinity or NaN (fails Number.isFinite)
    // ─────────────────────────────────────────────────────────────────

    it('should return 0 when rate is Infinity (Number.isFinite returns false)', async () => {
      const mockResponse = {
        metadata: { response: { code: 100, name: 'SUCCESS', message: 'success' } },
        taxSummaries: [{ taxType: 'SALES_TAX', rate: Infinity }]
      };
      mockAxiosSuccess(mockResponse);

      const result = await ziptaxService.lookupCombinedSalesTaxRate({
        region: 'UT',
        postalCode: '84101'
      });

      // Number.isFinite(Infinity) === false → safeRate falls back to 0
      expect(result.rate).toBe(0);
    });

    it('should return 0 when rate is NaN (Number.isFinite returns false)', async () => {
      const mockResponse = {
        metadata: { response: { code: 100, name: 'SUCCESS', message: 'success' } },
        taxSummaries: [{ taxType: 'SALES_TAX', rate: NaN }]
      };
      mockAxiosSuccess(mockResponse);

      const result = await ziptaxService.lookupCombinedSalesTaxRate({
        region: 'OR',
        postalCode: '97201'
      });

      // Number.isFinite(NaN) === false → safeRate falls back to 0
      expect(result.rate).toBe(0);
    });
  });
});
