/**
 * AhoyVPN Frontend — Smoke Test
 * =============================
 * Verifies the Jest + RTL infrastructure is properly configured.
 * Tests the minimum: can we render React and use @testing-library/react?
 */
const React = require('react');
const { render, screen } = require('@testing-library/react');

describe('Smoke Test — Jest Infrastructure', () => {
  it('should render a simple React component in jsdom', () => {
    const { container } = render(React.createElement('div', null, 'Hello from Jest'));
    expect(container.textContent).toBe('Hello from Jest');
  });

  it('should render a React component with children', () => {
    const { container } = render(
      React.createElement(
        'div',
        null,
        React.createElement('span', null, 'Hello'),
        React.createElement('span', null, ' World')
      )
    );
    expect(container.querySelectorAll('span').length).toBe(2);
  });

  it('should use @testing-library/react render function', () => {
    // Using RTL's render() which wraps React Testing Library's render
    // This verifies jsdom environment is properly configured
    const TestComponent = () => React.createElement('p', { id: 'test-p' }, 'Test paragraph');
    render(React.createElement(TestComponent));
    expect(document.getElementById('test-p').textContent).toBe('Test paragraph');
  });
});
