import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../../src/components/Button';

describe('Button', () => {
  it('BT-01: primary contains bg-primary-700', () => {
    render(<Button variant="primary">OK</Button>);
    expect(screen.getByRole('button').className).toContain('bg-primary-700');
  });

  it('BT-02: disabled prevents onClick', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        OK
      </Button>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('BT-03: variant=disabled has cursor-not-allowed', () => {
    render(<Button variant="disabled">OK</Button>);
    expect(screen.getByRole('button').className).toContain('cursor-not-allowed');
  });

  it('renders danger variant', () => {
    render(<Button variant="danger">削除</Button>);
    expect(screen.getByRole('button').className).toContain('bg-red-600');
  });

  it('renders secondary variant', () => {
    render(<Button variant="secondary">保存</Button>);
    expect(screen.getByRole('button').className).toContain('text-primary-700');
  });

  it('renders ghost variant', () => {
    render(<Button variant="ghost">キャンセル</Button>);
    expect(screen.getByRole('button').className).toContain('bg-transparent');
  });
});
