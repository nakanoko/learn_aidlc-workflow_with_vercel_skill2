import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../../src/components/StatusBadge';

describe('StatusBadge', () => {
  it('SB-01: pending renders amber palette and 承認待ち label', () => {
    render(<StatusBadge status="pending" />);
    const badge = screen.getByText('承認待ち');
    expect(badge.className).toContain('bg-amber-100');
    expect(badge.className).toContain('text-amber-800');
    expect(badge).toHaveAttribute('aria-label', 'ステータス: 承認待ち');
  });

  it('SB-02: approved renders emerald palette and 承認済 label', () => {
    render(<StatusBadge status="approved" />);
    const badge = screen.getByText('承認済');
    expect(badge.className).toContain('bg-emerald-100');
    expect(badge.className).toContain('text-emerald-800');
  });

  it('SB-03: rejected renders gray palette and 差戻し済 label', () => {
    render(<StatusBadge status="rejected" />);
    const badge = screen.getByText('差戻し済');
    expect(badge.className).toContain('bg-gray-200');
    expect(badge.className).toContain('text-gray-700');
  });

  it('SB-04: mismatch renders red palette and 不一致 label', () => {
    render(<StatusBadge status="mismatch" />);
    const badge = screen.getByText('不一致');
    expect(badge.className).toContain('bg-red-100');
    expect(badge.className).toContain('text-red-800');
  });
});
