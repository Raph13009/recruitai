import Link from "next/link";

export function Waveform({ className = "" }: { className?: string }) {
  const heights = [0.35, 0.7, 1, 0.55, 0.85, 0.4, 0.75];
  return (
    <span aria-hidden className={`wave inline-flex items-center gap-[3px] ${className}`}>
      {heights.map((h, i) => (
        <span
          key={i}
          className="block w-[3px] origin-center rounded-full bg-current"
          style={{ height: `${h * 100}%`, animation: `bar ${1.1 + (i % 3) * 0.25}s ease-in-out ${i * 0.08}s infinite` }}
        />
      ))}
    </span>
  );
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-full bg-teal text-white">
        <Waveform className="h-3.5" />
      </span>
      <span className="display text-xl font-semibold tracking-tight">
        Recruit<span className="text-teal">AI</span>
      </span>
    </Link>
  );
}

export function PageSkeleton() {
  return <div aria-hidden className="sheet mt-8 h-64 animate-pulse" />;
}

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
      <Brand />
      <nav className="flex items-center gap-5 whitespace-nowrap text-sm text-slate">{children}</nav>
    </header>
  );
}
