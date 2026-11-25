/**
 * Static picture of a planned day: streets, a coast, a route and three
 * numbered stops in the day colours, with an idea pin waiting for its day.
 * Decorative: the headline says it.
 */
export function LandingIllustration({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 320 220" aria-hidden="true" focusable="false">
      <rect width="320" height="220" rx="16" fill="var(--color-bg)" />
      <path
        d="M0 168 C 60 150, 90 190, 150 176 S 250 140, 320 160 L 320 220 L 0 220 Z"
        fill="var(--color-primary-soft)"
      />
      <g stroke="var(--color-surface-raised)" strokeWidth="8" strokeLinecap="round" fill="none">
        <path d="M20 40 H 300" />
        <path d="M40 100 H 280" />
        <path d="M90 20 V 150" />
        <path d="M220 20 V 140" />
        <path d="M150 60 L 290 120" />
      </g>
      <g stroke="var(--color-border)" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M20 40 H 300" />
        <path d="M40 100 H 280" />
        <path d="M90 20 V 150" />
        <path d="M220 20 V 140" />
        <path d="M150 60 L 290 120" />
      </g>
      <rect x="110" y="110" width="26" height="26" rx="4" fill="var(--color-accent-soft)" />
      <rect x="236" y="60" width="34" height="22" rx="4" fill="var(--color-accent-soft)" />
      <path
        d="M90 52 C 120 52, 140 100, 170 98 S 220 70, 236 122"
        fill="none"
        stroke="var(--color-route-casing)"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M90 52 C 120 52, 140 100, 170 98 S 220 70, 236 122"
        fill="none"
        stroke="var(--day-1)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {[
        { x: 90, y: 52, n: 1, color: 'var(--day-1)' },
        { x: 170, y: 98, n: 2, color: 'var(--day-2)' },
        { x: 236, y: 122, n: 3, color: 'var(--day-3)' },
      ].map(({ x, y, n, color }) => (
        <g key={n}>
          <circle cx={x} cy={y} r="15" fill={color} stroke="#fff" strokeWidth="2.5" />
          <text
            x={x}
            y={y + 5}
            textAnchor="middle"
            fill="#fff"
            fontSize="14"
            fontWeight="700"
            fontFamily="var(--font-body)"
          >
            {n}
          </text>
        </g>
      ))}
      <circle
        cx="270"
        cy="36"
        r="9"
        fill="var(--color-surface)"
        stroke="var(--color-text)"
        strokeWidth="3"
      />
      <circle
        cx="56"
        cy="168"
        r="9"
        fill="var(--color-surface)"
        stroke="var(--color-text)"
        strokeWidth="3"
      />
    </svg>
  );
}
