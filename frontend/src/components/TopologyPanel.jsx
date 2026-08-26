/**
 * Compact caller → endpoint adjacency + simple SVG for blast-radius UX.
 */
export default function TopologyPanel({ topology, title = 'Who hits this service?' }) {
  const callers = topology?.callers || [];
  const edges = topology?.edges || [];

  if (callers.length === 0) {
    return (
      <div className="rounded-lg border border-ink-200 bg-white px-4 py-5 text-sm text-ink-600">
        <h2 className="font-display text-base font-semibold text-ink-900">{title}</h2>
        <p className="mt-1 text-ink-500">
          No caller edges yet. Callers that send{' '}
          <code className="font-mono text-ink-800">x-service-name</code> (or{' '}
          <code className="font-mono text-ink-800">x-client-name</code>) appear here as
          separate nodes.
        </p>
      </div>
    );
  }

  const leftX = 24;
  const rightX = 280;
  const rowH = 36;
  const height = Math.max(80, callers.length * rowH + 24);
  const endpointLabels = [...new Set(edges.map((e) => `${e.method} ${e.pathTemplate}`))];
  const epY = (i) => 20 + i * Math.min(rowH, (height - 40) / Math.max(endpointLabels.length, 1));
  const callerY = (i) => 20 + i * rowH;

  return (
    <div className="rounded-lg border border-ink-200 bg-white px-4 py-5">
      <h2 className="font-display text-base font-semibold text-ink-900">{title}</h2>
      <p className="mt-1 text-sm text-ink-500">
        Blast radius from observed callers — not full APM. {callers.length} caller
        {callers.length === 1 ? '' : 's'}, {edges.length} edge
        {edges.length === 1 ? '' : 's'}.
      </p>

      <div className="mt-4 overflow-x-auto">
        <svg
          width={Math.max(360, rightX + 200)}
          height={height}
          role="img"
          aria-label="Caller to endpoint topology"
          className="text-ink-800"
        >
          {callers.map((c, i) => {
            const cy = callerY(i);
            return (
              <g key={c.id}>
                <circle cx={leftX} cy={cy} r={8} fill="#1f6feb" />
                <text x={leftX + 14} y={cy + 4} className="fill-ink-800" fontSize="12">
                  {c.name}
                </text>
              </g>
            );
          })}
          {endpointLabels.map((label, i) => (
            <g key={label}>
              <rect
                x={rightX}
                y={epY(i) - 10}
                width={Math.min(220, 12 + label.length * 7)}
                height={20}
                rx={3}
                fill="#f3f4f6"
                stroke="#d1d5db"
              />
              <text x={rightX + 8} y={epY(i) + 4} className="fill-ink-700" fontSize="11" fontFamily="ui-monospace, monospace">
                {label}
              </text>
            </g>
          ))}
          {edges.map((e) => {
            const ci = callers.findIndex((c) => c.id === e.from);
            const ei = endpointLabels.indexOf(`${e.method} ${e.pathTemplate}`);
            if (ci < 0 || ei < 0) return null;
            const y1 = callerY(ci);
            const y2 = epY(ei);
            return (
              <line
                key={`${e.from}-${e.to}-${e.hitCount}`}
                x1={leftX + 8}
                y1={y1}
                x2={rightX}
                y2={y2}
                stroke="#9ca3af"
                strokeWidth={Math.min(4, 1 + Math.log10(e.hitCount + 1))}
                opacity={0.7}
              />
            );
          })}
        </svg>
      </div>

      <ul className="mt-4 divide-y divide-ink-100 border-t border-ink-100">
        {callers.map((c) => (
          <li key={c.id} className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium text-ink-900">{c.name}</p>
              <p className="text-xs text-ink-500">
                {c.hitCount} hits · {c.uaFamily}
                {c.callerSource ? ` · via ${c.callerSource}` : ''}
              </p>
            </div>
            <ul className="mt-1 space-y-0.5">
              {(c.endpoints || []).map((ep) => (
                <li
                  key={`${ep.method}-${ep.pathTemplate}`}
                  className="font-mono text-xs text-ink-600"
                >
                  {ep.method} {ep.pathTemplate}{' '}
                  <span className="text-ink-400">×{ep.hitCount}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
