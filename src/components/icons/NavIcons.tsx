type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconHome({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 11.5 12 4.5l8 7" />
      <path d="M6 10v8.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10" />
      <path d="M10 19.5v-5a2 2 0 0 1 4 0v5" />
    </svg>
  );
}

export function IconGallery({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <circle cx="8.3" cy="9.7" r="1.4" />
      <path d="M4.5 17l4-4.3 3 3 3-3.4 5 4.7" />
    </svg>
  );
}

export function IconLink({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <g transform="rotate(45 12 12)">
        <rect x="4.5" y="9.2" width="7.6" height="5.6" rx="2.8" />
        <rect x="11.9" y="9.2" width="7.6" height="5.6" rx="2.8" />
      </g>
    </svg>
  );
}

export function IconLeads({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="8.2" r="3.3" />
      <path d="M5.5 19.5c0-3.9 2.9-6.3 6.5-6.3s6.5 2.4 6.5 6.3" />
    </svg>
  );
}

export function IconWaitlist({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7.2 4h9.6" />
      <path d="M7.2 20h9.6" />
      <path d="M8 4.3c.4 3.9 2.2 5.3 4 7.2 1.8-1.9 3.6-3.3 4-7.2" />
      <path d="M8 19.7c.4-3.9 2.2-5.3 4-7.2 1.8 1.9 3.6 3.3 4 7.2" />
    </svg>
  );
}

export function IconAnalytics({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 20V13.5" />
      <path d="M12 20V6" />
      <path d="M19.5 20v-9" />
      <path d="M3.5 20.5h17" />
    </svg>
  );
}

export function IconSettings({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.4M12 18.6V21M21 12h-2.4M5.4 12H3M18.36 5.64l-1.7 1.7M7.34 16.66l-1.7 1.7M18.36 18.36l-1.7-1.7M7.34 7.34l-1.7-1.7" />
    </svg>
  );
}

export function IconTrend({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 16l5-5 3.5 3.5L20 7" />
      <path d="M14.5 7H20v5.5" />
    </svg>
  );
}
