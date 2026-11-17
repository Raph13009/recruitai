/** Agency banner shown at the top of every recruiter page; nothing when none is uploaded. */
export function AgencyBanner({ url }: { url: string | null }) {
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element -- agency uploads come from arbitrary storage URLs
  return <img src={url} alt="" className="h-24 w-full object-cover md:h-32" />;
}
