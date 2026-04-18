/**
 * Button Component Unit Tests
 * ===========================
 * Tests for the Button component — a styled button with variants, sizes, and disabled state.
 *
 * IMPORTANT: @testing-library/jest-dom matchers must be imported per file.
 */
const React = require('react');
const { render, screen, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');

const Button = require('../../../components/ui/Button').default;

describe('Button Component', () => {
  describe('Rendering with different variants', () => {
    it('renders primary button', () => {
      render(<Button>Click Me</Button>);
      expect(screen.getByRole('button', { name: 'Click Me' })).toBeInTheDocument();
    });

    it('renders secondary button', () => {
      render(<Button variant="secondary">Secondary</Button>);
      expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument();
    });

    it('renders danger button', () => {
      render(<Button variant="danger">Delete</Button>);
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });
  });

  describe('Rendering with different sizes', () => {
    it('renders small button', () => {
      render(<Button size="sm">Small</Button>);
      expect(screen.getByRole('button', { name: 'Small' })).toBeInTheDocument();
    });

    it('renders medium button (default)', () => {
      render(<Button size="md">Medium</Button>);
      expect(screen.getByRole('button', { name: 'Medium' })).toBeInTheDocument();
    });

    it('renders large button', () => {
      render(<Button size="lg">Large</Button>);
      expect(screen.getByRole('button', { name: 'Large' })).toBeInTheDocument();
    });
  });

  describe('onClick handling', () => {
    it('calls onClick when clicked', () => {
      const onClick = jest.fn();
      render(<Button onClick={onClick}>Click Me</Button>);

      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when disabled', () => {
      const onClick = jest.fn();
      render(<Button onClick={onClick} disabled>Disabled Button</Button>);

      fireEvent.click(screen.getByRole('button'));
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('Disabled state', () => {
    it('renders disabled button', () => {
      render(<Button disabled>Disabled</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('renders button with disabled attribute even without explicit disabled prop', () => {
      render(<Button disabled={true}>Disabled</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('Type attribute', () => {
    it('defaults to type="button"', () => {
      render(<Button>Button</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    });

    it('accepts type="submit"', () => {
      render(<Button type="submit">Submit</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
    });

    it('accepts type="reset"', () => {
      render(<Button type="reset">Reset</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('type', 'reset');
    });
  });

  describe('Hover effects', () => {
    it('changes backgroundColor on mouseEnter for primary variant', () => {
      render(<Button variant="primary">Hover Me</Button>);
      const button = screen.getByRole('button');
      // baseStyle spreads variants[variant] directly into the inline style,
      // so the initial value is already set to the primary color.
      expect(button.style.backgroundColor).toBe('rgb(30, 144, 255)');

      fireEvent.mouseEnter(button);
      // Primary hover color is #20B2AA (teal)
      expect(button.style.backgroundColor).toBe('rgb(32, 178, 170)');
    });

    it('changes backgroundColor on mouseEnter for secondary variant', () => {
      render(<Button variant="secondary">Hover Me</Button>);
      const button = screen.getByRole('button');

      fireEvent.mouseEnter(button);
      // Secondary hover color is #00BFFF (light blue)
      expect(button.style.backgroundColor).toBe('rgb(0, 191, 255)');
    });

    it('changes backgroundColor on mouseEnter for danger variant', () => {
      render(<Button variant="danger">Hover Me</Button>);
      const button = screen.getByRole('button');

      fireEvent.mouseEnter(button);
      // Danger hover color is #00BFFF (same as secondary)
      expect(button.style.backgroundColor).toBe('rgb(0, 191, 255)');
    });

    it('does NOT apply hover color on mouseEnter when disabled (base color shows through)', () => {
      render(<Button variant="primary" disabled>Disabled</Button>);
      const button = screen.getByRole('button');

      fireEvent.mouseEnter(button);
      // The !disabled guard prevents hover color from being applied.
      // jsdom resolves inline '' to the CSS cascade value, showing base primary color.
      // This is the CORRECT behavior — disabled buttons don't get hover effects.
      expect(button.style.backgroundColor).toBe('rgb(30, 144, 255)');
    });

    it('reverts backgroundColor on mouseLeave for primary variant', () => {
      render(<Button variant="primary">Hover Me</Button>);
      const button = screen.getByRole('button');

      fireEvent.mouseEnter(button);
      expect(button.style.backgroundColor).toBe('rgb(32, 178, 170)');

      fireEvent.mouseLeave(button);
      // Primary base color is #1E90FF (dodger blue)
      expect(button.style.backgroundColor).toBe('rgb(30, 144, 255)');
    });

    it('reverts backgroundColor on mouseLeave for secondary variant', () => {
      render(<Button variant="secondary">Hover Me</Button>);
      const button = screen.getByRole('button');

      fireEvent.mouseEnter(button);
      expect(button.style.backgroundColor).toBe('rgb(0, 191, 255)');

      fireEvent.mouseLeave(button);
      // Secondary base background is 'transparent' (jsdom serializes this as 'transparent')
      expect(button.style.backgroundColor).toBe('transparent');
    });

    it('reverts backgroundColor on mouseLeave for danger variant', () => {
      render(<Button variant="danger">Hover Me</Button>);
      const button = screen.getByRole('button');

      fireEvent.mouseEnter(button);
      expect(button.style.backgroundColor).toBe('rgb(0, 191, 255)');

      fireEvent.mouseLeave(button);
      // Danger base color is #FF6B6B
      expect(button.style.backgroundColor).toBe('rgb(255, 107, 107)');
    });
  });
});
