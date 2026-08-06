/** Decorative full-bleed: API surface as path network. */
export default function SurfaceMap({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 960 640"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="presentation"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="pathGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1a9b7a" stopOpacity="0.12" />
          <stop offset="45%" stopColor="#2dd4a8" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#0f7a62" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id="pathGradSoft" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0f7a62" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#1a9b7a" stopOpacity="0.45" />
        </linearGradient>
        <radialGradient id="fieldGlow" cx="72%" cy="28%" r="45%">
          <stop offset="0%" stopColor="#2dd4a8" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#2dd4a8" stopOpacity="0" />
        </radialGradient>
        <pattern
          id="microGrid"
          width="32"
          height="32"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M32 0H0V32"
            fill="none"
            stroke="#0f7a62"
            strokeOpacity="0.06"
            strokeWidth="1"
          />
        </pattern>
      </defs>

      <rect width="960" height="640" fill="url(#microGrid)" />
      <rect width="960" height="640" fill="url(#fieldGlow)" />

      <path
        className="surface-path"
        d="M40 520 C180 480, 220 360, 320 340 C420 320, 460 280, 520 200"
        stroke="url(#pathGrad)"
        strokeWidth="1.75"
      />
      <path
        className="surface-path-delay"
        d="M80 120 C200 160, 260 240, 380 260 C500 280, 560 340, 680 380"
        stroke="url(#pathGrad)"
        strokeWidth="1.5"
      />
      <path
        className="surface-path-late"
        d="M900 80 C760 140, 720 220, 620 280 C520 340, 480 420, 360 480"
        stroke="url(#pathGrad)"
        strokeWidth="1.5"
      />
      <path
        className="surface-path-delay"
        d="M120 400 C260 380, 340 300, 440 300 C560 300, 640 360, 760 520"
        stroke="url(#pathGradSoft)"
        strokeWidth="1.25"
      />
      <path
        className="surface-path-late"
        d="M700 90 C640 160, 600 200, 540 240"
        stroke="#0f7a62"
        strokeOpacity="0.28"
        strokeWidth="1"
      />

      <g className="surface-node">
        <circle cx="320" cy="340" r="14" fill="#2dd4a8" opacity="0.12" />
        <circle cx="320" cy="340" r="4.5" fill="#0f7a62" />
      </g>
      <g className="surface-node">
        <circle cx="520" cy="200" r="18" fill="#2dd4a8" opacity="0.1" />
        <circle cx="520" cy="200" r="5" fill="#1a9b7a" />
      </g>
      <g className="surface-node">
        <circle cx="380" cy="260" r="12" fill="#2dd4a8" opacity="0.1" />
        <circle cx="380" cy="260" r="3.5" fill="#0f7a62" />
      </g>
      <g className="surface-node">
        <circle cx="620" cy="280" r="16" fill="#2dd4a8" opacity="0.12" />
        <circle cx="620" cy="280" r="4.5" fill="#1a9b7a" />
      </g>
      <g className="surface-node">
        <circle cx="680" cy="380" r="11" fill="#2dd4a8" opacity="0.1" />
        <circle cx="680" cy="380" r="3.5" fill="#0f7a62" />
      </g>
      <g className="surface-node">
        <circle cx="440" cy="300" r="10" fill="#2dd4a8" opacity="0.1" />
        <circle cx="440" cy="300" r="3" fill="#0f7a62" />
      </g>
      <g className="surface-node">
        <circle cx="360" cy="480" r="13" fill="#2dd4a8" opacity="0.1" />
        <circle cx="360" cy="480" r="4" fill="#1a9b7a" />
      </g>
      <g className="surface-node">
        <circle cx="540" cy="240" r="9" fill="#2dd4a8" opacity="0.1" />
        <circle cx="540" cy="240" r="2.75" fill="#0f7a62" />
      </g>

      <g
        fill="#2a3c35"
        fontFamily="IBM Plex Mono, monospace"
        fontSize="11"
        opacity="0.5"
      >
        <text x="534" y="188">
          GET /users/:id
        </text>
        <text x="636" y="268">
          POST /orders
        </text>
        <text x="268" y="328">
          GET /health
        </text>
        <text x="372" y="502">
          PUT /api/v1/items/:id
        </text>
      </g>
    </svg>
  );
}
