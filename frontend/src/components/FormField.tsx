import { cloneElement } from 'react';
import type { ReactElement } from 'react';

export type FormFieldProps = {
  id: string;
  label: string;
  required?: boolean;
  error?: string | null;
  helpText?: string;
  children: ReactElement<Record<string, unknown>>;
};

export function FormField({
  id,
  label,
  required = false,
  error,
  helpText,
  children,
}: FormFieldProps): JSX.Element {
  const describedBy = error ? `${id}-error` : helpText ? `${id}-help` : undefined;

  const injectedChild = cloneElement(children, {
    id,
    'aria-required': required ? true : undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  });

  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {injectedChild}
      {helpText && !error && (
        <p id={`${id}-help`} className="mt-1 text-xs text-gray-500">
          {helpText}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
