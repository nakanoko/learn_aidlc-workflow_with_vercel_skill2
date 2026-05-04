import { useEffect, useState } from 'react';
import { toastStore } from './Toast';
import type { ToastItem, ToastVariant } from './Toast';

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-primary-100 border-primary-500 text-primary-700',
};

const AUTO_DISMISS_MS = 3000;

function variantRoleProps(
  variant: ToastVariant,
): { role: 'alert' | 'status'; 'aria-live': 'assertive' | 'polite' } {
  if (variant === 'error') {
    return { role: 'alert', 'aria-live': 'assertive' };
  }
  return { role: 'status', 'aria-live': 'polite' };
}

export function Toaster(): JSX.Element | null {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsubscribe = toastStore.subscribe(setItems);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    const timers = items.map((item) =>
      setTimeout(() => toastStore.remove(item.id), AUTO_DISMISS_MS),
    );
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
      {items.map((item) => {
        const roleProps = variantRoleProps(item.variant);
        return (
          <div
            key={item.id}
            role={roleProps.role}
            aria-live={roleProps['aria-live']}
            className={`px-4 py-3 rounded-md border shadow-md max-w-sm pointer-events-auto ${VARIANT_CLASSES[item.variant]}`}
          >
            {item.message}
          </div>
        );
      })}
    </div>
  );
}
