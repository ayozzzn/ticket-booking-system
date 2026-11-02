import type { InputHTMLAttributes } from 'react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
}

export default function FormField({ label, id, className = '', ...inputProps }: FormFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        className={`w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 transition focus:border-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-700/15 ${className}`}
        {...inputProps}
      />
    </div>
  );
}
