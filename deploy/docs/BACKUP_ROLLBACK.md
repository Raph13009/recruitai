# RecruitAI — sauvegardes et retour arrière

## Sauvegardes automatiques

Le service Compose `backup` exécute un `pg_dump` quotidien vers le volume `recruitai_backups` (`recruitai-YYYYMMDDTHHMMSSZ.sql.gz`).

Le volume `recruitai_branding` contient logos et bannières.

### Copie hors serveur (obligatoire)

Une sauvegarde uniquement sur le serveur n’est pas suffisante. Au moins une fois par jour, copier les dumps et le branding hors du serveur (S3, machine locale chiffrée, etc.) :

```bash
# Exemple depuis une machine de confiance (adapter l’accès SSH Dokploy / hôte)
# Ne pas coller de secrets dans le chat.
rsync -avz user@host:/var/lib/docker/volumes/<project>_recruitai_backups/_data/ ./offsite/pg/
rsync -avz user@host:/var/lib/docker/volumes/<project>_recruitai_branding/_data/ ./offsite/branding/
```

Chiffrer l’archive hors serveur (`age` / `gpg`) avant stockage cloud.

## Test de restauration (instance isolée)

1. Créer un Compose de test **séparé** (ne pas toucher la prod).
2. Monter un dump : `gunzip -c recruitai-….sql.gz | psql "$DATABASE_URL_TEST"`.
3. Copier le branding dans le volume test.
4. Lancer `node scripts/migrate/verify-migration.mjs` contre la base test (avec le `summary.json` d’export d’origine).
5. Vérifier login + reset password + un poste + un entretien synthétique.

Sans ce test, la sauvegarde n’est pas considérée comme validée.

## Rollback applicatif

Tant que Supabase Cloud et Vercel restent intacts :

1. Ne pas basculer le DNS / domaine `recruitai.boostaiconsulting.com` vers Dokploy.
2. En cas de problème sur le Compose de test : `compose.stop` / supprimer uniquement le Compose RecruitAI.
3. Production Vercel + Supabase continuent de servir les utilisateurs.

Après bascule production (uniquement avec accord explicite) :

1. Repointage domaine vers Vercel / Supabase.
2. Restauration PG depuis le dernier dump validé si besoin de récupérer des écritures Dokploy.
3. Conservez Supabase Cloud jusqu’à validation finale écrite.
