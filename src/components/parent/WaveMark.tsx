/** Decorative accent line-art used on Parent-portal cards (Payments, Profile). Purely visual. */
export function WaveMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 120" fill="none" aria-hidden="true" className={className}>
      <path
        d="M0 100 C 40 60, 60 100, 100 70 S 160 30, 200 60"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 5"
      />
      <path
        d="M0 115 C 40 80, 70 115, 110 90 S 165 55, 200 80"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 5"
      />
    </svg>
  );
}
