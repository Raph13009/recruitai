# Agency branding — design

Date: 2026-11-17  
Status: approved for planning

## Goal

Let an agency configure its visual identity (logo, banner, accent color) once in settings. That branding must appear:

- everywhere in the recruiter (“espace agence”) chrome — sidebar header, page headers
- on the candidate video journey from the first screen (lobby) through the call and goodbye

Updating branding refreshes the recruiter UI immediately and the candidate UI on the next page load of the interview session.

## Non-goals

- Custom domains / subdomains
- Favicon, email template theming, PDF export branding
- Full theme editor (fonts, dark mode, arbitrary CSS)
- Live push of branding mid-call
- Per-job branding overrides

## Approach

Extend `agencies` with a `branding` JSONB column (same pattern as `interviewer`). Store uploaded assets in a Supabase Storage bucket `agency-branding`. Mock/demo mode stores local or data-URL fallbacks so the feature works without Supabase Storage.

## Data model

```ts
type AgencyBranding = {
  logo_url: string | null;
  banner_url: string | null;
  accent_color: string; // #RRGGBB, validated
};
```

- Column: `agencies.branding jsonb not null` with a check constraint for shape and accent format.
- Defaults: `{ logo_url: null, banner_url: null, accent_color: "#0f6b5c" }` (product `--brand` / `--primary`).
- `withBranding()` helper (like `withInterviewer`) fills defaults for older rows.
- `CandidateSessionPayload` gains a `branding` field so the interview client never needs a second fetch.
- Recruiter context (`CurrentRecruiter.agency` / layout data) exposes branding for chrome.

### Storage

- Bucket: `agency-branding`
- Object path: `{agency_id}/logo.{ext}` and `{agency_id}/banner.{ext}`
- Allowed MIME: `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml` (logo); same for banner except SVG optional/disallowed if security prefers raster only — **decision: raster only (png/jpeg/webp) for both** to keep CSP/XSS simple.
- Max size: logo 1 MB, banner 2 MB.
- Public read URLs (or signed long-lived URLs) stored in `branding.logo_url` / `banner_url`.
- RLS / policies: authenticated recruiters may upload/replace only under their `agency_id` folder; public/anonymous read for candidate pages.
- Mock DB: accept uploads into `web/.data/branding/` (or persist URLs in store JSON) when not using Supabase.

## Settings UI

Add a **Branding** card on `/recruiter/settings` (alongside Agency / Interviewer):

- Logo file input + preview + remove
- Banner file input + preview + remove
- Accent color picker (hex) with live preview strip
- Save via server action `saveBranding`

Server action validates color, uploads files, updates `agencies.branding`, revalidates recruiter layout paths.

## Recruiter display

- `agency-badge` / sidebar header: show logo if present, else product mark; agency name stays.
- Optional banner strip under `PageHeader` (or top of `PageBody`) when `banner_url` is set — one consistent placement across recruiter pages via layout/chrome, not per-page duplication.
- CSS variable `--agency-accent` set on the recruiter shell from `accent_color`; primary buttons / key accents consume it where the product already uses a single accent token.

Fallback when branding empty: current RecruitAI look (no visual regression).

## Candidate display

From lobby → call room → goodbye:

- Header shows agency logo (or name-only fallback) instead of dominant RecruitAI brand.
- Banner shown on lobby (and optionally a slim strip in call chrome if space allows without cluttering the video — **default: banner on lobby + goodbye; call header = logo + accent only**).
- Accent applied via the same `--agency-accent` on the interview shell.

Branding is read from the session payload at load time. Mid-call edits by the agency do not hot-reload the open interview tab.

## API / data flow

```
Recruiter uploads → saveBranding → Storage + agencies.branding
                                      ↓
                         getAgency / requireRecruiter
                                      ↓
                         recruiter layout chrome

getSessionContext → toCandidatePayload(+ branding)
                                      ↓
                         interview shell (lobby / call / goodbye)
```

## Validation & errors

- Invalid hex → form error, no write.
- Oversized / wrong MIME → form error before storage write.
- Upload failure → no partial DB update (upload first, then update URLs; on DB failure leave orphan file acceptable for MVP or overwrite same path).
- Missing branding fields → helpers apply defaults.

## Testing

- Unit: `withBranding`, accent hex validation, payload includes branding.
- Store: `updateAgencyBranding` mock + supabase path shape.
- UI smoke (manual): settings save → sidebar logo/accent; open candidate link → lobby shows logo/banner/accent.

## Acceptance

1. Agency can set logo, banner, and accent in settings and clear each asset.
2. Recruiter space header/sidebar reflects logo + accent; banner appears in the shared chrome when set.
3. Candidate lobby (and goodbye) show logo + banner + accent; call header shows logo + accent.
4. Empty branding keeps today’s RecruitAI defaults.
5. Works in mock mode without requiring a real Storage bucket for local demos.
