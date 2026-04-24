// PlanCard component - renders a plan option in the subscription section.
// Extracted from dashboard.jsx to enable component decomposition.
import Card from '../ui/Card';
import Button from '../ui/Button';
import styles from './styles.js';

function PlanCard({ plan, onSelect, selected }) {
  return (
    <Card style={{
      ...styles.planCard,
      ...(selected && styles.planCardSelected),
      ...(plan.highlight && styles.planCardHighlighted)
    }}>
      <h3>{plan.name}</h3>
      <div style={styles.planPrice}>
        <span style={styles.priceAmount}>{plan.price}</span>
        <span style={styles.pricePeriod}>{plan.period}</span>
      </div>
      <p style={styles.planDescription}>{plan.description}</p>
      <ul style={styles.planFeatures}>
        {plan.features.map((feature, i) => (
          <li key={i}>{feature}</li>
        ))}
      </ul>
      {plan.cryptoOnly && (
        <p style={styles.cryptoOnly}>Crypto payment only</p>
      )}
      <Button onClick={onSelect} style={styles.selectButton}>
        Select Plan
      </Button>
    </Card>
  );
}

export default PlanCard;
