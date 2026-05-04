import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../../src/components/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('CD-01: ESC calls onCancel', async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="確認"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('CD-02: overlay click calls onCancel', async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="確認"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    const overlay = screen.getByTestId('confirm-dialog-overlay');
    await userEvent.click(overlay);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('CD-03: dialog body click does not call onCancel', async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="確認"
        body={<div>Body content</div>}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByText('Body content'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('CD-04: requireConfirmText mismatch keeps confirm disabled', () => {
    render(
      <ConfirmDialog
        open
        title="削除"
        requireConfirmText="削除"
        confirmLabel="削除"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const confirmBtn = screen.getByRole('button', { name: '削除' });
    expect(confirmBtn).toBeDisabled();
  });

  it('CD-05: matching confirm text enables button and click triggers onConfirm', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="削除"
        requireConfirmText="削除"
        confirmLabel="削除"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const input = document.getElementById('confirm-dialog-input') as HTMLInputElement;
    await userEvent.type(input, '削除');
    const confirmBtn = screen.getByRole('button', { name: '削除' });
    expect(confirmBtn).not.toBeDisabled();
    await userEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('focuses first focusable element on open', async () => {
    render(
      <ConfirmDialog
        open
        title="削除"
        requireConfirmText="削除"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // wait for setTimeout(0)
    await new Promise((resolve) => setTimeout(resolve, 10));
    const input = document.getElementById('confirm-dialog-input');
    expect(document.activeElement).toBe(input);
  });

  it('Tab from last focusable wraps to first (focus trap)', async () => {
    render(
      <ConfirmDialog
        open
        title="削除"
        requireConfirmText="削除"
        confirmLabel="削除"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    const input = document.getElementById('confirm-dialog-input') as HTMLInputElement;
    const cancelBtn = screen.getByRole('button', { name: 'キャンセル' });
    // Last focusable is the disabled-looking confirm (it's disabled), so cancel is last enabled
    cancelBtn.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(input);
  });

  it('Shift+Tab from first focusable wraps to last', async () => {
    render(
      <ConfirmDialog
        open
        title="削除"
        requireConfirmText="削除"
        confirmLabel="削除"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    const input = document.getElementById('confirm-dialog-input') as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    // Should go to last focusable; cancel is last enabled (confirm is disabled because input empty)
    const cancelBtn = screen.getByRole('button', { name: 'キャンセル' });
    expect(document.activeElement).toBe(cancelBtn);
  });
});
