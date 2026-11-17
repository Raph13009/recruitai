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
