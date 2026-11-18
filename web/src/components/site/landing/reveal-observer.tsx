"use client";

import { useEffect } from "react";

/**
 * Reveals every [data-reveal] element of the page once it scrolls into view (see globals.css).
 * Mounted once per page; elements stay revealed.
 */
export function RevealObserver() {
  useEffect(() => {
    const pending = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-shown])"));
    if (!("IntersectionObserver" in window)) {
      pending.forEach((el) => el.setAttribute("data-shown", ""));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-shown", "");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    pending.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return null;
}
