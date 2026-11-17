import { Suspense } from "react";
import { InfoIcon, PlayIcon } from "lucide-react";
import { startDemo } from "@/app/actions/demo";
import { Brand } from "@/components/brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { env } from "@/lib/env";
import { listScenarioCards } from "@/lib/scenarios";

export const metadata = {
  title: "Essayer l’entretien",
  description: "Choisissez un scénario de démonstration et passez l’entretien avec Camille.",
};

export default function DemoPage({ searchParams }: PageProps<"/demo">) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="px-4 py-5 sm:px-6">
        <Brand />
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 pb-16 sm:px-6">
        <h1 className="display text-3xl font-semibold leading-tight sm:text-4xl">
          Choisir un scénario
        </h1>
        <p className="mt-3 text-muted-foreground">
          Entretien fictif · ~6 min avec Camille.
        </p>
        <Suspense fallback={<ScenarioListSkeleton />}>
          <Launcher searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

function ScenarioListSkeleton() {
  return (
    <div className="mt-8 space-y-2">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

async function Launcher({ searchParams }: Pick<PageProps<"/demo">, "searchParams">) {
  const params = await searchParams;
  const available = env.publicDemo();
  const scenarios = listScenarioCards();

  return (
    <div className="mt-8 space-y-4">
      {params.limite && (
        <Alert variant="destructive">
          <InfoIcon />
          <AlertTitle>Trop d’essais</AlertTitle>
          <AlertDescription>Réessayez dans quelques minutes.</AlertDescription>
        </Alert>
      )}
      {(params.indisponible || !available) && (
        <Alert>
          <InfoIcon />
          <AlertTitle>Démonstration indisponible</AlertTitle>
          <AlertDescription>La démonstration publique est désactivée sur ce serveur.</AlertDescription>
        </Alert>
      )}

      <form action={startDemo} className="flex flex-col gap-3">
        {scenarios.map((scenario) => (
          <Button
            key={scenario.id}
            type="submit"
            name="scenario"
            value={scenario.id}
            variant="outline"
            disabled={!available}
            className="h-auto w-full justify-between gap-4 rounded-xl px-4 py-4 text-left whitespace-normal"
          >
            <span className="min-w-0">
              <span className="block font-medium text-foreground">{scenario.position}</span>
              <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
                {scenario.city} · {scenario.sector} · ~6 min
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary">
              <PlayIcon className="size-4" />
              Commencer
            </span>
          </Button>
        ))}
      </form>
    </div>
  );
}
