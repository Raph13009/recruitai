"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckIcon, Loader2Icon, RefreshCwIcon, ScanFaceIcon } from "lucide-react";
import { toast } from "sonner";
import { EMPTY_FORM, type FormState } from "@/app/actions/form-state";
import { saveAgency, saveBranding, saveInterviewer } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import {
  Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { AgencyBranding, InterviewerSettings } from "@/lib/db/types";
import { VOICES } from "@/lib/interview/voices";
import { cn } from "@/lib/utils";

function useSavedToast(state: FormState, message: string) {
  useEffect(() => {
    if (state.ok) toast.success(message);
    else if (state.error) toast.error(state.error);
  }, [state, message]);
}

export function AgencyForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(saveAgency, EMPTY_FORM);
  useSavedToast(state, "Agence enregistrée");
  const error = state.fieldErrors?.name;

  return (
    <form action={action} key={state.values?.name ?? name}>
      <FieldGroup>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="agency-name">Nom de l’agence</FieldLabel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="agency-name" name="name" defaultValue={state.values?.name ?? name} maxLength={80} aria-invalid={Boolean(error)} className="sm:max-w-sm" required />
            <Button type="submit" variant="outline" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Enregistrer
            </Button>
          </div>
          {error ? <FieldError>{error}</FieldError> : <FieldDescription>L’intervieweur le prononce au début de chaque entretien.</FieldDescription>}
        </Field>
      </FieldGroup>
    </form>
  );
}

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

export function BrandingForm({ branding }: { branding: AgencyBranding }) {
  const [state, action, pending] = useActionState(saveBranding, EMPTY_FORM);
  useSavedToast(state, "Branding enregistré");
  const errors = state.fieldErrors ?? {};
  // Browsers normalize color inputs to lowercase; keep state in sync to avoid controlled-input noise.
  const initialAccent = branding.accent_color.toLowerCase();
  const [accent, setAccent] = useState(initialAccent);

  return (
    // Re-mounts after a save so file inputs and "remove" checkboxes reset to the stored branding.
    <form action={action} encType="multipart/form-data" key={`${branding.logo_url}|${branding.banner_url}|${initialAccent}`}>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.accent_color)}>
          <FieldLabel htmlFor="accent_color">Couleur d’accent</FieldLabel>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Choisir la couleur d’accent"
              value={/^#[0-9a-f]{6}$/i.test(accent) ? accent.toLowerCase() : "#000000"}
              onChange={(e) => setAccent(e.target.value.toLowerCase())}
              className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
            />
            <Input
              id="accent_color"
              name="accent_color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              maxLength={7}
              placeholder="#RRGGBB"
              aria-invalid={Boolean(errors.accent_color)}
              className="max-w-32 font-mono"
              required
            />
          </div>
          {errors.accent_color ? <FieldError>{errors.accent_color}</FieldError> : <FieldDescription>Boutons et accents de votre espace et de l’entretien candidat.</FieldDescription>}
        </Field>

        <BrandingImageField kind="logo" label="Logo" url={branding.logo_url} error={errors.logo} />
        <BrandingImageField kind="banner" label="Bandeau" url={branding.banner_url} error={errors.banner} />

        {state.error && !state.fieldErrors && <FieldError>{state.error}</FieldError>}

        <div>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            Enregistrer le branding
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function BrandingImageField({ kind, label, url, error }: { kind: "logo" | "banner"; label: string; url: string | null; error?: string }) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={kind}>{label}</FieldLabel>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- agency-uploaded asset from storage
        <img src={url} alt={`${label} actuel`} className={cn("rounded-md border bg-muted object-contain", kind === "logo" ? "h-16 w-auto max-w-48" : "h-24 w-full max-w-md object-cover")} />
      )}
      <Input id={kind} name={kind} type="file" accept={IMAGE_ACCEPT} aria-invalid={Boolean(error)} className="sm:max-w-sm" />
      {url && (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name={`remove_${kind}`} value="1" />
          Supprimer {kind === "logo" ? "le logo" : "le bandeau"}
        </label>
      )}
      {error ? <FieldError>{error}</FieldError> : <FieldDescription>PNG, JPEG ou WebP.</FieldDescription>}
    </Field>
  );
}

interface AvatarOption {
  id: string;
  name: string;
  preview_url: string | null;
  source: "public" | "custom";
}

interface AvatarList {
  configured: boolean;
  sandbox: boolean;
  avatars: AvatarOption[];
}

export function InterviewerForm({
  settings,
  avatarService,
}: {
  settings: InterviewerSettings;
  /** "off" = no LiveAvatar key, "sandbox" = test face only, "live" = full library. */
  avatarService: "off" | "sandbox" | "live";
}) {
  const [state, action, pending] = useActionState(saveInterviewer, EMPTY_FORM);
  useSavedToast(state, "Intervieweur enregistré");
  const errors = state.fieldErrors ?? {};

  const [video, setVideo] = useState(settings.video_enabled);
  const [avatar, setAvatar] = useState<Pick<AvatarOption, "id" | "name" | "preview_url"> | null>(
    settings.avatar_id ? { id: settings.avatar_id, name: settings.avatar_name ?? "", preview_url: settings.avatar_preview_url } : null,
  );
  const knownVoice = VOICES.some((v) => v.id === settings.voice);

  return (
    <form action={action}>
      <FieldGroup>
        <div className="grid gap-5 md:grid-cols-2">
          <Field data-invalid={Boolean(errors.persona_name)}>
            <FieldLabel htmlFor="persona_name">Prénom de l’intervieweur</FieldLabel>
            <Input id="persona_name" name="persona_name" defaultValue={settings.persona_name} maxLength={30} aria-invalid={Boolean(errors.persona_name)} required />
            {errors.persona_name ? <FieldError>{errors.persona_name}</FieldError> : <FieldDescription>Il se présente toujours comme une IA.</FieldDescription>}
          </Field>
          <Field data-invalid={Boolean(errors.voice)}>
            <FieldLabel htmlFor="voice">Voix</FieldLabel>
            <NativeSelect id="voice" name="voice" defaultValue={settings.voice} className="w-full">
              {!knownVoice && <NativeSelectOption value={settings.voice}>{settings.voice}</NativeSelectOption>}
              <NativeSelectOptGroup label="Voix féminines">
                {VOICES.filter((v) => v.gender === "f").map((v) => (
                  <NativeSelectOption key={v.id} value={v.id}>{`${v.id} · ${v.tone}`}</NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
              <NativeSelectOptGroup label="Voix masculines">
                {VOICES.filter((v) => v.gender === "m").map((v) => (
                  <NativeSelectOption key={v.id} value={v.id}>{`${v.id} · ${v.tone}`}</NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            </NativeSelect>
            {errors.voice ? <FieldError>{errors.voice}</FieldError> : <FieldDescription>Voix en temps réel, en français. Choisissez-la en accord avec le visage.</FieldDescription>}
          </Field>
        </div>

        <Field orientation="horizontal">
          <Switch id="video_enabled" name="video_enabled" checked={video} onCheckedChange={setVideo} />
          <FieldContent>
            <FieldLabel htmlFor="video_enabled">Visio avec avatar</FieldLabel>
            <FieldDescription>
              Le candidat voit un visage photoréaliste dont les lèvres suivent la voix. Désactivé, l’entretien se fait en voix seule.
            </FieldDescription>
          </FieldContent>
        </Field>

        <input type="hidden" name="avatar_id" value={avatar?.id ?? ""} />
        <input type="hidden" name="avatar_name" value={avatar?.name ?? ""} />
        <input type="hidden" name="avatar_preview_url" value={avatar?.preview_url ?? ""} />

        {video && (
          <FieldSet>
            <FieldLegend variant="label">Visage</FieldLegend>
            <AvatarPicker service={avatarService} selected={avatar?.id ?? null} onSelect={setAvatar} />
            {errors.avatar_id && <FieldError>{errors.avatar_id}</FieldError>}
          </FieldSet>
        )}

        <div>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            Enregistrer l’intervieweur
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function AvatarPicker({
  service,
  selected,
  onSelect,
}: {
  service: "off" | "sandbox" | "live";
  selected: string | null;
  onSelect: (avatar: Pick<AvatarOption, "id" | "name" | "preview_url"> | null) => void;
}) {
  const [list, setList] = useState<AvatarList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (service === "off") return;
    let cancelled = false;
    fetch("/api/recruiter/avatars")
      .then(async (res) => {
        const data = (await res.json()) as AvatarList & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Liste indisponible.");
        if (!cancelled) {
          setList(data);
          setError(null);
        }
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : "Liste indisponible."));
    return () => {
      cancelled = true;
    };
  }, [service, attempt]);

  if (service === "off") {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Le service d’avatar n’est pas configuré sur ce serveur (clé <code className="text-xs">LIVEAVATAR_API_KEY</code>).
        Les entretiens se font en voix seule, avec une présence animée à l’écran.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {service === "sandbox" && (
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Mode bac à sable : les entretiens utilisent le visage de test du fournisseur, pendant environ une minute. Votre
          choix ci-dessous s’appliquera dès que le bac à sable sera désactivé.
        </p>
      )}
      {error ? (
        <div className="flex items-center gap-3 text-sm text-destructive">
          {error}
          <Button type="button" size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCwIcon /> Réessayer
          </Button>
        </div>
      ) : !list ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      ) : (
        <div role="radiogroup" aria-label="Visage de l’intervieweur" className="grid max-h-[26rem] grid-cols-2 gap-3 overflow-y-auto p-0.5 sm:grid-cols-3 lg:grid-cols-4">
          <AvatarCard
            label="Par défaut"
            hint="Choix du serveur"
            selected={selected === null}
            onClick={() => onSelect(null)}
          />
          {list.avatars.map((a) => (
            <AvatarCard
              key={a.id}
              label={a.name}
              hint={a.source === "custom" ? "Votre avatar" : undefined}
              image={a.preview_url}
              selected={selected === a.id}
              onClick={() => onSelect({ id: a.id, name: a.name, preview_url: a.preview_url })}
            />
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Pour donner à l’intervieweur le visage d’un de vos recruteurs, créez un avatar personnalisé dans votre compte
        LiveAvatar (vidéo de deux minutes et enregistrement de consentement) : il apparaîtra ici.
      </p>
    </div>
  );
}

function AvatarCard({
  label,
  hint,
  image,
  selected,
  onClick,
}: {
  label: string;
  hint?: string;
  image?: string | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl text-left ring-1 ring-foreground/10 outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "ring-2 ring-primary",
      )}
    >
      <span className="block aspect-[4/3] bg-muted">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote preview from the avatar provider
          <img src={image} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-[1.03]" />
        ) : (
          <span className="grid size-full place-items-center text-muted-foreground">
            <ScanFaceIcon className="size-7" />
          </span>
        )}
      </span>
      <span className="block px-2.5 py-2">
        <span className="block truncate text-sm font-medium">{label}</span>
        {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
      {selected && (
        <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon className="size-3.5" />
        </span>
      )}
    </button>
  );
}
