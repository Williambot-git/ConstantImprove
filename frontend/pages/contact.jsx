import { useState } from 'react';
import Link from 'next/link';
import { Card } from '../components/ui';
import { Button } from '../components/ui';
import { FormGroup, Input, Textarea } from '../components/ui';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // 'success' | 'error'

  const handleChange = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setStatus('success');
        setForm({ name: '', email: '', subject: '', message: '' });
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Contact Support</h1>
          <p style={styles.subtitle}>
            Having trouble with your account or subscription? Fill out the form below and we will get back to you within 24 hours.
          </p>
        </div>

        <Card style={styles.card}>
          {status === 'success' ? (
            <div style={styles.successState}>
              <p style={styles.successTitle}>Message sent</p>
              <p style={styles.successText}>
                We have received your message and will reply to <strong>{form.email || 'your email'}</strong> within 24 hours.
              </p>
              <Button
                variant="ghost"
                onClick={() => setStatus(null)}
                style={{ marginTop: '1.5rem' }}
              >
                Send another message
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={styles.formGrid}>
                <FormGroup label="Name">
                  <Input
                    value={form.name}
                    onChange={handleChange('name')}
                    placeholder="Your name"
                    disabled={loading}
                    required
                  />
                </FormGroup>

                <FormGroup label="Email">
                  <Input
                    type="email"
                    value={form.email}
                    onChange={handleChange('email')}
                    placeholder="you@example.com"
                    disabled={loading}
                    required
                  />
                </FormGroup>
              </div>

              <FormGroup label="Subject">
                <Input
                  value={form.subject}
                  onChange={handleChange('subject')}
                  placeholder="What is this about?"
                  disabled={loading}
                  required
                />
              </FormGroup>

              <FormGroup label="Message">
                <Textarea
                  value={form.message}
                  onChange={handleChange('message')}
                  placeholder="Describe your issue in detail..."
                  rows={6}
                  disabled={loading}
                  required
                />
              </FormGroup>

              {status === 'error' && (
                <p style={styles.error}>
                  Something went wrong. Please try again or email us directly at{' '}
                  <a href="mailto:ahoyvpn@ahoyvpn.net" style={{ color: '#3B82F6' }}>
                    ahoyvpn@ahoyvpn.net
                  </a>
                  .
                </p>
              )}

              <Button type="submit" fullWidth disabled={loading}>
                {loading ? 'Sending...' : 'Send Message'}
              </Button>
            </form>
          )}
        </Card>

        <p style={styles.backLink}>
          <Link href="/" style={{ color: '#8A8A8A', textDecoration: 'none', fontSize: '0.875rem' }}>
            &larr; Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#0F0F0F',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1.5rem',
  },
  container: {
    width: '100%',
    maxWidth: '560px',
  },
  header: {
    marginBottom: '2rem',
    textAlign: 'center',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: '#F5F5F0',
    marginBottom: '0.75rem',
  },
  subtitle: {
    fontSize: '0.9rem',
    color: '#8A8A8A',
    lineHeight: 1.65,
  },
  card: {
    padding: '2rem',
    backgroundColor: '#1A1A1A',
    border: '1px solid #2E2E2E',
    borderRadius: '10px',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem',
  },
  error: {
    color: '#EF4444',
    fontSize: '0.875rem',
    marginBottom: '1rem',
  },
  successState: {
    textAlign: 'center',
    padding: '1rem 0',
  },
  successTitle: {
    fontSize: '1.125rem',
    fontWeight: 600,
    color: '#22C55E',
    marginBottom: '0.75rem',
  },
  successText: {
    fontSize: '0.9rem',
    color: '#8A8A8A',
    lineHeight: 1.65,
  },
  backLink: {
    textAlign: 'center',
    marginTop: '1.5rem',
  },
};
