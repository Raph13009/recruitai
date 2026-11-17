import { cn } from "@/lib/utils";

/** Agency banner (recruiter pages, candidate lobby and goodbye); nothing when none is uploaded. */
export function AgencyBanner({ url, className }: { url: string | null; className?: string }) {
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element -- agency uploads come from arbitrary storage URLs
  return <img src={url} alt="" className={cn("h-24 w-full object-cover md:h-32", className)} />;
}
