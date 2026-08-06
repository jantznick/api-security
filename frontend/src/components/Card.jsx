/** Card only for interactive / form containers — not decorative chrome. */
export default function Card({ children, className = '' }) {
  return (
    <div className={`rounded-lg border border-ink-200 bg-white ${className}`}>{children}</div>
  );
}
