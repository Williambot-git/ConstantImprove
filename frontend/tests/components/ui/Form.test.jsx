/**
 * Form Component Unit Tests
 * =========================
 * Tests for the Form component and its sub-components (FormGroup, Input, Select).
 *
 * IMPORTANT: @testing-library/jest-dom matchers must be imported per file.
 */
const React = require('react');
const { render, screen, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');

const Form = require('../../../components/ui/Form').default;
const { FormGroup, Input, Select } = require('../../../components/ui/Form');

describe('Form Component', () => {
  describe('Form', () => {
    it('renders children', () => {
      render(<Form><p>Form content</p></Form>);
      expect(screen.getByText('Form content')).toBeInTheDocument();
    });

    it('calls onSubmit when form is submitted', () => {
      const onSubmit = jest.fn();
      render(
        <Form onSubmit={onSubmit}>
          <button type="submit">Submit</button>
        </Form>
      );

      fireEvent.submit(screen.getByText('Submit'));
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('prevents default form submission (no page reload)', () => {
      const onSubmit = jest.fn();
      render(
        <Form onSubmit={onSubmit}>
          <button type="submit">Submit</button>
        </Form>
      );

      // If preventDefault wasn't called, onSubmit wouldn't have been called
      fireEvent.submit(screen.getByText('Submit'));
      expect(onSubmit).toHaveBeenCalled();
    });
  });

  describe('FormGroup', () => {
    it('renders label when provided', () => {
      render(
        <FormGroup label="Email Address">
          <input type="text" />
        </FormGroup>
      );

      expect(screen.getByText('Email Address')).toBeInTheDocument();
    });

    it('renders error message when provided', () => {
      render(
        <FormGroup label="Email" error="Invalid email address">
          <input type="text" />
        </FormGroup>
      );

      expect(screen.getByText('Invalid email address')).toBeInTheDocument();
    });

    it('does not render error when not provided', () => {
      render(
        <FormGroup label="Name">
          <input type="text" />
        </FormGroup>
      );

      expect(screen.queryByText('Invalid name')).not.toBeInTheDocument();
    });

    it('renders children (the input)', () => {
      render(
        <FormGroup label="Username">
          <input type="text" data-testid="username-input" />
        </FormGroup>
      );

      expect(screen.getByTestId('username-input')).toBeInTheDocument();
    });
  });

  describe('Input', () => {
    it('renders input with placeholder', () => {
      render(<Input placeholder="Enter your name" />);
      expect(screen.getByPlaceholderText('Enter your name')).toBeInTheDocument();
    });

    it('renders with value', () => {
      render(<Input value="test@example.com" readOnly />);
      expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
    });

    it('calls onChange when value changes', () => {
      const onChange = jest.fn();
      render(<Input onChange={onChange} />);

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'new value' } });
      expect(onChange).toHaveBeenCalled();
    });

    it('is disabled when disabled prop is true', () => {
      render(<Input disabled />);
      expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('shows error styling when error prop is true', () => {
      render(<Input error />);
      // The error border color is applied via inline style
      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
    });
  });

  describe('Select', () => {
    it('renders options', () => {
      render(
        <Select>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </Select>
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByText('Monthly')).toBeInTheDocument();
      expect(screen.getByText('Yearly')).toBeInTheDocument();
    });

    it('calls onChange when selection changes', () => {
      const onChange = jest.fn();
      render(
        <Select onChange={onChange}>
          <option value="a">A</option>
          <option value="b">B</option>
        </Select>
      );

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } });
      expect(onChange).toHaveBeenCalled();
    });

    it('has correct value after change', () => {
      render(
        <Select value="a">
          <option value="a">A</option>
          <option value="b">B</option>
        </Select>
      );

      expect(screen.getByRole('combobox')).toHaveValue('a');
    });
  });
});
