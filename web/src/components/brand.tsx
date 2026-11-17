import Link from "next/link";
import { cn } from "@/lib/utils";

const BAR_HEIGHTS = [0.35, 0.7, 1, 0.55, 0.85, 0.4, 0.75];

/** The brand mark: a voice waveform. Animated only when `animated` is set. */
export function Waveform({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <span aria-hidden className={cn("inline-flex items-center gap-[3px]", className)}>
      {BAR_HEIGHTS.map((height, i) => (
        <span
          key={i}
          className={cn("block w-[3px] origin-center rounded-full bg-current", animated && "motion-safe:animate-voice-bar")}
          style={{
            height: `${height * 100}%`,
            animationDuration: animated ? `${1.1 + (i % 3) * 0.25}s` : undefined,
            animationDelay: animated ? `${i * 0.08}s` : undefined,
          }}
        />
      ))}
    </span>
  );
}

/** Logo and wordmark. Pass `href={null}` where leaving the page would be a mistake (the interview). */
export function Brand({ href = "/", className }: { href?: string | null; className?: string }) {
  const content = (
    <>
      <span className="grid size-8 place-items-center rounded-full bg-brand text-brand-foreground">
        <Waveform className="h-3.5 gap-[2px] [&>span]:w-[2px]" />
      </span>
      <span className="display text-xl font-semibold tracking-tight">
        Recruit<span className="text-primary">AI</span>
      </span>
    </>
  );
  const classes = cn("inline-flex items-center gap-2.5", className);
  return href === null ? (
    <span className={classes}>{content}</span>
  ) : (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}
