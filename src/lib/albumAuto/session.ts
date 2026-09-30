"use client";

import { useCallback, useSyncExternalStore } from "react";

// The auto designer's state lives here, outside React, keyed by gallery (owner, 2026-09-30). On a
// phone, turning the device unmounts the designer (portrait shows the rotate prompt), and turning it
// back even leaves the page and returns (albumRotateResume.ts). Both used to wipe everything the
// photographer had filled in and kill a running design. A module-level store survives both (the
// round trip is a client-side navigation, so this module stays loaded): the form comes back as it
// was, and a running design keeps going in the background. Remounting shows the point it reached.
// The session ends on cancel or once the album is created. A full page reload still starts over.

type Listener = () => void;

export type AutoDesignSession = {
  values: Map<string, unknown>;
  listeners: Set<Listener>;
  cancelRef: { current: boolean };
  skipFacesRef: { current: boolean };
  // The latest mounted designer's onCreate. The parent that started the run may be gone by the time
  // it finishes (the rotate round trip remounts the whole gallery page), so the save always goes
  // through whichever parent is mounted now.
  onCreate: ((result: never) => Promise<void>) | null;
  mounted: number;
  mountWaiters: (() => void)[];
};

const sessions = new Map<string, AutoDesignSession>();

export function hasAutoDesignSession(galleryId: string) {
  return sessions.has(galleryId);
}

export function getAutoDesignSession(galleryId: string): AutoDesignSession {
  let s = sessions.get(galleryId);
  if (!s) {
    s = { values: new Map(), listeners: new Set(), cancelRef: { current: false }, skipFacesRef: { current: false }, onCreate: null, mounted: 0, mountWaiters: [] };
    sessions.set(galleryId, s);
  }
  return s;
}

export function endAutoDesignSession(galleryId: string) {
  const s = sessions.get(galleryId);
  if (!s) return;
  s.cancelRef.current = true;
  sessions.delete(galleryId);
}

// Registers a mounted designer; returns the unmount cleanup.
export function mountAutoDesigner(s: AutoDesignSession, onCreate: (result: never) => Promise<void>) {
  s.onCreate = onCreate;
  s.mounted++;
  const waiters = s.mountWaiters.splice(0);
  for (const w of waiters) w();
  return () => {
    s.mounted--;
  };
}

// Resolves once a designer is mounted (right away when one is). A design that finished while the
// phone was in portrait waits here, and saves when the photographer turns it back.
export function waitForAutoDesigner(s: AutoDesignSession): Promise<void> {
  if (s.mounted > 0) return Promise.resolve();
  return new Promise((resolve) => s.mountWaiters.push(resolve));
}

// useState, but the value is kept in the session.
export function useSessionState<T>(s: AutoDesignSession, key: string, init: T | (() => T)) {
  if (!s.values.has(key)) s.values.set(key, typeof init === "function" ? (init as () => T)() : init);
  const subscribe = useCallback(
    (l: Listener) => {
      s.listeners.add(l);
      return () => {
        s.listeners.delete(l);
      };
    },
    [s]
  );
  const get = useCallback(() => s.values.get(key) as T, [s, key]);
  const value = useSyncExternalStore(subscribe, get, get);
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = s.values.get(key) as T;
      const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      if (Object.is(v, prev)) return;
      s.values.set(key, v);
      for (const l of [...s.listeners]) l();
    },
    [s, key]
  );
  return [value, set] as const;
}
