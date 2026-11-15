import type { InputHTMLAttributes } from 'react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
}

export default function FormField({ label, id, className = '', ...inputProps }: FormFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-wine-900">
        {label}
      </label>
      <input
        id={id}
        className={`w-full rounded-xl border border-wine-900/25 bg-white px-4 py-3 text-wine-900 placeholder:text-wine-900/40 transition focus:border-crimson focus:outline-none focus:ring-4 focus:ring-crimson/15 disabled:opacity-60 ${className}`}
        {...inputProps}
      />
    </div>
  );
}