/**
 * Static picture of a planned day: streets, a coast, a route and three
 * numbered stops in the day colours. Decorative: the headline says it.
 */
export function LandingIllustration({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 320 220" aria-hidden="true" focusable="false">
      <rect width="320" height="220" rx="16" fill="var(--color-surface)" />
      <path
        d="M0 168 C 60 150, 90 190, 150 176 S 250 140, 320 160 L 320 220 L 0 220 Z"
        fill="var(--color-primary-soft)"
      />
      <g stroke="var(--color-border)" strokeWidth="6" strokeLinecap="round" fill="none">
        <path d="M20 40 H 300" />
        <path d="M40 100 H 280" />
        <path d="M90 20 V 150" />
        <path d="M220 20 V 140" />
        <path d="M150 60 L 290 120" />
      </g>
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
        { x: 90, y: 52, n: 1 },
        { x: 170, y: 98, n: 2 },
        { x: 236, y: 122, n: 3 },
      ].map(({ x, y, n }) => (
        <g key={n}>
          <circle cx={x} cy={y} r="14" fill="var(--day-1)" stroke="#fff" strokeWidth="2" />
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
        cy="56"
        r="9"
        fill="var(--color-surface)"
        stroke="var(--color-accent)"
        strokeWidth="3"
      />
    </svg>
  );
}
