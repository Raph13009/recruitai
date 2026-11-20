# Migration Supabase Cloud → PostgreSQL privé (Option A)

## Principe

- Supabase Cloud et Vercel restent **intacts** pendant toute la préparation.
- L’architecture finale n’utilise plus Supabase Auth / Storage / Cloud DB.
- Auth = cookies HMAC + mots de passe scrypt (`web/src/lib/auth/password.ts`).
- Branding = volume FS servi par `/api/branding/...`.
- Données = PostgreSQL privé dans le Compose Dokploy.

## Étapes

1. Inventaire (lecture seule)  
   `node --env-file=web/.env.local scripts/migrate/inventory-supabase.mjs`

2. Export sécurisé (pas d’affichage des lignes)  
   `node --env-file=web/.env.local scripts/migrate/export-supabase.mjs`  
   → `deploy/migration/.secure/export/` (gitignored)

3. Préparer une base **test** isolée, appliquer `deploy/postgres/schema.sql`.

4. Import (IDs conservés ; `must_reset_password=true`)  
   `MIGRATE_WIPE=true DATABASE_URL=... node scripts/migrate/import-private-pg.mjs`

5. Vérification des comptes  
   `DATABASE_URL=... node scripts/migrate/verify-migration.mjs`

6. Déploiement Compose de test (`recruitai-test.…`), sans bascule du domaine prod.

7. Les recruteurs migrés utilisent « Mot de passe oublié » (aucun export de hash Auth).
   Vérification auto : service Compose `auth-verify` (`SEND_RESET_EMAIL=true` pour envoyer les vrais liens).

8. Backups : dumps locaux + restore self-test ; offsite R2 chiffré → `deploy/docs/R2-BACKUPS.md`.

9. Audit dépôt public → `deploy/docs/SECURITY-AUDIT.md`.
   Tests entretien low-credit → `deploy/docs/INTERVIEW-TEST-PLAN.md`.

## Bascule production

Requiert accord explicite : domaine `recruitai.boostaiconsulting.com`, secrets prod (R2 inclus), arrêt progressif Vercel/Supabase.
