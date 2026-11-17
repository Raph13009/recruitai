import { BRANDING_KINDS, readMockAsset, type BrandingKind } from "@/lib/branding/storage";

/** Serves branding images stored locally by the demo store (Supabase serves its own public URLs). */
export async function GET(_request: Request, ctx: { params: Promise<{ agencyId: string; kind: string }> }) {
  const { agencyId, kind } = await ctx.params;
  if (!/^[\w-]+$/.test(agencyId) || !BRANDING_KINDS.includes(kind as BrandingKind)) {
    return new Response("Not found", { status: 404 });
  }
  const asset = await readMockAsset(agencyId, kind as BrandingKind);
  if (!asset) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(asset.data), {
    headers: { "Content-Type": asset.contentType, "Cache-Control": "no-cache" },
  });
}
