const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    content: 'By accessing and using AHOY VPN, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.',
  },
  {
    title: '2. Service Description',
    content: 'AHOY VPN provides virtual private network (VPN) services. Our service encrypts your internet traffic and routes it through our servers to mask your IP address and location.',
  },
  {
    title: '3. User Responsibilities',
    items: [
      'You are responsible for maintaining the confidentiality of your numeric username and password.',
      'You are responsible for all activities that occur under your account.',
      'You agree not to use AHOY VPN for illegal activities or to violate any laws.',
      'You agree not to use AHOY VPN to harm, harass, or interfere with other users.',
      'You agree not to attempt to gain unauthorized access to AHOY VPN\'s systems.',
      'You agree not to share credentials for your account with anyone else.',
    ],
  },
  {
    title: '4. Account Termination',
    content: 'We reserve the right to terminate any account that violates these terms of service. Upon termination, you forfeit any remaining subscription balance.',
  },
  {
    title: '5. Payment Terms',
    items: [
      'Payments are processed by our third party payments providers; you will be redirected to their site to pay when you make a purchase; AHOY VPN does not store payment information.',
      'Subscriptions renew automatically on the billing date unless cancelled.',
      'You are responsible for keeping your payment information current.',
      'All purchases are final.',
      'No refunds are to be issued.',
    ],
  },
  {
    title: '6. Affiliate Program & Cookies',
    items: [
      'AHOY VPN uses cookies to track affiliate referrals (30-day expiration).',
      'Clicking an affiliate link sets a cookie to attribute future purchases.',
      'Affiliate earnings are calculated based on successful conversions.',
      'You can clear cookies anytime through your browser settings.',
    ],
  },
  {
    title: '7. Limitation of Liability',
    content: 'AHOY VPN is provided "AS IS" without warranties of any kind, express or implied. In no event shall AHOY VPN be liable for any damages arising from the use of this service.',
  },
  {
    title: '8. Changes to Terms',
    content: 'AHOY VPN reserves the right to modify these terms at any time. Changes will be effective immediately upon posting. Your continued use of AHOY VPN constitutes acceptance of the new terms.',
  },
  {
    title: '9. Contact Us',
    content: 'If you have questions about these terms, please contact us at ahoyvpn@ahoyvpn.net',
  },
];

export default function TermsOfService() {
  return (
    <div style={styles.container}>
      <h1 style={styles.pageTitle}>Terms of Service</h1>
      <p style={styles.updated}>Last updated: March 13, 2026</p>

      <div style={styles.content}>
        {SECTIONS.map((section) => (
          <section key={section.title} className="prose-section">
            <h2>{section.title}</h2>
            {section.content && (
              <p style={{ color: '#B0C4DE', lineHeight: 1.8, fontSize: '0.9rem' }}>{section.content}</p>
            )}
            {section.items && (
              <ul>
                {section.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '780px',
    margin: '0 auto',
  },
  pageTitle: {
    fontSize: '2.5rem',
    color: '#F5F5F0',
    marginBottom: '0.5rem',
    letterSpacing: '-0.01em',
  },
  updated: {
    color: '#5A5A5A',
    marginBottom: '3rem',
    fontSize: '0.875rem',
  },
  content: {},
};
