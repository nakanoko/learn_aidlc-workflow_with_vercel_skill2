import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormField } from '../../src/components/FormField';

describe('FormField', () => {
  it('FF-01: required shows * and aria-required', () => {
    render(
      <FormField id="x" label="名前" required>
        <input type="text" />
      </FormField>,
    );
    expect(screen.getByText('*')).toBeInTheDocument();
    const input = document.getElementById('x') as HTMLInputElement;
    expect(input).toHaveAttribute('aria-required', 'true');
  });

  it('FF-02: error sets role=alert and aria-invalid + aria-describedby', () => {
    render(
      <FormField id="y" label="名前" error="必須です">
        <input type="text" />
      </FormField>,
    );
    const errorEl = screen.getByRole('alert');
    expect(errorEl).toHaveTextContent('必須です');
    expect(errorEl.id).toBe('y-error');
    const input = document.getElementById('y') as HTMLInputElement;
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'y-error');
  });

  it('renders helpText when no error', () => {
    render(
      <FormField id="z" label="ラベル" helpText="ヘルプ">
        <input type="text" />
      </FormField>,
    );
    expect(screen.getByText('ヘルプ')).toBeInTheDocument();
    const input = document.getElementById('z') as HTMLInputElement;
    expect(input).toHaveAttribute('aria-describedby', 'z-help');
  });
});
