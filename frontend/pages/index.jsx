import Link from 'next/link';
import Button from '../components/ui/Button';

const FEATURES = [
  {
    title: 'Zero Logs',
    description: 'We never store your browsing activity, connection timestamps, or IP addresses.',
  },
  {
    title: 'Numeric Authentication',
    description: 'Accounts tied to numeric IDs — no email required, no personal data collected.',
  },
  {
    title: '10 Simultaneous Connections',
    description: 'Secure every device you own under a single subscription.',
  },
  {
    title: 'Recovery Kits',
    description: 'Self-custody account recovery. Your account, your keys — no password reset emails.',
  },
];

const PLANS = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: '$5.99',
    period: '/month',
    badge: null,
  },
  {
    id: 'quarterly',
    name: 'Quarterly',
    price: '$16.99',
    period: '/quarter',
    badge: 'Best value',
  },
  {
    id: 'semi-annual',
    name: 'Semi-Annual',
    price: '$31.99',
    period: '/6 months',
    badge: 'Crypto only',
  },
  {
    id: 'annual',
    name: 'Annual',
    price: '$59.99',
    period: '/year',
    badge: 'Crypto only',
  },
];

const STEPS = [
  { step: '01', title: 'Register', description: 'Create an account with a numeric username and password. No email required.' },
  { step: '02', title: 'Subscribe', description: 'Choose a plan and pay securely via card or cryptocurrency.' },
  { step: '03', title: 'Connect', description: 'Download the client and connect to any of our global server locations.' },
];

export default function Home() {
  return (
    <div style={styles.page}>
      {/* Hero */}
      <section style={styles.hero}>
        <div style={styles.heroInner}>
          <p style={styles.heroEyebrow}>Privacy-first VPN</p>
          <h1 style={styles.heroTitle}>
            Your internet.<br />
            Your rules.
          </h1>
          <p style={styles.heroSubtitle}>
            Military-grade encryption. Zero logs. No tracking.<br />
            Starting at $5.99/month.
          </p>
          <div style={styles.heroCtas}>
            <Link href="/register" passHref>
              <Button as="a" size="lg" style={{ textDecoration: 'none' }}>
                Get Started
              </Button>
            </Link>
            <Link href="/faq" passHref>
              <Button variant="ghost" size="lg" as="a" style={{ textDecoration: 'none' }}>
                How it works
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Built for privacy</h2>
          <p style={styles.sectionSubtitle}>
            No surveillance. No data collection. No compromises.
          </p>
        </div>
        <div style={styles.featuresGrid}>
          {FEATURES.map((f) => (
            <div key={f.title} style={styles.featureCard}>
              <h3 style={styles.featureTitle}>{f.title}</h3>
              <p style={styles.featureDesc}>{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Simple pricing</h2>
          <p style={styles.sectionSubtitle}>
            All plans include full access to our global network and premium features.
          </p>
        </div>
        <div style={styles.pricingGrid}>
          {PLANS.map((plan) => (
            <div key={plan.id} style={styles.pricingCard}>
              {plan.badge && (
                <span style={{
                  ...styles.pricingBadge,
                  backgroundColor: plan.badge === 'Best value' ? '#3B82F6' : 'transparent',
                  borderColor: plan.badge === 'Best value' ? '#3B82F6' : '#2E2E2E',
                  color: plan.badge === 'Best value' ? '#fff' : '#8A8A8A',
                }}>
                  {plan.badge}
                </span>
              )}
              <h3 style={styles.pricingName}>{plan.name}</h3>
              <div style={styles.pricingPrice}>
                {plan.price}
                <span style={styles.pricingPeriod}>{plan.period}</span>
              </div>
            </div>
          ))}
        </div>
        <p style={styles.pricingNote}>
          Card payments available for Monthly and Quarterly plans.{' '}
          <a href="/faq" style={{ color: '#3B82F6' }}>Learn more</a> about cryptocurrency options.
        </p>
      </section>

      {/* How It Works */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Up and running in minutes</h2>
        </div>
        <div style={styles.stepsGrid}>
          {STEPS.map((s, i) => (
            <div key={s.step} style={styles.step}>
              <span style={styles.stepNumber}>{s.step}</span>
              <h3 style={styles.stepTitle}>{s.title}</h3>
              <p style={styles.stepDesc}>{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Banner */}
      <section style={styles.ctaBanner}>
        <h2 style={styles.ctaBannerTitle}>Ready to take back your privacy?</h2>
        <p style={styles.ctaBannerSubtitle}>Start with a plan that fits your needs.</p>
        <Link href="/register" passHref>
          <Button as="a" size="lg" style={{ textDecoration: 'none', marginTop: '1.5rem' }}>
            Get Started
          </Button>
        </Link>
      </section>
    </div>
  );
}

const styles = {
  page: { maxWidth: '100%' },

  hero: {
    padding: '5rem 1.5rem 4rem',
    textAlign: 'center',
    borderBottom: '1px solid #1E1E1E',
  },
  heroInner: { maxWidth: '640px', margin: '0 auto' },
  heroEyebrow: {
    fontSize: '0.8rem',
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#3B82F6',
    marginBottom: '1.25rem',
  },
  heroTitle: {
    fontSize: 'clamp(2.25rem, 5vw, 3.5rem)',
    fontWeight: 700,
    lineHeight: 1.1,
    color: '#F5F5F0',
    marginBottom: '1.25rem',
    letterSpacing: '-0.02em',
  },
  heroSubtitle: {
    fontSize: '1.1rem',
    color: '#8A8A8A',
    lineHeight: 1.7,
    marginBottom: '2rem',
  },
  heroCtas: {
    display: 'flex',
    gap: '0.875rem',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },

  section: {
    padding: '4rem 1.5rem',
    maxWidth: '1100px',
    margin: '0 auto',
  },
  sectionHeader: { textAlign: 'center', marginBottom: '3rem' },
  sectionTitle: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: '#F5F5F0',
    marginBottom: '0.75rem',
    letterSpacing: '-0.01em',
  },
  sectionSubtitle: {
    fontSize: '1rem',
    color: '#8A8A8A',
    maxWidth: '480px',
    margin: '0 auto',
    lineHeight: 1.7,
  },

  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '1px',
    border: '1px solid #2E2E2E',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  featureCard: {
    padding: '2rem 1.75rem',
    backgroundColor: '#1A1A1A',
    borderRight: '1px solid #2E2E2E',
    borderBottom: '1px solid #2E2E2E',
  },
  featureTitle: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#F5F5F0',
    marginBottom: '0.625rem',
  },
  featureDesc: {
    fontSize: '0.875rem',
    color: '#8A8A8A',
    lineHeight: 1.65,
  },

  pricingGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  pricingCard: {
    position: 'relative',
    backgroundColor: '#1A1A1A',
    border: '1px solid #2E2E2E',
    borderRadius: '10px',
    padding: '1.75rem',
    textAlign: 'center',
    transition: 'border-color 0.2s ease',
  },
  pricingBadge: {
    position: 'absolute',
    top: '-1px',
    right: '1rem',
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    padding: '0.25rem 0.625rem',
    borderRadius: '0 0 6px 6px',
    border: '1px solid',
  },
  pricingName: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#8A8A8A',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '0.875rem',
  },
  pricingPrice: {
    fontSize: '2rem',
    fontWeight: 700,
    color: '#F5F5F0',
    letterSpacing: '-0.02em',
  },
  pricingPeriod: {
    fontSize: '0.9rem',
    fontWeight: 400,
    color: '#8A8A8A',
  },
  pricingNote: {
    fontSize: '0.875rem',
    color: '#5A5A5A',
    textAlign: 'center',
    lineHeight: 1.6,
  },

  stepsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  },
  step: {
    padding: '1.5rem 2rem',
  },
  stepNumber: {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: '#3B82F6',
    marginBottom: '0.875rem',
  },
  stepTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#F5F5F0',
    marginBottom: '0.5rem',
  },
  stepDesc: {
    fontSize: '0.875rem',
    color: '#8A8A8A',
    lineHeight: 1.65,
  },

  ctaBanner: {
    backgroundColor: '#111111',
    borderTop: '1px solid #2E2E2E',
    borderBottom: '1px solid #2E2E2E',
    padding: '4rem 1.5rem',
    textAlign: 'center',
    marginTop: '2rem',
  },
  ctaBannerTitle: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#F5F5F0',
    marginBottom: '0.5rem',
  },
  ctaBannerSubtitle: {
    fontSize: '1rem',
    color: '#8A8A8A',
  },
};
