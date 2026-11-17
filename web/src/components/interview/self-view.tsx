"use client";

import { useEffect, useRef } from "react";
import { MicOffIcon, UserRoundIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** The candidate's own tile: local camera preview (mirrored) or a neutral placeholder. */
export function SelfView({
  stream,
  muted,
  speaking,
  badges = true,
  className,
}: {
  stream: MediaStream | null;
  muted: boolean;
  speaking: boolean;
  /** The "Vous" label and the muted badge. Off where the surrounding UI already says it. */
  badges?: boolean;
  className?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (video.current && video.current.srcObject !== stream) video.current.srcObject = stream;
  }, [stream]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-muted ring-2 transition-[box-shadow,--tw-ring-color] duration-200",
        speaking && !muted ? "ring-primary" : "ring-foreground/15",
        className,
      )}
    >
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        className={cn("size-full -scale-x-100 object-cover", !stream && "hidden")}
        aria-label="Aperçu de votre caméra"
      />
      {!stream && (
        <div className="grid size-full place-items-center">
          <span className="grid aspect-square w-1/4 max-w-16 min-w-8 place-items-center rounded-full bg-foreground/10 text-foreground/70">
            <UserRoundIcon className="size-1/2" />
          </span>
        </div>
      )}
      {badges && (
        <span className="absolute bottom-1.5 left-2 rounded-md bg-background/70 px-1.5 py-0.5 text-[11px] font-medium text-foreground backdrop-blur">
          Vous
        </span>
      )}
      {badges && muted && (
        <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-destructive text-destructive-foreground" title="Micro coupé">
          <MicOffIcon className="size-3.5" />
        </span>
      )}
    </div>
  );
}

/** Five bars that follow a live level (0 to 1) read on every animation frame. */
export function LevelMeter({ getLevel, active, className }: { getLevel: () => number; active: boolean; className?: string }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let smooth = 0;
    const loop = () => {
      const level = getLevel();
      smooth = level > smooth ? level : smooth * 0.9;
      bars.current.forEach((bar, i) => {
        if (bar) bar.style.opacity = smooth > (i + 0.5) / 6 ? "1" : "0.25";
      });
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [getLevel, active]);

  return (
    <span className={cn("inline-flex items-end gap-[3px]", className)} aria-hidden>
      {[0.4, 0.6, 0.8, 1, 0.8].map((height, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
          className="block w-1 rounded-full bg-current opacity-25"
          style={{ height: `${height * 100}%` }}
        />
      ))}
    </span>
  );
}
