export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

export function getTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem(STORAGE_KEY, "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem(STORAGE_KEY, "light");
  }
}
