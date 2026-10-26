"use client";

// The on/off switch of the reminder settings (ReminderToggleSettings, MorningDigestSettings).
export default function ToggleSwitch({
  checked,
  onClick,
  disabled,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5 disabled:opacity-60"
      style={{ background: checked ? "var(--color-sage)" : "var(--color-line)", justifyContent: checked ? "flex-end" : "flex-start" }}
    >
      <span className="h-5 w-5 rounded-full bg-white shadow" />
    </button>
  );
}
