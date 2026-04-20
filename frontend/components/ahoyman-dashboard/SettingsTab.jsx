import { useState, useEffect } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import api from '../../api/client';
import { inputStyle } from './styles';

export default function SettingsTab() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({});
  const [loadError, setLoadError] = useState('');

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.getSettings();
      const s = res.data.data;
      setSettings(s);
      setForm({
        minimumPayout: s.minimumPayout,
        commissionRateMonthly: s.commissionRateMonthly,
        commissionRateQuarterly: s.commissionRateQuarterly,
        commissionRateSemiannual: s.commissionRateSemiannual,
        commissionRateAnnual: s.commissionRateAnnual,
        holdPeriodDays: s.holdPeriodDays,
      });
    } catch (err) {
      setLoadError(err.response?.data?.error || 'Failed to load settings.');
    } finally { setLoading(false); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateSettings({
        minimumPayout: parseFloat(form.minimumPayout),
        commissionRateMonthly: parseFloat(form.commissionRateMonthly),
        commissionRateQuarterly: parseFloat(form.commissionRateQuarterly),
        commissionRateSemiannual: parseFloat(form.commissionRateSemiannual),
        commissionRateAnnual: parseFloat(form.commissionRateAnnual),
        holdPeriodDays: parseInt(form.holdPeriodDays),
      });
      setMsg('Settings saved successfully.');
      loadSettings();
    } catch { setMsg('Failed to save settings.'); }
    finally { setSaving(false); }
  };

  if (loading) return <p style={{ color: '#A0AEC0', textAlign: 'center' }}>Loading...</p>;
  if (loadError) return <p style={{ color: '#FF6B6B', textAlign: 'center' }}>{loadError}</p>;

  const field = (key, label, type = 'number', step) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
      <label style={{ color: '#B0C4DE', width: '200px', flexShrink: 0 }}>{label}</label>
      <input type={type} step={step || 'any'} value={form[key] ?? ''} onChange={e => setForm({ ...form, [key]: e.target.value })}
        required style={{ ...inputStyle, width: '100px' }} />
    </div>
  );

  return (
    <Card>
      <h3 style={{ color: '#8B5CF6', marginTop: 0, marginBottom: '1.5rem' }}>System Settings</h3>
      <form onSubmit={handleSave}>
        {field('minimumPayout', 'Minimum Payout ($)', 'number')}
        {field('commissionRateMonthly', 'Commission — Monthly', 'number')}
        {field('commissionRateQuarterly', 'Commission — Quarterly', 'number')}
        {field('commissionRateSemiannual', 'Commission — Semi-Annual', 'number')}
        {field('commissionRateAnnual', 'Commission — Annual', 'number')}
        {field('holdPeriodDays', 'Hold Period (days)', 'number')}
        <Button type="submit" disabled={saving} style={{ marginTop: '0.5rem' }}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
        {msg && <p style={{ marginTop: '0.75rem', color: msg.includes('success') ? '#10B981' : '#FF6B6B' }}>{msg}</p>}
      </form>
    </Card>
  );
}
