// A phone number typed or pasted from a Contacts/Messages app often carries invisible
// bidi-formatting marks (LRM/RLM/embedding/isolate characters) — confirmed against a real
// photographer's saved phone that broke a Finbot API call: "⁦+972 50-250-6030⁩" (U+2066/U+2069
// isolate marks). Stripping these out wherever a phone number is first entered keeps them out of
// the stored value entirely, rather than only cleaning up at each place that later reads it.
const BIDI_FORMATTING_CHARS = /[​-‏‪-‮⁦-⁩﻿]/g;

export function stripPhoneFormatting(raw: string): string {
  return raw.replace(BIDI_FORMATTING_CHARS, "").trim();
}
