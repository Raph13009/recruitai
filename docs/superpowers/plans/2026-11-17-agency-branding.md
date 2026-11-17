# Agency Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let agencies set logo, banner, and accent color so that branding appears across the recruiter chrome and the candidate interview journey (lobby → call → goodbye).

**Architecture:** Add `agencies.branding` JSONB (same pattern as `interviewer`). Uploads go through a server action that writes files to Supabase Storage bucket `agency-branding` (or `web/.data/branding/` in mock mode), then updates URL fields. Recruiter layout and candidate payload both read branding from the agency row; UI applies logo/banner and `--agency-accent`.

**Tech Stack:** Next.js 16 (App Router), Zod, Vitest, Supabase Postgres + Storage, Tailwind CSS variables.

## Global Constraints

- Raster images only: `image/png`, `image/jpeg`, `image/webp` (no SVG).
- Max sizes: logo 1 MB, banner 2 MB.
- Default accent: `#0f6b5c`.
- Banner on lobby + goodbye; call header = logo + accent only.
- Empty branding = today’s RecruitAI look (Waveform / Brand fallbacks).
- Mock mode must work without a real Storage bucket.
- Follow existing French UI copy style; keep changes scoped to branding.
- Spec: `docs/superpowers/specs/2026-11-17-agency-branding-design.md`.

---

## File map

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20261117160000_agency_branding.sql` | `branding` column + Storage bucket/policies |
| `web/src/lib/db/types.ts` | `AgencyBranding`, `Agency.branding`, payload + `CurrentRecruiter` |
| `web/src/lib/branding.ts` | Defaults, hex validation, MIME/size constants, `withBranding` |
| `web/src/lib/branding.test.ts` | Unit tests for helpers |
| `web/src/lib/db/helpers.ts` | Wire `withBranding` into agency reads; payload includes branding |
| `web/src/lib/db/db.test.ts` | Payload / withBranding coverage |
| `web/src/lib/db/mock.ts` | Persist branding; local file upload helper usage |
| `web/src/lib/db/supabase-store.ts` | `updateAgencyBranding` |
| `web/src/lib/db/index.ts` | Export `updateAgencyBranding` |
| `web/src/lib/branding/storage.ts` | Upload/remove logo|banner (Supabase or local disk) |
| `web/src/app/actions/settings.ts` | `saveBranding` server action |
| `web/src/components/recruiter/settings-forms.tsx` | `BrandingForm` |
| `web/src/app/recruiter/settings/page.tsx` | Branding card |
| `web/src/lib/auth/dal.ts` | Expose branding on `CurrentRecruiter.agency` |
| `web/src/components/recruiter/agency-badge.tsx` | Logo in sidebar |
| `web/src/components/recruiter/app-sidebar.tsx` | Pass logo/accent |
| `web/src/app/recruiter/layout.tsx` | Set `--agency-accent`; shared banner strip |
| `web/src/components/recruiter/agency-banner.tsx` | Recruiter banner strip |
| `web/src/components/interview/agency-brand-header.tsx` | Candidate header (logo or name) |
| `web/src/components/interview/interview-flow.tsx` | Apply accent; swap Brand; banner on lobby/goodbye |
| `web/src/components/interview/lobby.tsx` | Banner under header |
| `web/src/app/globals.css` | Document `--agency-accent` consumption (optional alias) |

---

### Task 1: Types + branding helpers (TDD)

**Files:**
- Create: `web/src/lib/branding.ts`
- Create: `web/src/lib/branding.test.ts`
- Modify: `web/src/lib/db/types.ts`

**Interfaces:**
- Produces:
  - `AgencyBranding = { logo_url: string | null; banner_url: string | null; accent_color: string }`
  - `DEFAULT_ACCENT = "#0f6b5c"`
  - `defaultBranding(): AgencyBranding`
  - `withBranding<T>(agency): Agency` (fills missing branding)
  - `isAccentColor(value: string): boolean` — `/^#[0-9A-Fa-f]{6}$/`
  - `LOGO_MAX_BYTES = 1_048_576`, `BANNER_MAX_BYTES = 2_097_152`
  - `ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const`

- [ ] **Step 1: Write failing tests**

```ts
// web/src/lib/branding.test.ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCENT, defaultBranding, isAccentColor, withBranding,
} from "@/lib/branding";

describe("branding", () => {
  it("defaults to product teal and null assets", () => {
    expect(defaultBranding()).toEqual({
      logo_url: null,
      banner_url: null,
      accent_color: DEFAULT_ACCENT,
    });
  });

  it("accepts only #RRGGBB accents", () => {
    expect(isAccentColor("#0f6b5c")).toBe(true);
    expect(isAccentColor("#0F6B5C")).toBe(true);
    expect(isAccentColor("#fff")).toBe(false);
    expect(isAccentColor("0f6b5c")).toBe(false);
    expect(isAccentColor("red")).toBe(false);
  });

  it("fills missing branding on legacy agency rows", () => {
    const agency = withBranding({
      id: "a1",
      name: "Agence",
      interviewer: {
        persona_name: "Camille",
        voice: "Aoede",
        video_enabled: true,
        avatar_id: null,
        avatar_name: null,
        avatar_preview_url: null,
      },
      created_at: "2026-01-01T00:00:00.000Z",
      branding: null,
    });
    expect(agency.branding.accent_color).toBe(DEFAULT_ACCENT);
    expect(agency.branding.logo_url).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd web && npm test -- src/lib/branding.test.ts`
Expected: FAIL (module / exports missing)

- [ ] **Step 3: Add types**

In `web/src/lib/db/types.ts`:

```ts
export interface AgencyBranding {
  logo_url: string | null;
  banner_url: string | null;
  /** #RRGGBB */
  accent_color: string;
}

export interface Agency {
  id: Uuid;
  name: string;
  interviewer: InterviewerSettings;
  branding: AgencyBranding;
  created_at: Timestamp;
}

export interface CandidateSessionPayload {
  // ...existing fields...
  branding: AgencyBranding;
}

export interface CurrentRecruiter {
  id: Uuid;
  full_name: string;
  email: string;
  agency: { id: Uuid; name: string; branding: AgencyBranding };
}
```

- [ ] **Step 4: Implement `web/src/lib/branding.ts`**

```ts
import type { Agency, AgencyBranding, InterviewerSettings } from "@/lib/db/types";

export const DEFAULT_ACCENT = "#0f6b5c";
export const LOGO_MAX_BYTES = 1_048_576;
export const BANNER_MAX_BYTES = 2_097_152;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export function defaultBranding(): AgencyBranding {
  return { logo_url: null, banner_url: null, accent_color: DEFAULT_ACCENT };
}

export function isAccentColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function withBranding<
  T extends Omit<Agency, "branding"> & { branding?: AgencyBranding | null },
>(agency: T): Agency {
  return {
    ...agency,
    branding: { ...defaultBranding(), ...(agency.branding ?? {}) },
  } as Agency;
}
```

(Keep `InterviewerSettings` import only if needed for casts; prefer no unused imports.)

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd web && npm test -- src/lib/branding.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/branding.ts web/src/lib/branding.test.ts web/src/lib/db/types.ts
git commit -m "Add agency branding types and helpers."
```

---

### Task 2: Migration + store persistence

**Files:**
- Create: `supabase/migrations/20261117160000_agency_branding.sql`
- Modify: `web/src/lib/db/helpers.ts`
- Modify: `web/src/lib/db/mock.ts`
- Modify: `web/src/lib/db/supabase-store.ts`
- Modify: `web/src/lib/db/index.ts`
- Modify: `web/src/lib/db/db.test.ts`
- Modify: `web/src/lib/auth/dal.ts`

**Interfaces:**
- Consumes: `defaultBranding`, `withBranding`, `AgencyBranding`
- Produces:
  - `updateAgencyBranding(agencyId: string, branding: AgencyBranding): Promise<Agency | null>`
  - `getAgency` / create paths always return agencies with branding
  - `candidatePayloadOf` includes `branding: agency.branding`
  - `CurrentRecruiter.agency.branding` from DAL

- [ ] **Step 1: Write failing payload test**

Extend `web/src/lib/db/db.test.ts` — after building payload with `withInterviewer` + `withBranding`:

```ts
import { withBranding } from "@/lib/branding";
// agency = withBranding(withInterviewer({ ... }))
agency.branding = { logo_url: "https://cdn.example/logo.png", banner_url: null, accent_color: "#112233" };
// ...
expect(payload.branding).toEqual(agency.branding);
```

Also assert `withBranding` on null branding in the existing normalize test block.

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd web && npm test -- src/lib/db/db.test.ts`
Expected: FAIL (Agency type / payload missing branding)

- [ ] **Step 3: Migration SQL**

```sql
-- Agency visual identity: logo, banner, accent.
alter table public.agencies
  add column branding jsonb not null default jsonb_build_object(
    'logo_url', null,
    'banner_url', null,
    'accent_color', '#0f6b5c'
  );

alter table public.agencies
  add constraint agencies_branding_shape check (
    jsonb_typeof(branding -> 'accent_color') = 'string'
    and branding ->> 'accent_color' ~ '^#[0-9A-Fa-f]{6}$'
    and (
      branding -> 'logo_url' is null
      or jsonb_typeof(branding -> 'logo_url') = 'null'
      or jsonb_typeof(branding -> 'logo_url') = 'string'
    )
    and (
      branding -> 'banner_url' is null
      or jsonb_typeof(branding -> 'banner_url') = 'null'
      or jsonb_typeof(branding -> 'banner_url') = 'string'
    )
  );

-- Public-read branding assets; writes happen via service role in MVP.
insert into storage.buckets (id, name, public)
values ('agency-branding', 'agency-branding', true)
on conflict (id) do nothing;

create policy agency_branding_public_read
  on storage.objects for select
  to public
  using (bucket_id = 'agency-branding');
```

- [ ] **Step 4: Wire helpers + stores**

- In `helpers.ts`: import `withBranding` / `defaultBranding`; wrap agency normalization wherever `withInterviewer` is applied for reads; in `candidatePayloadOf` add `branding: agency.branding`.
- Prefer a single `normalizeAgency(agency) => withBranding(withInterviewer(agency))` used by both stores on read.
- `mock.ts`: every `Agency` literal includes `branding: defaultBranding()`; add:

```ts
export async function updateAgencyBranding(agencyId: string, branding: AgencyBranding): Promise<Agency | null> {
  const agency = await getAgency(agencyId);
  if (!agency) return null;
  agency.branding = { ...defaultBranding(), ...branding };
  // persist store if mock persistence enabled (same pattern as updateInterviewer)
  return agency;
}
```

- `supabase-store.ts`: same function via `.update({ branding }).eq("id", agencyId)`; map rows through `normalizeAgency`.
- `index.ts`: export `updateAgencyBranding`.
- `dal.ts`:

```ts
agency: { id: agency.id, name: agency.name, branding: agency.branding },
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd web && npm test -- src/lib/db/db.test.ts src/lib/branding.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261117160000_agency_branding.sql \
  web/src/lib/db/helpers.ts web/src/lib/db/mock.ts web/src/lib/db/supabase-store.ts \
  web/src/lib/db/index.ts web/src/lib/db/db.test.ts web/src/lib/auth/dal.ts
git commit -m "Persist agency branding in DB stores and candidate payload."
```

---

### Task 3: Asset storage + `saveBranding` action

**Files:**
- Create: `web/src/lib/branding/storage.ts`
- Create: `web/src/lib/branding/storage.test.ts` (pure validation helpers if extracted)
- Modify: `web/src/app/actions/settings.ts`

**Interfaces:**
- Consumes: `ALLOWED_IMAGE_TYPES`, size constants, `isAccentColor`, `updateAgencyBranding`, `usingSupabase` / `supabaseAdmin`
- Produces:
  - `assertBrandingImage(file: File, kind: "logo" | "banner"): string | null` — error message or null
  - `uploadAgencyAsset(agencyId, kind, file): Promise<string>` — public URL
  - `removeAgencyAsset(agencyId, kind): Promise<void>`
  - `saveBranding(_prev, formData): Promise<FormState>`

FormData fields:
- `accent_color` (string)
- `logo` (optional File)
- `banner` (optional File)
- `remove_logo` = `"1"` optional
- `remove_banner` = `"1"` optional

- [ ] **Step 1: Write failing validation tests**

```ts
// web/src/lib/branding/storage.test.ts
import { describe, expect, it } from "vitest";
import { assertBrandingImage } from "@/lib/branding/storage";

describe("assertBrandingImage", () => {
  it("rejects wrong mime", () => {
    const file = new File([new Uint8Array([1])], "x.svg", { type: "image/svg+xml" });
    expect(assertBrandingImage(file, "logo")).toMatch(/png|jpeg|webp/i);
  });

  it("rejects oversized logo", () => {
    const file = new File([new Uint8Array(1_048_577)], "big.png", { type: "image/png" });
    expect(assertBrandingImage(file, "logo")).toMatch(/1\s*Mo|1\s*MB|trop/i);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd web && npm test -- src/lib/branding/storage.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement storage**

`web/src/lib/branding/storage.ts`:

- `assertBrandingImage`: check MIME against `ALLOWED_IMAGE_TYPES`; size vs `LOGO_MAX_BYTES` / `BANNER_MAX_BYTES`; French error strings.
- Ext from MIME: png→`.png`, jpeg→`.jpg`, webp→`.webp`.
- Path: `${agencyId}/${kind}${ext}`.
- If `usingSupabase()`: `supabaseAdmin().storage.from("agency-branding").upload(path, buffer, { upsert: true, contentType })` then `getPublicUrl`.
- Else: write under `web/.data/branding/${agencyId}/` via `fs/promises`; return URL path served by a tiny route **or** for mock MVP store a `data:` URL / absolute file served at `/api/branding/[agencyId]/[kind]` .

**Mock serving decision (lock in):** create `web/src/app/api/branding/[agencyId]/[kind]/route.ts` that reads from `web/.data/branding/` and returns the image with correct content-type. Upload writes files there and returns `/api/branding/{agencyId}/{kind}`.

- [ ] **Step 4: Implement `saveBranding`**

In `settings.ts`:

```ts
export async function saveBranding(_previous: FormState, formData: FormData): Promise<FormState> {
  const recruiter = await requireRecruiter();
  const agencyId = recruiter.agency.id;
  const accent = text(formData, "accent_color");
  if (!isAccentColor(accent)) {
    return { fieldErrors: { accent_color: "Choisissez une couleur #RRGGBB." }, error: "Certains réglages sont à corriger." };
  }

  const current = await getAgency(agencyId);
  if (!current) return { error: "Agence introuvable." };
  let next = { ...current.branding, accent_color: accent };

  const logo = formData.get("logo");
  const banner = formData.get("banner");
  // validate File instances, assertBrandingImage, upload, set urls
  // remove_logo / remove_banner → removeAgencyAsset + null urls
  await updateAgencyBranding(agencyId, next);
  refresh();
  return { ok: true };
}
```

Upload order: validate all files first → upload → then DB update (on upload failure, return error without DB write).

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd web && npm test -- src/lib/branding/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/branding/ web/src/app/actions/settings.ts \
  web/src/app/api/branding/
git commit -m "Add branding asset upload and saveBranding action."
```

---

### Task 4: Settings UI — Branding form

**Files:**
- Modify: `web/src/components/recruiter/settings-forms.tsx`
- Modify: `web/src/app/recruiter/settings/page.tsx`

**Interfaces:**
- Consumes: `saveBranding`, `AgencyBranding`
- Produces: `BrandingForm({ branding: AgencyBranding })`

- [ ] **Step 1: Add `BrandingForm`**

Client form with `useActionState(saveBranding, …)` matching `AgencyForm` / `InterviewerForm` patterns in the same file:

- Color input `type="color"` + text field bound to `accent_color`
- File inputs `name="logo"` / `name="banner"` accept `image/png,image/jpeg,image/webp`
- Preview `<img>` when `branding.logo_url` / `banner_url` set
- Checkboxes or buttons setting hidden `remove_logo` / `remove_banner`
- Submit button “Enregistrer le branding”
- Show `fieldErrors` / `error` like other forms

- [ ] **Step 2: Wire settings page**

Insert Branding card **above** Agence card:

```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-lg">Branding</CardTitle>
    <CardDescription>Logo, bandeau et couleur visibles dans votre espace et chez le candidat.</CardDescription>
  </CardHeader>
  <CardContent>
    <BrandingForm branding={agency.branding} />
  </CardContent>
</Card>
```

- [ ] **Step 3: Manual smoke**

Run: `cd web && npm run dev`  
Open `/recruiter/settings`, set accent + logo (mock), save, confirm no server error.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/recruiter/settings-forms.tsx web/src/app/recruiter/settings/page.tsx
git commit -m "Add branding settings form for agencies."
```

---

### Task 5: Recruiter chrome (sidebar, accent, banner)

**Files:**
- Modify: `web/src/components/recruiter/agency-badge.tsx`
- Modify: `web/src/components/recruiter/app-sidebar.tsx`
- Create: `web/src/components/recruiter/agency-banner.tsx`
- Modify: `web/src/app/recruiter/layout.tsx`
- Optionally touch: `web/src/app/globals.css` (document `--agency-accent`)

**Interfaces:**
- Consumes: `CurrentRecruiter.agency.branding`
- Produces: sidebar logo; layout style `--agency-accent`; shared banner under header area

- [ ] **Step 1: AgencyBadge accepts logo**

```tsx
export function AgencyBadge({ agency, logoUrl }: { agency: string; logoUrl?: string | null }) {
  // if logoUrl: <img src={logoUrl} alt="" className="size-8 rounded-lg object-contain" />
  // else: existing Waveform box
}
```

`AppSidebar` passes `logoUrl={recruiter.agency.branding.logo_url}`.

- [ ] **Step 2: Layout accent + banner**

In `RecruiterLayout` / sidebar branch, fetch branding (already on recruiter). Wrap `SidebarInset` children:

```tsx
<div
  className="flex min-h-svh flex-1 flex-col"
  style={{ ["--agency-accent" as string]: recruiter.agency.branding.accent_color }}
>
  <AgencyBanner url={recruiter.agency.branding.banner_url} />
  {children}
</div>
```

Note: layout currently only loads recruiter inside `RecruiterSidebar`. Refactor so `requireRecruiter()` runs once and passes branding into both sidebar and inset chrome (e.g. single async `RecruiterShell`).

`AgencyBanner`: if no url, return null; else full-width image `h-24 md:h-32 object-cover`.

- [ ] **Step 3: Consume accent sparingly**

Map primary actions that already use `bg-primary` to also respect agency accent **only where low-risk**: set on the shell:

```css
/* in layout style or a small class */
--primary: var(--agency-accent);
--brand: var(--agency-accent);
--ring: var(--agency-accent);
--sidebar-primary: var(--agency-accent);
```

via inline style object on the shell div (override CSS variables for the recruiter subtree). Do not invent new button variants.

- [ ] **Step 4: Manual check**

Save branding → sidebar shows logo; pages show banner; buttons pick up accent.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/recruiter/agency-badge.tsx \
  web/src/components/recruiter/app-sidebar.tsx \
  web/src/components/recruiter/agency-banner.tsx \
  web/src/app/recruiter/layout.tsx
git commit -m "Show agency branding in recruiter chrome."
```

---

### Task 6: Candidate interview UI

**Files:**
- Create: `web/src/components/interview/agency-brand-header.tsx`
- Modify: `web/src/components/interview/interview-flow.tsx`
- Modify: `web/src/components/interview/lobby.tsx`
- Modify: `web/src/lib/db/db.test.ts` if payload assertions need refresh

**Interfaces:**
- Consumes: `payload.branding`, `payload.agency` (name string)
- Produces: branded header; lobby/goodbye banner; call header without banner

- [ ] **Step 1: `AgencyBrandHeader`**

```tsx
export function AgencyBrandHeader({
  name,
  logoUrl,
  href = null,
}: {
  name: string;
  logoUrl: string | null;
  href?: string | null;
}) {
  // logo img or text name; no RecruitAI Brand when logo/name agency branding is the focus
}
```

- [ ] **Step 2: Wire `InterviewFlow`**

- Root wrapper: `style={{ --agency-accent, --primary, --brand, --ring }}` from `payload.branding.accent_color`.
- Replace `<Brand …>` with `<AgencyBrandHeader name={payload.agency} logoUrl={payload.branding.logo_url} href={finished ? "/" : null} />`.
- Lobby + goodbye: render banner image when `payload.branding.banner_url`.
- Call step: header logo only (no banner).

- [ ] **Step 3: Lobby**

Accept optional `bannerUrl` prop or read from payload already passed; place banner below header / above job title without turning the lobby into a card collage — one image strip.

- [ ] **Step 4: Typecheck + tests**

Run: `cd web && npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Manual candidate path**

Open an interview token after setting branding → lobby shows logo/banner/accent → start call → header keeps logo/accent → goodbye shows banner again.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/interview/agency-brand-header.tsx \
  web/src/components/interview/interview-flow.tsx \
  web/src/components/interview/lobby.tsx
git commit -m "Apply agency branding on the candidate interview journey."
```

---

### Task 7: Acceptance pass

**Files:** none new (fix only)

- [ ] **Step 1: Checklist against spec acceptance**

1. Settings can set/clear logo, banner, accent.
2. Recruiter sidebar/header/banner/accent update after save.
3. Candidate lobby + goodbye: logo + banner + accent; call: logo + accent.
4. Empty branding = RecruitAI defaults (Waveform / Brand-equivalent agency name header without broken images).
5. Mock mode: upload works via `/api/branding/...` without Supabase Storage.

- [ ] **Step 2: Run full test suite**

Run: `cd web && npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Final commit only if fixes were needed**

```bash
git add -A
git commit -m "Fix agency branding acceptance gaps."
```

(Skip empty commit if nothing to fix.)

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| `branding` JSONB + defaults `#0f6b5c` | 1–2 |
| Storage bucket + mock fallback | 2–3 |
| Raster only, size limits | 3 |
| Settings Branding card + `saveBranding` | 3–4 |
| Recruiter sidebar logo, banner, accent | 5 |
| Candidate lobby/call/goodbye branding | 6 |
| Payload carries branding | 2 |
| Non-goals excluded (domains, favicon, live push) | — not in tasks |
| Unit tests helpers + payload | 1–2–3 |

No TBD placeholders. Types consistent: `AgencyBranding`, `updateAgencyBranding`, `saveBranding`, `--agency-accent`.
