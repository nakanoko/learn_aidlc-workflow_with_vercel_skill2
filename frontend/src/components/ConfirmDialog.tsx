import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body?: ReactNode;
  requireConfirmText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  confirmDisabled?: boolean;
};

const FOCUSABLE_SELECTOR =
  'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

export function ConfirmDialog({
  open,
  title,
  body,
  requireConfirmText,
  confirmLabel,
  cancelLabel,
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
  loading = false,
  confirmDisabled: confirmDisabledProp = false,
}: ConfirmDialogProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [confirmInput, setConfirmInput] = useState('');

  useEffect(() => {
    if (!open) {
      setConfirmInput('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFirst = () => {
      if (!dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length > 0) {
        focusables[0].focus();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (event.shiftKey) {
          if (active === first || !dialogRef.current.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (active === last || !dialogRef.current.contains(active)) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    };

    // Defer focus to ensure dialog DOM mounted
    const focusTimer = setTimeout(focusFirst, 0);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onCancel]);

  if (!open) return null;

  const confirmDisabled =
    loading ||
    confirmDisabledProp ||
    (requireConfirmText !== undefined && confirmInput.trim() !== requireConfirmText);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-40 flex items-center justify-center"
    >
      <div
        data-testid="confirm-dialog-overlay"
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />
      <div
        ref={dialogRef}
        className="relative bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-gray-900 mb-4">
          {title}
        </h2>
        {body && <div className="text-sm text-gray-700 mb-4">{body}</div>}
        {requireConfirmText !== undefined && (
          <div className="mb-4">
            <label
              htmlFor="confirm-dialog-input"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              確認のため「{requireConfirmText}」と入力してください
              <span className="text-red-500 ml-1" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="confirm-dialog-input"
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              aria-required="true"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        )}
        <div className="flex gap-2 justify-end mt-6">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel ?? 'キャンセル'}
          </Button>
          <Button
            variant={confirmVariant}
            disabled={confirmDisabled}
            onClick={() => {
              void onConfirm();
            }}
          >
            {confirmLabel ?? 'OK'}
          </Button>
        </div>
      </div>
    </div>
  );
}
