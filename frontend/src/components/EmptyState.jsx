export default function EmptyState({ title, description, action }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-display text-base font-semibold text-ink-900">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">{description}</p>
      ) : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}
