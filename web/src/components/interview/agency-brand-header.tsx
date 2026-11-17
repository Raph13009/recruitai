"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** The agency's logo (or its name when there is none) at the top of the candidate journey. */
export function AgencyBrandHeader({
  name,
  logoUrl,
  href = null,
  className,
}: {
  name: string;
  logoUrl: string | null;
  /** Null where leaving the page would be a mistake (mid-interview). */
  href?: string | null;
  className?: string;
}) {
  // A logo that fails to load falls back to the name rather than a broken image.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showLogo = logoUrl && failedUrl !== logoUrl;
  const content = showLogo ? (
    // eslint-disable-next-line @next/next/no-img-element -- agency uploads come from arbitrary storage URLs
    <img src={logoUrl} alt={name} onError={() => setFailedUrl(logoUrl)} className="h-9 w-auto max-w-48 object-contain" />
  ) : (
    <span className="display truncate text-xl font-semibold tracking-tight">{name}</span>
  );
  const classes = cn("inline-flex min-w-0 items-center", className);
  return href === null ? (
    <span className={classes}>{content}</span>
  ) : (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}
