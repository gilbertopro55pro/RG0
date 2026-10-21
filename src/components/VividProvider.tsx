"use client";

import { createContext, useContext } from "react";

// Whether this account sees the "vivid" look (lib/tones.ts): set once in the root layout from the
// session, admin only for now. Components read it with useVivid() and keep their current look
// when it's off.
const VividContext = createContext(false);

export function VividProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <VividContext.Provider value={value}>{children}</VividContext.Provider>;
}

export function useVivid(): boolean {
  return useContext(VividContext);
}
