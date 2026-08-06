export default function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  titleClassName = '',
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-2">{breadcrumb}</div> : null}
        <h1
          className={`text-2xl font-bold tracking-tight text-ink-900 ${titleClassName || 'font-display'}`}
        >
          {title}
        </h1>
        {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
