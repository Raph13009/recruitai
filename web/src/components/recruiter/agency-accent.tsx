"use client";

import { useLayoutEffect } from "react";
import { accentVars } from "@/lib/branding";

/**
 * Applies agency accent CSS variables on the sidebar wrapper after mount.
 * Avoids streaming a raw `<style>` tag (React hydration #418 / #441).
 */
export function AgencyAccent({ accent }: { accent: string }) {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]');
    if (!root) return;
    const vars = accentVars(accent);
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
    // Mobile sheet is portaled outside the wrapper — mirror accent on :root while on recruiter pages.
    const doc = document.documentElement;
    for (const [name, value] of Object.entries(vars)) {
      doc.style.setProperty(name, value);
    }
    return () => {
      for (const name of Object.keys(vars)) {
        root.style.removeProperty(name);
        doc.style.removeProperty(name);
      }
    };
  }, [accent]);

  return null;
}
