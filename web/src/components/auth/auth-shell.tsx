import { CheckIcon } from "lucide-react";
import { Brand, Waveform } from "@/components/brand";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const POINTS = [
  "Un premier entretien en visio, mené par une IA qui se présente comme telle",
  "Un compte rendu factuel pour chaque candidat, sans score ni classement",
  "Seul le texte est conservé : ni audio, ni vidéo",
];

/** Two-column card shared by the sign-in and sign-up pages: the form, and what the product does. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Brand />
      </header>
      <main className="flex flex-1 items-center justify-center p-6 pb-16 md:p-10">
        <Card className="w-full max-w-sm overflow-hidden p-0 md:max-w-4xl">
          <CardContent className="grid p-0 md:grid-cols-2">
            <div className="p-6 md:p-8">{children}</div>
            <aside className="relative hidden flex-col justify-between bg-brand p-8 text-brand-foreground md:flex">
              <Waveform className="h-10 gap-1.5 text-accent [&>span]:w-1.5" />
              <div>
                <p className="display text-2xl font-semibold leading-snug">
                  L’IA recueille les faits. Votre équipe décide.
                </p>
                <ul className="mt-6 space-y-3 text-sm text-brand-foreground/85">
                  {POINTS.map((point) => (
                    <li key={point} className="flex gap-2.5">
                      <CheckIcon className="mt-0.5 size-4 shrink-0" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export function AuthFormSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <Skeleton className="mx-auto h-8 w-40" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}
