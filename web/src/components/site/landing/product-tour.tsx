"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TourStep {
  id: string;
  title: string;
  text: string;
  panel: ReactNode;
}

/** Seconds each step stays on screen before the tour moves on by itself. */
const STEP_SECONDS = 7;

/**
 * Tabs over a large product picture. The active tab's bar fills up, then the next step shows.
 * The tour only runs while visible and pauses under the pointer; with reduced motion it waits for clicks.
 */
export function ProductTour({ steps }: { steps: TourStep[] }) {
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const running = visible && !hovered;

  return (
    <div ref={root} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <div
        role="tablist"
        aria-label="Les étapes"
        className="-mx-6 flex gap-7 overflow-x-auto border-b border-border px-6 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible"
      >
        {steps.map((step, i) => {
          const selected = i === active;
          return (
            <button
              key={step.id}
              type="button"
              role="tab"
              id={`tour-tab-${step.id}`}
              aria-selected={selected}
              aria-controls={`tour-panel-${step.id}`}
              onClick={() => setActive(i)}
              className="group relative shrink-0 pb-4 pt-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/40 lg:pb-5"
            >
              <span className={cn("block text-[17px] transition-colors duration-200", selected ? "text-primary" : "text-foreground/80 group-hover:text-foreground")}>
                {step.title}
              </span>
              <span className={cn("mt-1.5 hidden text-[14px] leading-snug transition-colors duration-200 lg:block", selected ? "text-foreground/80" : "text-muted-foreground")}>
                {step.text}
              </span>
              <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden">
                {selected && (
                  <span
                    // A new element for each step restarts the fill from zero.
                    key={`${step.id}-bar`}
                    className="block h-full origin-left bg-primary motion-safe:animate-tour-progress motion-reduce:scale-x-100"
                    style={{ "--tour-duration": `${STEP_SECONDS}s`, animationPlayState: running ? "running" : "paused" } as CSSProperties}
                    onAnimationEnd={() => setActive((current) => (current + 1) % steps.length)}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* On phones the tabs only show titles: the active step's text comes here. */}
      <p aria-live="polite" className="mt-4 text-muted-foreground lg:hidden">
        {steps[active].text}
      </p>
      <div className="mt-6 grid overflow-hidden rounded-2xl bg-card shadow-[0_40px_100px_-50px_rgb(22_33_43/0.45)] ring-1 ring-border lg:mt-8">
        {steps.map((step, i) => (
          <div
            key={step.id}
            role="tabpanel"
            id={`tour-panel-${step.id}`}
            aria-labelledby={`tour-tab-${step.id}`}
            aria-hidden={i !== active}
            inert={i !== active}
            data-active={i === active ? "" : undefined}
            className="tour-panel h-[34rem] [grid-area:1/1] sm:h-[31rem]"
          >
            {step.panel}
          </div>
        ))}
      </div>
    </div>
  );
}
