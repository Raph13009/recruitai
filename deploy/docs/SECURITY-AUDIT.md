# Audit sécurité — dépôt public + images Docker

Date : 2026-11-20 · branche `migrate/dokploy-private-pg`

## Périmètre

- Dépôt GitHub public `Raph13009/recruitai`
- Historique Git (blobs trackés)
- Contexte de build Docker (web, migrate, backup)
- Volumes runtime (hors dépôt)

## Résultat

| Zone | Statut | Notes |
|------|--------|-------|
| Secrets dans le tip (`HEAD`) | OK | Pas de `.env`, dumps, `.secure`, clés API hardcodées trackés |
| Historique (fichiers sensibles ajoutés) | OK | Aucun `.env` / dump / `.secure` jamais commités |
| Gros blobs (>500 Ko) | OK | Aucun |
| Données candidats | OK | Seul `data/demo_job.json` (démo) est tracké |
| Build context Docker | Corrigé | `.dockerignore` exclut `.env*`, `.secure`, dumps, `.data`, `node_modules` |
| `.gitignore` | Renforcé | `*.sql.gz`, `*.tar.gz.age`, `*.agekey`, `.secure/` |

## Corrections appliquées

1. Ajout de `.dockerignore` (empêche l’injection accidentelle de secrets dans les images).
2. Renforcement de `.gitignore` pour backups chiffrés et dumps.
3. Service backup : dumps locaux + restore self-test ; offsite R2 optionnel chiffré `age` (voir `R2-BACKUPS.md`).

## Risques résiduels acceptables

- `/api/branding/[agencyId]/[kind]` est public par UUID (nécessaire pour les lobbies candidats). L’UUID d’agence n’est pas énumérable facilement ; le contenu est logo/bannière seulement.
- Les tokens candidat dans l’URL donnent accès à **une** session (by design). Pas d’accès aux listes recruteur.
- Les secrets de production vivent uniquement dans Dokploy env (jamais dans Git).

## Non-objectifs

- Pas de purge d’historique Git nécessaire (rien de sensible trouvé).
- Vercel / Supabase Cloud inchangés (lecture seule migration).
