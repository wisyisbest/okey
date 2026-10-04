// Masadaki süsler: ince belli çay bardağı ve tabağı.
import { useId } from "react";

export function TeaGlass({ full = 0.8 }: { full?: number }) {
  const top = 10 + (1 - full) * 24;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg className="tea" viewBox="0 0 40 52" aria-hidden="true">
      <defs>
        <clipPath id={`g${id}`}>
          <path d="M9 6 C9 18 14 22 14 27 C14 32 8 36 9 46 L31 46 C32 36 26 32 26 27 C26 22 31 18 31 6 Z" />
        </clipPath>
        <linearGradient id={`l${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#c2410c" />
          <stop offset="1" stopColor="#7c1d06" />
        </linearGradient>
      </defs>
      <ellipse cx="20" cy="48" rx="18" ry="3.6" fill="#f4efe4" />
      <ellipse cx="20" cy="47.4" rx="12" ry="2" fill="#d9cfbd" />
      <g clipPath={`url(#g${id})`}>
        <rect x="0" y={top} width="40" height="52" fill={`url(#l${id})`} opacity="0.92" />
      </g>
      <path
        d="M9 6 C9 18 14 22 14 27 C14 32 8 36 9 46 L31 46 C32 36 26 32 26 27 C26 22 31 18 31 6 Z"
        fill="rgba(255,255,255,0.12)"
        stroke="rgba(255,255,255,0.75)"
        strokeWidth="1.2"
      />
      <path d="M12 9 C12 17 16 21 16 26" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" fill="none" />
      <g className="steam">
        <path d="M17 4 C15 1 19 -1 17 -4" />
        <path d="M23 4 C21 1 25 -1 23 -4" />
      </g>
    </svg>
  );
}

export function SugarBowl() {
  return (
    <svg className="sugar" viewBox="0 0 40 28" aria-hidden="true">
      <ellipse cx="20" cy="24" rx="17" ry="3.5" fill="#f4efe4" />
      <path d="M5 12 Q20 30 35 12 Z" fill="#1f5f9e" />
      <path d="M5 12 Q20 16 35 12" stroke="#f4efe4" strokeWidth="1.5" fill="none" />
      <rect x="12" y="6" width="7" height="7" rx="1" fill="#fff" />
      <rect x="20" y="5" width="7" height="7" rx="1" fill="#f1f1f1" />
      <rect x="16" y="2" width="7" height="7" rx="1" fill="#fafafa" />
    </svg>
  );
}
