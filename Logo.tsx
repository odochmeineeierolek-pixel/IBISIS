export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" aria-label="IBIS IV" role="img">
      <rect width="256" height="256" rx="56" fill="#050505" />
      <path d="M92 92C48 108 26 152 24 214C58 176 90 156 118 152Z" fill="#E3141F" />
      <circle cx="148" cy="108" r="58" fill="#E3141F" />
      <path d="M148 166 L148 226 L186 226" fill="none" stroke="#E3141F" strokeWidth="22" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="160" cy="98" r="11" fill="#050505" />
    </svg>
  );
}
