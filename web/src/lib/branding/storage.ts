import { ALLOWED_IMAGE_TYPES, BANNER_MAX_BYTES, LOGO_MAX_BYTES } from "@/lib/branding";

export type BrandingKind = "logo" | "banner";

export const BRANDING_BUCKET = "agency-branding";
export const BRANDING_KINDS: readonly BrandingKind[] = ["logo", "banner"];

const EXT_BY_TYPE: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };
const EXTENSIONS = Object.values(EXT_BY_TYPE);

/** French error message when the file is not an acceptable branding image, else null. */
export function assertBrandingImage(file: File, kind: BrandingKind): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Format non pris en charge : utilisez une image PNG, JPEG ou WebP.";
  }
  const max = kind === "logo" ? LOGO_MAX_BYTES : BANNER_MAX_BYTES;
  if (file.size > max) {
    return `Image trop lourde : ${max / 1_048_576} Mo maximum.`;
  }
  return null;
}

// Server-only modules are loaded lazily so the pure validation above stays importable in tests.
const dataDir = async () => (await import("@/lib/data-dir")).dataFile("branding");
const supabase = async () => {
  const { usingSupabase } = await import("@/lib/db");
  if (!usingSupabase()) return null;
  return (await import("@/lib/db/client")).supabaseAdmin();
};

/** Stores the image and returns the URL candidates load it from. */
export async function uploadAgencyAsset(agencyId: string, kind: BrandingKind, file: File): Promise<string> {
  const ext = EXT_BY_TYPE[file.type];
  const buffer = Buffer.from(await file.arrayBuffer());
  const client = await supabase();

  if (client) {
    const bucket = client.storage.from(BRANDING_BUCKET);
    const path = `${agencyId}/${kind}${ext}`;
    const { error } = await bucket.upload(path, buffer, { upsert: true, contentType: file.type });
    if (error) throw new Error(error.message);
    // A previous upload with another format would otherwise linger.
    await bucket.remove(EXTENSIONS.filter((e) => e !== ext).map((e) => `${agencyId}/${kind}${e}`));
    // Same path on every upload: the version query defeats CDN and browser caches.
    return `${bucket.getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  }

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const dir = path.join(await dataDir(), agencyId);
  await fs.mkdir(dir, { recursive: true });
  await Promise.all(EXTENSIONS.map((e) => fs.rm(path.join(dir, `${kind}${e}`), { force: true })));
  await fs.writeFile(path.join(dir, `${kind}${ext}`), buffer);
  return `/api/branding/${agencyId}/${kind}?v=${Date.now()}`;
}

export async function removeAgencyAsset(agencyId: string, kind: BrandingKind): Promise<void> {
  const client = await supabase();
  if (client) {
    const { error } = await client.storage
      .from(BRANDING_BUCKET)
      .remove(EXTENSIONS.map((e) => `${agencyId}/${kind}${e}`));
    if (error) throw new Error(error.message);
    return;
  }
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const dir = path.join(await dataDir(), agencyId);
  await Promise.all(EXTENSIONS.map((e) => fs.rm(path.join(dir, `${kind}${e}`), { force: true })));
}

const CONTENT_TYPE_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_BY_TYPE).map(([type, ext]) => [ext, type]),
);

/** Reads a branding image from private FS (mock or private Postgres). Supabase uses public URLs. */
export async function readPrivateAsset(
  agencyId: string,
  kind: BrandingKind,
): Promise<{ data: Buffer; contentType: string } | null> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const dir = path.join(await dataDir(), agencyId);
  for (const ext of EXTENSIONS) {
    try {
      return { data: await fs.readFile(path.join(dir, `${kind}${ext}`)), contentType: CONTENT_TYPE_BY_EXT[ext] };
    } catch {
      // try the next extension
    }
  }
  return null;
}
