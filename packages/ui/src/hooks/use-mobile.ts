"use client";

import * as React from "react";

// Below laptop width (phones and portrait tablets) the sidebar becomes a drawer.
const MOBILE_BREAKPOINT = 1024;

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mediaQuery.addEventListener("change", onStoreChange);

  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
  return typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;
}

function getServerSnapshot() {
  return false;
}
