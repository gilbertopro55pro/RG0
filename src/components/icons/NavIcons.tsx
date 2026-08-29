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

export function IconCalendar({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17" />
      <path d="M8 3.5v4" />
      <path d="M16 3.5v4" />
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
      <circle cx="12" cy="12" r="6.2" />
      <circle cx="12" cy="12" r="2.1" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <rect key={deg} x="10.7" y="1.5" width="2.6" height="3" rx="0.7" transform={`rotate(${deg} 12 12)`} />
      ))}
    </svg>
  );
}

export function IconCalculator({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
      <path d="M8 7h8" />
      <path d="M8.3 11.2h.01M12 11.2h.01M15.7 11.2h.01M8.3 14.6h.01M12 14.6h.01M8.3 18h.01M12 18h.01" strokeWidth="2.2" />
      <path d="M15.7 14v4.3M13.7 16.1h4" />
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

export function IconContract({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6.5 3.5h8l3 3v14a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z" />
      <path d="M14 3.5v3.5h3.5" />
      <path d="M8.5 12.5l2.2 2.2 4.3-4.7" />
    </svg>
  );
}

export function IconTrash({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7" />
      <path d="M6.5 7l.9 12.3a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9L17.5 7" />
      <path d="M10.2 10.5v7" />
      <path d="M13.8 10.5v7" />
    </svg>
  );
}

export function IconChat({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8c-1.2 0-2.4-.3-3.4-.8L4 20.5l1.3-4.4C4.5 14.9 4 13.5 4 12z" />
      <path d="M8.5 11.5h7" />
      <path d="M8.5 14h4.5" />
    </svg>
  );
}
