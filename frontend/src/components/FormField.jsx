export default function FormField({
  id,
  label,
  children,
  hint,
  className = '',
}) {
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink-800">
          {label}
        </label>
      ) : null}
      {children}
      {hint ? <p className="mt-1.5 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

export const inputClassName =
  'w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-signal-600 focus:outline-none focus:ring-2 focus:ring-signal-600/20';
