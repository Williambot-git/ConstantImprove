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
  });
});
