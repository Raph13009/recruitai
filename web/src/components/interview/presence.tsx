"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The interviewer's on-screen presence when there is no video: a calm orb that swells with the
 * voice. `getLevel` is read on every animation frame (0 to 1), so no React re-render is needed.
 */
export function Presence({
  name,
  speaking,
  getLevel,
  className,
}: {
  name: string;
  speaking: boolean;
  getLevel: () => number;
  className?: string;
}) {
  const core = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let smooth = 0;
    const loop = () => {
      const level = Math.max(0, Math.min(1, getLevel()));
      // Fast attack, slow release: the orb follows syllables without flickering.
      smooth = level > smooth ? smooth + (level - smooth) * 0.5 : smooth + (level - smooth) * 0.12;
      if (core.current) core.current.style.transform = `scale(${1 + smooth * 0.14})`;
      if (halo.current) {
        halo.current.style.transform = `scale(${1 + smooth * 0.55})`;
        halo.current.style.opacity = String(0.25 + smooth * 0.55);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [getLevel]);

  return (
    <div className={cn("flex flex-col items-center justify-center gap-8", className)}>
      <div className="relative grid size-44 place-items-center sm:size-56">
        {speaking && (
          <>
            <span aria-hidden className="absolute inset-0 rounded-full border border-primary/45 motion-safe:animate-ring-out" />
            <span aria-hidden className="absolute inset-0 rounded-full border border-primary/30 motion-safe:animate-ring-out [animation-delay:1.2s]" />
          </>
        )}
        <div ref={halo} aria-hidden className="absolute inset-3 rounded-full bg-primary/30 opacity-25 blur-2xl will-change-transform" />
        <div
          ref={core}
          className="relative grid size-32 place-items-center rounded-full bg-gradient-to-br from-brand to-[color-mix(in_oklab,var(--brand),black_25%)] shadow-[0_0_0_1px_rgb(243_238_228/0.12)_inset,0_30px_80px_-20px_var(--brand)] will-change-transform sm:size-40"
        >
          <span className="display text-6xl font-normal text-brand-foreground sm:text-7xl">
            {name.trim().charAt(0).toUpperCase() || "C"}
          </span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {speaking ? `${name} parle…` : `${name} vous écoute`}
      </p>
    </div>
  );
}
