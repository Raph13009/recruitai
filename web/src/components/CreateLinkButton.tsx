"use client";

import { useState } from "react";

export function CreateLinkButton({ jobId }: { jobId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, candidateLabel: label || undefined }),
      });
      if (!res.ok) throw new Error();
      setLink(((await res.json()) as { link: string }).link);
      setLabel("");
    } catch {
      setError("Impossible de créer le lien.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={80}
          placeholder="Repère interne (pas de nom complet)"
          aria-label="Repère interne du candidat"
          className="min-w-0 flex-1 rounded-full border border-line bg-sheet px-4 py-2.5 text-sm outline-none focus:border-teal"
        />
        <button className="btn-primary" onClick={generate} disabled={busy}>
          {busy ? "Création…" : "Générer un lien d’entretien"}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-alert">{error}</p>}
      {link && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-teal/25 bg-teal-soft/50 p-3 text-sm">
          <code className="min-w-0 flex-1 truncate">{link}</code>
          <button className="btn-ghost px-3 py-1.5" onClick={copy}>{copied ? "Copié" : "Copier"}</button>
          <a className="btn-ghost px-3 py-1.5" href={link} target="_blank" rel="noreferrer">Ouvrir</a>
        </div>
      )}
    </div>
  );
}
