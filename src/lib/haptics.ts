const STORAGE_KEY = "haptics-enabled";
const CHANGE_EVENT = "haptics-enabled-change";

export function isHapticsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === "1";
}

export function setHapticsEnabled(enabled: boolean) {
  window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function triggerHaptic(durationMs = 10) {
  if (!isHapticsEnabled()) return;
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(durationMs);
  }
}

// useSyncExternalStore plumbing so settings UI can read/react to the toggle without
// setState-in-effect hydration issues (localStorage isn't available during SSR).
export function subscribeHaptics(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function getHapticsSnapshot(): boolean {
  return isHapticsEnabled();
}

export function getHapticsServerSnapshot(): boolean {
  return true;
}
