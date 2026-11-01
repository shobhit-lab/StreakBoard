// The few icons StreakBoard uses. 24x24, stroke or fill follows currentColor.
const base = { width: 20, height: 20, viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false };

export const FlameIcon = (p) => (
  <svg {...base} fill="currentColor" {...p}>
    <path d="M12.6 2.5c.6 3.9 5.4 6.3 5.4 12a6 6 0 0 1-12 0c0-2.1.9-3.7 2.1-5 .3 1.6 1 2.6 2 3.1.6-3.3-.3-7.6 2.5-10.1z" />
  </svg>
);
export const SunIcon = (p) => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
export const MoonIcon = (p) => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </svg>
);
export const PencilIcon = (p) => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
  </svg>
);
export const ArchiveIcon = (p) => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="3" y="4" width="18" height="5" rx="1.5" />
    <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" />
  </svg>
);
export const CheckIcon = (p) => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
