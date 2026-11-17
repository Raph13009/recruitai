import Image from "next/image";
import { CaptionsIcon, CheckIcon, MicIcon, PhoneOffIcon, VideoIcon } from "lucide-react";
import { Waveform } from "@/components/brand";
import { cn } from "@/lib/utils";

/**
 * Static picture of the candidate's video call, for the marketing pages.
 * With `portrait`, a still of the AI interviewer fills the frame; otherwise the voice presence is shown,
 * as in the audio-only call.
 */
export function CallMockup({ portrait, className }: { portrait?: string; className?: string }) {
  return (
    <figure className={cn("dark relative text-foreground", className)}>
      <div className="overflow-hidden rounded-[1.75rem] bg-background p-2.5 shadow-[0_40px_120px_-40px_rgb(22_33_43/0.45)] ring-1 ring-white/10">
        <div className="flex items-center gap-2 px-2 pb-2.5 pt-1">
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="ml-3 truncate text-[11px] text-muted-foreground">Agent de quai · Interim Express</span>
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">03:12</span>
        </div>

        <div className="relative aspect-video overflow-hidden rounded-2xl bg-card">
          {portrait ? (
            <Image
              src={portrait}
              alt="Illustration : l’intervieweuse IA en visio"
              fill
              priority
              sizes="(min-width: 1024px) 560px, 100vw"
              className="object-cover object-[50%_25%]"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_50%_40%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_65%)]">
              <div className="relative grid size-28 place-items-center sm:size-32">
                <span aria-hidden className="absolute inset-0 rounded-full border border-primary/45 motion-safe:animate-ring-out" />
                <span aria-hidden className="absolute inset-0 rounded-full border border-primary/30 motion-safe:animate-ring-out [animation-delay:1.2s]" />
                <span className="grid size-24 place-items-center rounded-full bg-gradient-to-br from-brand to-[color-mix(in_oklab,var(--brand),black_25%)] motion-safe:animate-breathe sm:size-28">
                  <span className="display text-5xl font-normal text-brand-foreground">C</span>
                </span>
              </div>
            </div>
          )}

          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-background/75 py-0.5 pl-2.5 pr-1 text-xs backdrop-blur">
            <span className="font-medium">Camille</span>
            <span className="rounded-full bg-primary px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary-foreground">IA</span>
            <Waveform animated className="mr-1 h-2.5 text-primary" />
          </div>

          <div className="absolute right-3 top-3 grid aspect-video w-[18%] place-items-center rounded-lg bg-muted ring-2 ring-primary">
            <span className="text-[10px] font-medium text-foreground/80">Vous</span>
          </div>

          <p className="absolute inset-x-3 bottom-3 mx-auto w-fit max-w-[92%] rounded-lg bg-black/65 px-3 py-1.5 text-center text-[13px] leading-snug text-white backdrop-blur sm:text-sm">
            D’accord. Quel créneau vous convient : 6:00–13:00 ou 13:00–20:00 ?
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 pb-1 pt-3">
          {[MicIcon, VideoIcon, CaptionsIcon].map((Icon, i) => (
            <span key={i} className="grid size-8 place-items-center rounded-full bg-secondary text-secondary-foreground">
              <Icon className="size-3.5" />
            </span>
          ))}
          <span className="ml-1 grid h-8 w-11 place-items-center rounded-full bg-destructive text-destructive-foreground">
            <PhoneOffIcon className="size-3.5" />
          </span>
        </div>
      </div>

      <figcaption className="absolute -bottom-5 -left-3 hidden rounded-2xl bg-card px-4 py-3 text-xs shadow-xl ring-1 ring-foreground/10 sm:block">
        <span className="mb-1.5 block font-medium text-foreground">Recueilli</span>
        {["Expérience", "Disponibilité"].map((topic) => (
          <span key={topic} className="flex items-center gap-1.5 text-muted-foreground">
            <CheckIcon className="size-3 text-primary" /> {topic}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
