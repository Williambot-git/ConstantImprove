describe('mock implementation vs resolved value priority', () => {
  let obj;
  
  beforeEach(() => {
    obj = { method: jest.fn() };
  });

  test('mockImplementation throws but mockResolvedValue is set — which wins?', async () => {
    // Simulate what the VPN-renewal test does
    obj.method.mockImplementation((opts) => {
      if (opts?.renew) throw new Error('VPN provider network error');
      return Promise.resolve({ username: 'old', password: 'old' });
    });

    // Now in welcome-email test: reset and set mockResolvedValue
    obj.method.mockReset();
    obj.method.mockResolvedValue({ username: 'vpnuser_welcome', password: 'vpnpass_welcome' });

    const result = obj.method({ renew: true });
    result.then(r => console.log('resolved:', r)).catch(e => console.log('threw:', e.message));
    await new Promise(r => setTimeout(r, 10));
  });
});
