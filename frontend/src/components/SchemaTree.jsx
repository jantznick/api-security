function SchemaNode({ name, schema, depth = 0 }) {
  if (!schema) return null;
  const types = Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type;
  const required = schema.required || [];

  return (
    <div className={depth ? 'ml-4 border-l border-ink-200 pl-3' : ''}>
      <div className="flex flex-wrap items-baseline gap-2 py-1 font-mono text-sm">
        {name && <span className="text-ink-900">{name}</span>}
        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-xs text-ink-700">
          {types || '?'}
        </span>
        {name && required.includes(name) && (
          <span className="text-xs text-warn-700">required</span>
        )}
      </div>
      {schema.type === 'object' &&
        schema.properties &&
        Object.entries(schema.properties).map(([key, child]) => (
          <SchemaNode key={key} name={key} schema={child} depth={depth + 1} />
        ))}
      {schema.type === 'array' && schema.items && (
        <SchemaNode name="items" schema={schema.items} depth={depth + 1} />
      )}
    </div>
  );
}

export default function SchemaTree({ schema, title }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <h3 className="font-display text-sm font-semibold text-ink-900">{title}</h3>
      {!schema ? (
        <p className="mt-3 text-sm text-ink-500">
          No schema inferred yet. Schemas appear after request or response bodies are observed.
        </p>
      ) : (
        <div className="mt-3">
          <SchemaNode schema={schema} />
        </div>
      )}
    </div>
  );
}
