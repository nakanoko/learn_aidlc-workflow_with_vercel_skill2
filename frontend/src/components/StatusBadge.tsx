import type { InvoiceStatus } from '../types/invoice';

type StatusBadgeProps = {
  status: InvoiceStatus;
  className?: string;
};

const STATUS_STYLES: Record<InvoiceStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-800', label: '承認待ち' },
  approved: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: '承認済' },
  rejected: { bg: 'bg-gray-200', text: 'text-gray-700', label: '差戻し済' },
  mismatch: { bg: 'bg-red-100', text: 'text-red-800', label: '不一致' },
};

function classNames(...classes: Array<string | undefined | false>): string {
  return classes.filter(Boolean).join(' ');
}

export function StatusBadge({ status, className }: StatusBadgeProps): JSX.Element {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={classNames(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
        style.bg,
        style.text,
        className,
      )}
      aria-label={`ステータス: ${style.label}`}
    >
      {style.label}
    </span>
  );
}

export { STATUS_STYLES };
