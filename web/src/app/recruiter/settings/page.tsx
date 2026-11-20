import { Suspense } from "react";
import { AudioLinesIcon, DatabaseIcon, ScanFaceIcon } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { PageBody, PageHeader, PageIntro, PageSkeleton } from "@/components/recruiter/page-header";
import { AgencyForm, InterviewerForm } from "@/components/recruiter/settings-forms";
import { TeamSettings } from "@/components/recruiter/team-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  agencyAdminId,
  canChangeTeamRoles,
  canInviteTeam,
  canManageAgency,
} from "@/lib/auth/permissions";
import { requireRecruiter } from "@/lib/auth/dal";
import { getAgency, listAgencyInvites, listAgencyRecruiters, usingPostgres, usingSupabase } from "@/lib/db";
import { env } from "@/lib/env";

export const metadata = { title: "Réglages" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: "Réglages" }]} />
      <PageBody className="max-w-4xl">
        <PageIntro title="Réglages" description="Équipe, intervieweur, agence et services connectés. Le branding a son propre onglet." />
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
  const owner = canManageAgency(recruiter.role);
  const [members, invites] = await Promise.all([
    listAgencyRecruiters(recruiter.agency.id),
    owner ? listAgencyInvites(recruiter.agency.id) : Promise.resolve([]),
  ]);

  const voiceReady = Boolean(env.geminiApiKey());
  const avatarKey = Boolean(env.liveAvatarApiKey());
  const sandbox = env.liveAvatarSandbox();
  const avatarService = !avatarKey ? "off" : sandbox ? "sandbox" : "live";
  const postgres = usingPostgres();
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
      detail: postgres
        ? "PostgreSQL privé (Dokploy) : authentification et données hébergées sur votre serveur."
        : supabase
          ? "Supabase Cloud (legacy) : encore actif pendant la migration."
          : env.persistMockDb()
            ? "Base de démonstration locale (fichier web/.data/store.json)."
            : "Base de démonstration en mémoire : elle repart de zéro à chaque redémarrage.",
      status: postgres ? "PostgreSQL privé" : supabase ? "Supabase" : "Démonstration",
      ok: postgres || supabase,
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Équipe</CardTitle>
          <CardDescription>
            Owner : tout gérer. Member : envoyer des entretiens. Le créateur de l’espace (admin)
            peut changer le rôle de tout le monde.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TeamSettings
            members={members}
            invites={invites}
            canInvite={canInviteTeam(recruiter.role)}
            currentUserId={recruiter.id}
            adminId={agencyAdminId(agency, members)}
            canManageRoles={canChangeTeamRoles(recruiter.role)}
          />
        </CardContent>
      </Card>

      {owner && (
        <>
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
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Compte</CardTitle>
          <CardDescription>
            {recruiter.full_name} · {recruiter.email} · {recruiter.role === "owner" ? "Owner" : "Member"}
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
