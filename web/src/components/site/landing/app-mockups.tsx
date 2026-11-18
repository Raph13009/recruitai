import type { CSSProperties, ReactNode } from "react";
import {
  BriefcaseIcon, CaptionsIcon, CheckIcon, CopyIcon, InfoIcon, KeyboardIcon, LayoutDashboardIcon, LinkIcon, MailIcon,
  MessageSquareIcon, MessagesSquareIcon, MicIcon, PhoneOffIcon, Settings2Icon, VideoIcon,
} from "lucide-react";
import { Waveform } from "@/components/brand";
import { cn } from "@/lib/utils";

// Static pictures of the product for the home page tour. Built from the real screens' layout and
// colors, with fictional data. `data-stagger` children animate in when their panel becomes active.

const at = (i: number) => ({ "--i": i }) as CSSProperties;

type Nav = "dashboard" | "jobs" | "sessions" | "settings";

/** The recruiter space: dark teal sidebar, paper content. */
function Shell({ active, title, crumb, children }: { active: Nav; title: string; crumb: string; children: ReactNode }) {
  const items: { id: Nav; label: string; icon: typeof BriefcaseIcon }[] = [
    { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboardIcon },
    { id: "jobs", label: "Postes", icon: BriefcaseIcon },
    { id: "sessions", label: "Entretiens", icon: MessagesSquareIcon },
    { id: "settings", label: "Réglages", icon: Settings2Icon },
  ];
  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[13.5rem_1fr]">
      <aside className="hidden flex-col bg-[#0d2b27] p-4 text-white/80 md:flex">
        <div className="flex items-center gap-2.5 px-2 py-1">
          <span className="grid size-7 place-items-center rounded-full bg-[#0f6b5c] text-white">
            <Waveform className="h-3 gap-[2px] [&>span]:w-[2px]" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-medium text-white">Interim Express</p>
            <p className="truncate text-[11px] text-white/50">Espace recruteur</p>
          </div>
        </div>
        <p className="mt-6 px-2 text-[10px] uppercase tracking-[0.16em] text-white/40">Recrutement</p>
        <ul className="mt-2 space-y-1 text-[13px]">
          {items.map(({ id, label, icon: Icon }) => (
            <li
              key={id}
              className={cn("flex items-center gap-2.5 rounded-lg px-2 py-2", id === active ? "bg-white/10 text-white" : "text-white/65")}
            >
              <Icon className="size-4" /> {label}
            </li>
          ))}
        </ul>
        <div className="mt-auto flex items-center gap-2 rounded-lg bg-white/5 px-2 py-2 text-[11px]">
          <span className="grid size-6 place-items-center rounded-md bg-white/10 text-[10px] text-white">CD</span>
          <span className="truncate text-white/70">Claire Dumont</span>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col bg-[#f7f5f0]">
        <div className="flex items-center gap-2 border-b border-[#e4dfd4] px-5 py-3 text-[12px] text-[#4a5866]">
          <span>{crumb}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-5 sm:p-7">
          <p className="headline text-[1.75rem] text-[#16212b]">{title}</p>
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={style}>
      <p className="text-[11px] font-medium text-[#4a5866]">{label}</p>
      <div className="mt-1.5 rounded-lg border border-[#ddd8cd] bg-white px-3 py-2 text-[13px] text-[#16212b]">{children}</div>
    </div>
  );
}

export function JobMockup() {
  return (
    <Shell active="jobs" title="Nouveau poste" crumb="Postes · Nouveau">
      <div className="grid gap-5 lg:grid-cols-[1fr_15rem]">
        <div data-stagger className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Intitulé" style={at(0)}>Agent de quai</Field>
          <Field label="Lieu" style={at(1)}>Lyon 7e</Field>
          <Field label="Contrat" style={at(2)}>Mission de 2 semaines, renouvelable</Field>
          <Field label="Début" style={at(3)}>Lundi 23 novembre</Field>
          <div style={at(4)}>
            <p className="text-[11px] font-medium text-[#4a5866]">Horaires</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {["6:00–13:00", "13:00–20:00"].map((h) => (
                <span key={h} className="rounded-full bg-[#dcebe7] px-2.5 py-1 text-[12px] text-[#0a4f44]">
                  {h}
                </span>
              ))}
            </div>
          </div>
          <Field label="Salaire" style={at(5)}>12,50 € brut / heure</Field>
          <div className="sm:col-span-2" style={at(6)}>
            <Field label="Tâches">Chargement, déchargement et tri de colis</Field>
          </div>
        </div>
        <div data-stagger className="space-y-3">
          <div className="rounded-xl border border-[#0f6b5c]/20 bg-[#dcebe7]/60 p-4 text-[12.5px] leading-relaxed text-[#16212b]/85" style={at(4)}>
            <p className="flex items-center gap-1.5 font-medium text-[#0a4f44]">
              <InfoIcon className="size-3.5" /> La seule source de l’IA
            </p>
            <p className="mt-1.5">Sur le poste, l’intervieweuse répond uniquement avec cette fiche. Sinon : « le recruteur vous répondra ».</p>
          </div>
          <span className="flex h-9 items-center justify-center rounded-lg bg-[#0f6b5c] text-[13px] font-medium text-white" style={at(7)}>
            Enregistrer le poste
          </span>
        </div>
      </div>
    </Shell>
  );
}

export function InviteMockup() {
  const rows = [
    { label: "Candidat C-118", status: "Lien envoyé", tone: "bg-[#e8e4db] text-[#4a5866]" },
    { label: "Inès B.", status: "En cours", tone: "bg-amber-100 text-amber-900" },
    { label: "Karim D.", status: "Terminé", tone: "bg-[#dcebe7] text-[#0a4f44]" },
    { label: "Léa M.", status: "Terminé", tone: "bg-[#dcebe7] text-[#0a4f44]" },
  ];
  return (
    <Shell active="jobs" title="Agent de quai · Lyon 7e" crumb="Postes · Agent de quai">
      <div data-stagger className="space-y-4">
        <div className="rounded-xl border border-[#ddd8cd] bg-white p-4" style={at(0)}>
          <p className="text-[13px] font-medium text-[#16212b]">Inviter un candidat</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#ddd8cd] bg-[#f7f5f0] px-3 text-[12.5px] text-[#4a5866]">
              <LinkIcon className="size-3.5 shrink-0 text-[#0f6b5c]" />
              <span className="truncate">recruitai.app/interview/q7Hk2vX9…</span>
            </span>
            <span className="flex h-9 items-center gap-1.5 rounded-lg bg-[#0f6b5c] px-3 text-[12.5px] font-medium text-white">
              <CopyIcon className="size-3.5" /> Copier
            </span>
          </div>
          <div className="mt-3 flex gap-2 text-[12px]">
            <span className="flex items-center gap-1.5 rounded-full border border-[#ddd8cd] px-2.5 py-1 text-[#4a5866]">
              <MessageSquareIcon className="size-3.5" /> SMS
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-[#ddd8cd] px-2.5 py-1 text-[#4a5866]">
              <MailIcon className="size-3.5" /> E-mail
            </span>
          </div>
        </div>
        <ul className="divide-y divide-[#e4dfd4] overflow-hidden rounded-xl border border-[#ddd8cd] bg-white" style={at(1)}>
          {rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
              <span className="text-[#16212b]">{row.label}</span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-[11.5px]", row.tone)}>{row.status}</span>
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}

/** The candidate's screen: paper stage, interviewer presence, live caption. */
export function CallMockup() {
  return (
    <div className="flex h-full flex-col bg-[#f2efe9]">
      <div className="flex items-center gap-2 border-b border-[#e4dfd4] bg-[#fbfaf7] px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-[#ddd8cd]" />
        <span className="size-2.5 rounded-full bg-[#ddd8cd]" />
        <span className="size-2.5 rounded-full bg-[#ddd8cd]" />
        <span className="mx-auto rounded-md bg-[#f2efe9] px-3 py-0.5 text-[11px] text-[#4a5866]">recruitai.app/interview/…</span>
      </div>
      <div className="flex items-center gap-3 px-5 py-3">
        <span className="grid size-7 place-items-center rounded-full bg-[#0f6b5c] text-white">
          <Waveform className="h-3 gap-[2px] [&>span]:w-[2px]" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[13px] font-medium text-[#16212b]">Agent de quai</p>
          <p className="truncate text-[11px] text-[#4a5866]">Interim Express</p>
        </div>
        <div data-stagger className="ml-auto hidden items-center gap-1.5 sm:flex">
          {["Expérience", "Disponibilité", "Horaires", "Salaire"].map((topic, i) => (
            <span
              key={topic}
              style={at(i)}
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]",
                i < 2 ? "bg-[#dcebe7] text-[#0a4f44]" : "bg-[#e8e4db] text-[#4a5866]",
              )}
            >
              {i < 2 && <CheckIcon className="size-3" />} {topic}
            </span>
          ))}
        </div>
      </div>
      <div className="relative mx-4 flex-1 overflow-hidden rounded-2xl bg-gradient-to-br from-[#dcebe7]/70 to-[#fbfaf7] ring-1 ring-[#ddd8cd]">
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-[#f2efe9]/80 py-1 pl-3 pr-1.5 text-[12px] backdrop-blur">
          <span className="font-medium text-[#16212b]">Camille</span>
          <span className="rounded-full bg-[#0f6b5c] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">IA</span>
          <Waveform animated className="mr-1 h-2.5 text-[#0f6b5c]" />
        </div>
        <div className="absolute right-3 top-3 grid aspect-video w-[22%] place-items-center rounded-xl bg-[#e8e4db] ring-2 ring-[#0f6b5c]/30">
          <span className="text-[10px] text-[#4a5866]">Vous</span>
        </div>
        <div className="grid h-full place-items-center pb-10">
          <div className="relative grid size-28 place-items-center sm:size-32">
            <span aria-hidden className="absolute inset-0 rounded-full border border-[#0f6b5c]/40 motion-safe:animate-ring-out" />
            <span aria-hidden className="absolute inset-0 rounded-full border border-[#0f6b5c]/25 motion-safe:animate-ring-out [animation-delay:1.2s]" />
            <span className="grid size-24 place-items-center rounded-full bg-gradient-to-br from-[#0f6b5c] to-[#0a4f44] shadow-[0_24px_60px_-20px_#0f6b5c] motion-safe:animate-breathe sm:size-28">
              <span className="display text-5xl text-white">C</span>
            </span>
          </div>
        </div>
        <p className="absolute inset-x-4 bottom-4 mx-auto w-fit max-w-[92%] rounded-xl bg-[#16212b]/85 px-4 py-2 text-center text-[13px] leading-snug text-white">
          <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-white/60">Camille</span>
          D’accord. Quel créneau vous convient : 6 h–13 h ou 13 h–20 h ?
        </p>
      </div>
      <div className="flex items-center justify-center gap-2 py-3">
        {[MicIcon, VideoIcon, CaptionsIcon, KeyboardIcon].map((Icon, i) => (
          <span key={i} className="grid size-9 place-items-center rounded-full bg-[#fbfaf7] text-[#16212b] ring-1 ring-[#ddd8cd]">
            <Icon className="size-4" />
          </span>
        ))}
        <span className="ml-1 grid h-9 w-12 place-items-center rounded-full bg-[#a3432f] text-white">
          <PhoneOffIcon className="size-4" />
        </span>
      </div>
    </div>
  );
}

export function ReportMockup() {
  const facts = [
    { label: "Expérience", said: "Deux ans d’entrepôt, surtout du tri de colis", value: "logistique" },
    { label: "Disponibilité", said: "Je peux commencer lundi", value: "23 nov." },
    { label: "Créneau", said: "Plutôt le matin", value: "6:00–13:00" },
    { label: "Salaire", said: "Autour de 13 euros de l’heure", value: "13 € brut/h" },
  ];
  return (
    <Shell active="sessions" title="Inès B." crumb="Entretiens · Préparatrice de commandes">
      <div className="grid gap-4 lg:grid-cols-[1fr_14rem]">
        <dl data-stagger className="space-y-2.5">
          {facts.map((fact, i) => (
            <div key={fact.label} style={at(i)} className="grid gap-1 rounded-xl border border-[#ddd8cd] bg-white px-4 py-3 sm:grid-cols-[7.5rem_1fr]">
              <dt className="text-[12px] text-[#4a5866]">{fact.label}</dt>
              <dd className="text-[13px] text-[#16212b]">
                « {fact.said} »
                <span className="ml-2 rounded bg-[#dcebe7] px-1.5 py-0.5 text-[11px] text-[#0a4f44]">{fact.value}</span>
              </dd>
            </div>
          ))}
        </dl>
        <div data-stagger className="space-y-3">
          <div style={at(2)} className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[12.5px] text-amber-900">
            <p className="font-medium">À relire</p>
            <p className="mt-1 text-amber-900/80">Attente salariale : 13 € brut/h. Fiche : 12,50 € brut/h.</p>
          </div>
          <div style={at(3)} className="rounded-xl border border-[#ddd8cd] bg-white p-3.5 text-[12.5px] text-[#4a5866]">
            <p className="font-medium text-[#16212b]">Score · Classement</p>
            <p className="mt-1">Vides par conception. Votre équipe décide.</p>
          </div>
          <span style={at(4)} className="flex h-9 items-center justify-center rounded-lg border border-[#ddd8cd] bg-white text-[12.5px] text-[#16212b]">
            Exporter (JSON) · Imprimer
          </span>
        </div>
      </div>
    </Shell>
  );
}
