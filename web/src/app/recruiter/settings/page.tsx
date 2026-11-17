import { Suspense } from "react";
import { AudioLinesIcon, DatabaseIcon, ScanFaceIcon } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { PageBody, PageHeader, PageIntro, PageSkeleton } from "@/components/recruiter/page-header";
import { AgencyForm, BrandingForm, InterviewerForm } from "@/components/recruiter/settings-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRecruiter } from "@/lib/auth/dal";
import { getAgency, usingSupabase } from "@/lib/db";
import { env } from "@/lib/env";

export const metadata = { title: "Réglages" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: "Réglages" }]} />
      <PageBody className="max-w-4xl">
        <PageIntro title="Réglages" description="Votre agence, l’intervieweur que rencontrent vos candidats et les services connectés." />
        <Suspense fallback={<PageSkeleton />}>
          <Settings />
        </Suspense>
      </PageBody>
    </>
  );
}

async function Settings() {
  const recruiter = await requireRecruiter();
  const agency = await getAgency(recruiter.agency.id);
  if (!agency) return null;

  const voiceReady = Boolean(env.geminiApiKey());
  const avatarKey = Boolean(env.liveAvatarApiKey());
  const sandbox = env.liveAvatarSandbox();
  const avatarService = !avatarKey ? "off" : sandbox ? "sandbox" : "live";
  const supabase = usingSupabase();

  const services = [
    {
      icon: AudioLinesIcon,
      name: "Voix en temps réel",
      detail: voiceReady
        ? `Gemini Live, modèle ${env.geminiModel()}.`
        : "Aucune clé GEMINI_API_KEY : les entretiens tournent en mode démo, avec un script et la voix du navigateur.",
      status: voiceReady ? "Active" : "Mode démo",
      ok: voiceReady,
    },
    {
      icon: ScanFaceIcon,
      name: "Avatar vidéo",
      detail: !avatarKey
        ? "Aucune clé LIVEAVATAR_API_KEY : pas de visage vidéo."
        : sandbox
          ? "LiveAvatar en bac à sable : visage de test, sessions d’environ une minute, sans crédit consommé."
          : "LiveAvatar, avatar photoréaliste synchronisé sur la voix.",
      status: !avatarKey ? "Non configuré" : sandbox ? "Bac à sable" : "Actif",
      ok: avatarKey && !sandbox,
    },
    {
      icon: DatabaseIcon,
      name: "Données",
      detail: supabase
        ? "Supabase (Postgres) : comptes, postes et entretiens partagés par tous les serveurs."
        : env.persistMockDb()
          ? "Base de démonstration locale (fichier web/.data/store.json). Passez à Supabase avec USE_MOCK_DB=false."
          : "Base de démonstration en mémoire : elle repart de zéro à chaque redémarrage.",
      status: supabase ? "Supabase" : "Démonstration",
      ok: supabase,
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Intervieweur</CardTitle>
          <CardDescription>Ce que voient et entendent vos candidats pendant la visio.</CardDescription>
        </CardHeader>
        <CardContent>
          <InterviewerForm settings={agency.interviewer} avatarService={avatarService} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Branding</CardTitle>
          <CardDescription>Logo, bandeau et couleur visibles dans votre espace et chez le candidat.</CardDescription>
        </CardHeader>
        <CardContent>
          <BrandingForm branding={agency.branding} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Agence</CardTitle>
        </CardHeader>
        <CardContent>
          <AgencyForm name={agency.name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Services connectés</CardTitle>
          <CardDescription>Configurés côté serveur, dans le fichier web/.env.local. Les clés ne quittent jamais le serveur.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {services.map((service) => (
              <li key={service.name} className="flex items-start gap-4 py-3">
                <service.icon className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{service.name}</p>
                  <p className="text-sm text-muted-foreground">{service.detail}</p>
                </div>
                <Badge variant={service.ok ? "default" : "secondary"}>{service.status}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Compte</CardTitle>
          <CardDescription>
            {recruiter.full_name} · {recruiter.email}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={logout}>
            <Button type="submit" variant="outline">
              Se déconnecter
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
