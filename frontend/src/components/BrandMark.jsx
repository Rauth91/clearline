export default function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="clearline-waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2dd4a0" />
          <stop offset="100%" stopColor="#00c8f8" />
        </linearGradient>
        <linearGradient id="clearline-bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0f1e30" />
          <stop offset="100%" stopColor="#081528" />
        </linearGradient>
      </defs>

      <rect width="32" height="32" rx="8" fill="url(#clearline-bgGrad)" />
      <rect width="32" height="32" rx="8" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

      <path
        d="M4 16 h3.5 l2 -5 l3 9 l2.5 -6.5 l2 3.5 H28"
        stroke="url(#clearline-waveGrad)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle cx="16" cy="16" r="2" fill="#00c8f8" className="brand-pulse" opacity="0.9" />
    </svg>
  )
}
