# Sauvegardes chiffrées → Cloudflare R2

Configuration simple : dump quotidien PostgreSQL + volume branding, chiffrement `age`, upload S3-compatible R2, rétention, alerte Resend, test de restauration local.

## Ce qui tourne déjà sans R2

Le service Compose `backup` :

1. `pg_dump` → `/backups/recruitai-*.sql.gz`
2. Restore self-test dans une base temporaire `recruitai_restore_check` (comptages puis drop)
3. Rétention locale `BACKUP_KEEP_DAYS` (défaut 14)

Sans variables R2, l’offsite est **ignoré proprement**.

## À créer de votre côté (intervention manuelle)

1. **Bucket R2** (Cloudflare dashboard → R2 → Create bucket), ex. `recruitai-backups`.
2. **API token R2** avec permission Object Read & Write sur ce bucket.
3. **Endpoint** du compte : `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
4. **Clé age** (une fois, sur votre machine) :

```bash
age-keygen -o recruitai-backup.agekey
# Copier la ligne "public key" (age1...) → AGE_RECIPIENT dans Dokploy
# Garder le fichier .agekey hors git (coffre / 1Password). Il sert uniquement à restaurer.
```

5. Dans Dokploy → Compose `recruitai-test` → Environment, ajouter (valeurs réelles, jamais dans le chat) :

```
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_BUCKET=recruitai-backups
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
AGE_RECIPIENT=age1...
OFFSITE_KEEP_DAYS=30
BACKUP_ALERT_TO=vous@votre-domaine.fr
```

`RESEND_API_KEY` / `RESEND_FROM` déjà présents sont réutilisés pour l’alerte d’échec.

6. Dans `deploy/docker/docker-compose.yml`, basculer le service `backup` sur le build
   `dockerfile: deploy/docker/Dockerfile.backup` (image avec `age` + `aws-cli`).
   Sans cela, l’offsite reste en no-op (dumps locaux + restore self-test uniquement).

7. Redeploy / recreate le service `backup` après ajout des variables.

## Restauration (test manuel)

```bash
# Télécharger l'objet .tar.gz.age depuis R2
age -d -i recruitai-backup.agekey -o restore.tar.gz recruitai-....tar.gz.age
tar -tzf restore.tar.gz
gunzip -c path/to/recruitai-….sql.gz | psql "$DATABASE_URL"
```

Le restore self-test quotidien prouve déjà qu’un dump local se recharge correctement.

## Coût

Le plan gratuit Cloudflare R2 suffit pour démarrer (pas de création de compte payant requise pour cette préparation).
