import type { MouseEvent, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'disabled';

export type ButtonProps = {
  variant?: ButtonVariant;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary-700 hover:bg-primary-900 text-white',
  secondary: 'bg-white hover:bg-gray-100 text-primary-700 border border-primary-700',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  ghost: 'bg-transparent hover:bg-gray-100 text-gray-700',
  disabled: 'bg-gray-200 text-gray-500 cursor-not-allowed',
};

const BASE =
  'px-4 py-2 rounded-md font-medium text-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed';

function classNames(...classes: Array<string | undefined | false>): string {
  return classes.filter(Boolean).join(' ');
}

export function Button({
  variant = 'primary',
  type = 'button',
  disabled = false,
  onClick,
  children,
  className,
  'aria-label': ariaLabel,
}: ButtonProps): JSX.Element {
  const effectiveVariant: ButtonVariant = disabled ? 'disabled' : variant;
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className={classNames(BASE, VARIANT_CLASSES[effectiveVariant], className)}
    >
      {children}
    </button>
  );
}
