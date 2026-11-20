"use client";

import { useEffect, useRef } from "react";

/**
 * Closes a popup menu when the user clicks/taps outside it or presses Escape.
 * Attach the returned ref to the element that wraps both the trigger and the menu.
 */
export function useDismiss<T extends HTMLElement = HTMLDivElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      closeRef.current();
      // Return focus to the menu's trigger button.
      ref.current?.querySelector<HTMLElement>("[aria-expanded]")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return ref;
}
