// Hebrew source text → translation. A missing key falls back to the Hebrew text.
export type Messages = Record<string, string>;

// One file per area of the app under src/i18n/dict/, so parallel work never edits the same file.
export type AreaDict = { en: Messages; ru: Messages };
