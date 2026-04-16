import Card from '../ui/Card';
import Button from '../ui/Button';

export default function PlanSelector({ plans, selectedPlan, onSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {plans.map((plan) => {
        const isSelected = plan.id === selectedPlan;
        return (
          <Card
            key={plan.id}
            data-plan-id={plan.id}
            style={{
              borderColor: isSelected ? '#1E90FF' : '#444',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ color: '#1E90FF', marginBottom: '0.25rem' }}>{plan.name}</h3>
                <p style={{ color: '#B0C4DE', fontSize: '1.25rem', fontWeight: 'bold' }}>
                  {plan.price}
                  <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: '#888' }}>
                    {plan.period}
                  </span>
                </p>
                {plan.cryptoOnly && (
                  <span style={{
                    display: 'inline-block',
                    marginTop: '0.5rem',
                    padding: '0.2rem 0.5rem',
                    backgroundColor: '#2A2A2A',
                    border: '1px solid #00CED1',
                    borderRadius: '4px',
                    color: '#00CED1',
                    fontSize: '0.75rem',
                  }}>
                    Crypto only
                  </span>
                )}
              </div>
              <Button
                onClick={() => onSelect(plan.id)}
                variant={isSelected ? 'primary' : 'secondary'}
                size="md"
              >
                {isSelected ? 'Selected' : 'Select'}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
