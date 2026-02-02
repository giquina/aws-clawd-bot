'use client';

import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          'block w-full rounded-md shadow-sm',
          'bg-white dark:bg-gray-700',
          'border-gray-300 dark:border-gray-600',
          'text-gray-900 dark:text-gray-100',
          'placeholder-gray-400 dark:placeholder-gray-500',
          'focus:border-primary-500 focus:ring-primary-500',
          'dark:focus:border-primary-500 dark:focus:ring-primary-500',
          'disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed',
          'px-3 py-2 text-sm border',
          'transition-colors duration-200',
          error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
          className
        )}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
