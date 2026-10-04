import type { Messages } from "@/i18n/types";

export type TVars = Record<string, string | number>;
export type TFn = (key: string, vars?: TVars) => string;

// t("נשארו {n} ימים", { n: 3 }): the Hebrew text is the key; {name} placeholders are filled in
// after the lookup, in every language (Hebrew included).
export function translate(messages: Messages, key: string, vars?: TVars): string {
  const text = messages[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export function makeT(messages: Messages): TFn {
  return (key, vars) => translate(messages, key, vars);
}
