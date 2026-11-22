"use client";

import * as React from "react";

function widthBelow(breakpoint: number) {
  return {
    subscribe(onStoreChange: () => void) {
      if (typeof window === "undefined") return () => {};

      const mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
      mediaQuery.addEventListener("change", onStoreChange);

      return () => mediaQuery.removeEventListener("change", onStoreChange);
    },
    getSnapshot() {
      return typeof window !== "undefined" && window.innerWidth < breakpoint;
    },
  };
}

function getServerSnapshot() {
  return false;
}

// Below laptop width (phones and portrait tablets) the sidebar becomes a drawer.
const mobile = widthBelow(1024);
// Below tablet width, wide registers switch to record cards.
const phone = widthBelow(640);

export function useIsMobile() {
  return React.useSyncExternalStore(mobile.subscribe, mobile.getSnapshot, getServerSnapshot);
}

export function useIsPhone() {
  return React.useSyncExternalStore(phone.subscribe, phone.getSnapshot, getServerSnapshot);
}
