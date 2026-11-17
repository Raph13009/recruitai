import { Suspense } from "react";
import { CheckIcon, ClockIcon, InfoIcon, MicIcon, PlayIcon, ShieldCheckIcon, VideoIcon } from "lucide-react";
import { startDemo } from "@/app/actions/demo";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { env } from "@/lib/env";

export const metadata = {
  title: "Essayer l’entretien",
  description: "Passez un entretien de démonstration de cinq minutes, en visio, avec l’intervieweuse IA.",
};

export default function DemoPage({ searchParams }: PageProps<"/demo">) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-10 sm:px-6">
        <p className="eyebrow">Démonstration candidat</p>
        <h1 className="display mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
          Passez l’entretien comme un candidat.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Un poste fictif d’agent de quai à Lyon. Camille, l’intervieweuse IA, vous pose cinq questions. À la fin,
          le compte rendu apparaît dans l’espace recruteur du compte de démonstration.
        </p>

        <Card className="mt-8">
          <CardContent className="space-y-6">
            <ul className="grid gap-4 text-sm sm:grid-cols-3">
              <li className="flex gap-3">
                <ClockIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>Environ cinq minutes, sans inscription.</span>
              </li>
              <li className="flex gap-3">
                <MicIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>Micro conseillé. La caméra est facultative et reste sur votre appareil.</span>
              </li>
              <li className="flex gap-3">
                <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>N’indiquez pas de vraies données personnelles : c’est une démonstration.</span>
              </li>
            </ul>
            <Suspense fallback={<Skeleton className="h-28 w-full" />}>
              <Launcher searchParams={searchParams} />
            </Suspense>
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}

async function Launcher({ searchParams }: Pick<PageProps<"/demo">, "searchParams">) {
  const params = await searchParams;
  const voice = Boolean(env.geminiApiKey());
  const avatar = voice && Boolean(env.liveAvatarApiKey());
  const sandbox = avatar && env.liveAvatarSandbox();
  const available = env.publicDemo();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" aria-label="Configuration de cette démonstration">
        <Badge variant={voice ? "default" : "secondary"}>
          {voice ? <CheckIcon /> : <InfoIcon />}
          {voice ? "Voix en temps réel" : "Voix du navigateur (mode démo)"}
        </Badge>
        <Badge variant={avatar ? "default" : "secondary"}>
          {avatar ? <VideoIcon /> : <InfoIcon />}
          {avatar ? (sandbox ? "Avatar vidéo (bac à sable, ~1 min)" : "Avatar vidéo photoréaliste") : "Sans avatar vidéo"}
        </Badge>
      </div>

      {params.limite && (
        <Alert variant="destructive">
          <InfoIcon />
          <AlertTitle>Trop d’essais</AlertTitle>
          <AlertDescription>Vous avez lancé beaucoup de démonstrations. Réessayez dans quelques minutes.</AlertDescription>
        </Alert>
      )}
      {(params.indisponible || !available) && (
        <Alert>
          <InfoIcon />
          <AlertTitle>Démonstration indisponible</AlertTitle>
          <AlertDescription>La démonstration publique est désactivée sur ce serveur.</AlertDescription>
        </Alert>
      )}

      <form action={startDemo}>
        <Button type="submit" size="lg" className="h-11 rounded-full px-6 text-base" disabled={!available}>
          <PlayIcon /> Commencer la démonstration
        </Button>
      </form>
      {!voice && (
        <p className="text-sm text-muted-foreground">
          Sans clé configurée, Camille suit un script et parle avec la voix de votre navigateur. Ajoutez
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">GEMINI_API_KEY</code>
          pour la voix en temps réel, puis
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">LIVEAVATAR_API_KEY</code>
          pour le visage vidéo.
        </p>
      )}
    </div>
  );
}
