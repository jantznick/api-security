export default function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}) {
  const variants = {
    primary: 'bg-ink-700 text-white hover:bg-ink-800',
    secondary: 'border border-ink-300 bg-white text-ink-800 hover:bg-ink-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };

  return (
    <button
      type="button"
      className={`inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant] || variants.primary} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
