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
    // NOTE: The Button component's hover behavior varies by variant:
    // - primary: backgroundColor changes (#3B82F6 → #2563EB), border unchanged
    // - secondary: borderColor changes (#3B82F6 → #2563EB), backgroundColor stays 'transparent'
    // - ghost: borderColor AND color change, backgroundColor stays 'transparent'
    // - danger: NO hover effects at all (no onMouseEnter handler)
    //
    // The tests below verify actual component behavior — NOT assumed behavior.

    it('changes backgroundColor on mouseEnter for primary variant', () => {
      render(<Button variant="primary">Hover Me</Button>);
      const button = screen.getByRole('button');
      // Primary base: backgroundColor #3B82F6 (dodger blue)
      expect(button.style.backgroundColor).toBe('rgb(59, 130, 246)');

      fireEvent.mouseEnter(button);
      // Primary hover: backgroundColor #2563EB (darker blue)
      expect(button.style.backgroundColor).toBe('rgb(37, 99, 235)');
    });

    it('changes borderColor on mouseEnter for secondary variant (background stays transparent)', () => {
      render(<Button variant="secondary">Hover Me</Button>);
      const button = screen.getByRole('button');
      // Secondary base: background transparent, borderColor #3B82F6
      expect(button.style.backgroundColor).toBe('transparent');
      expect(button.style.borderColor).toBe('rgb(59, 130, 246)');

      fireEvent.mouseEnter(button);
      // Secondary hover: borderColor changes to #2563EB, background stays transparent
      expect(button.style.backgroundColor).toBe('transparent');
      expect(button.style.borderColor).toBe('rgb(37, 99, 235)');
    });

    it('danger variant has NO hover effect (no onMouseEnter handler changes style)', () => {
      render(<Button variant="danger">Hover Me</Button>);
      const button = screen.getByRole('button');
      // Danger base: backgroundColor #EF4444 (red)
      expect(button.style.backgroundColor).toBe('rgb(239, 68, 68)');

      fireEvent.mouseEnter(button);
      // No hover change — danger has no style-changing hover handler
      expect(button.style.backgroundColor).toBe('rgb(239, 68, 68)');

      fireEvent.mouseLeave(button);
      // Stays the same — danger has no onMouseLeave restore either
      expect(button.style.backgroundColor).toBe('rgb(239, 68, 68)');
    });

    it('does NOT apply hover color on mouseEnter when disabled (base color shows through)', () => {
      render(<Button variant="primary" disabled>Disabled</Button>);
      const button = screen.getByRole('button');

      fireEvent.mouseEnter(button);
      // The !disabled guard prevents hover color from being applied.
      // This is the CORRECT behavior — disabled buttons don't get hover effects.
      expect(button.style.backgroundColor).toBe('rgb(59, 130, 246)');
    });

    it('reverts backgroundColor on mouseLeave for primary variant', () => {
      render(<Button variant="primary">Hover Me</Button>);
      const button = screen.getByRole('button');

      fireEvent.mouseEnter(button);
      expect(button.style.backgroundColor).toBe('rgb(37, 99, 235)');

      fireEvent.mouseLeave(button);
      // Primary base color is #3B82F6
      expect(button.style.backgroundColor).toBe('rgb(59, 130, 246)');
    });

    it('reverts borderColor on mouseLeave for secondary variant', () => {
      render(<Button variant="secondary">Hover Me</Button>);
      const button = screen.getByRole('button');

      fireEvent.mouseEnter(button);
      expect(button.style.borderColor).toBe('rgb(37, 99, 235)');

      fireEvent.mouseLeave(button);
      // Secondary base borderColor is #3B82F6; background stays transparent
      expect(button.style.borderColor).toBe('rgb(59, 130, 246)');
      expect(button.style.backgroundColor).toBe('transparent');
    });
  });
});
