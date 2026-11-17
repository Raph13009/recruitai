# RecruitAI · app web (MVP SaaS)

Le premier entretien d’embauche, en visio, mené par une IA qui se présente comme telle. Le candidat voit un visage photoréaliste et parle avec une voix en temps réel, qui termine toujours ses phrases (le bruit ambiant ne la coupe pas). L’agence lit un compte rendu factuel, sans score ni décision.

## Démarrer

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

Sans aucune clé, tout fonctionne en **mode démo** : l’intervieweuse suit un script côté serveur et parle avec la voix du navigateur ; le candidat répond à l’oral ou par écrit. Un candidat sans micro peut aussi « Continuer sans micro » : l’IA parle toujours à voix haute (et l’avatar bouge), il répond par écrit.

- `/` : site vitrine
- `/demo` : passer un entretien comme un candidat (poste fictif)
- `/login` : bouton « compte de démonstration » (agence fictive avec des entretiens d’exemple)
- `/signup` : créer sa propre agence

Pour la vraie visio, copiez `.env.example` en `.env.local` :

| Variable | Effet |
| --- | --- |
| `GEMINI_API_KEY` | Voix en temps réel (Gemini Live) : réponses instantanées, relances quand une réponse est vague, prise de notes structurée |
| `LIVEAVATAR_API_KEY` | Visage vidéo photoréaliste synchronisé sur la voix (LiveAvatar, mode LITE) |
| `LIVEAVATAR_SANDBOX` | `true` par défaut : visage de test « Wayne », sessions d’environ une minute, sans crédit consommé. `false` pour la bibliothèque complète |
| `LIVEAVATAR_AVATAR_ID` | Visage par défaut hors bac à sable (chaque agence peut choisir le sien dans Réglages) |
| `SESSION_SECRET` | Signe les cookies de connexion. Obligatoire en hébergement serverless, généré automatiquement en local |
| `USE_MOCK_DB=false` + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Données dans Supabase (Postgres) au lieu de la base de démonstration locale. Appliquez d’abord les deux migrations de `supabase/migrations` |

Les clés restent côté serveur ; le navigateur ne reçoit que des jetons de courte durée.

## Commandes

```bash
npm run dev        # serveur de développement
npm run build      # build de production
npm test           # tests unitaires (vitest)
npm run lint
npm run typecheck
```

## Apparence

Palette de Raphaël : papier crème `#f2efe9`, cartes `#fbfaf7`, encre `#16212b`, vert-bleu `#0f6b5c` pour les boutons et le logo, bordures `#ddd8cd`, avec sa texture de fond. Elle est définie une seule fois dans `src/app/globals.css`. L’app reste toujours claire, même si l’ordinateur est en mode sombre ; seules la vidéo de l’avatar et l’aperçu caméra sont sur fond encre. L’image de l’intervieweuse sur la page d’accueil est `public/interviewer.jpg` : c’est une photo provisoire, à remplacer par un portrait généré par IA (format 16:9, au moins 1280 px de large). Sans ce fichier, l’accueil affiche l’animation vocale à la place.

## Données

Tout le code passe par `@/lib/db`, qui choisit le stockage :

- par défaut, la base de démonstration locale, enregistrée dans `web/.data/store.json` (comptes, postes, entretiens). Supprimez ce fichier pour repartir des données d’exemple ;
- avec `USE_MOCK_DB=false` et les clés Supabase, la base Postgres partagée (comptes recruteurs gérés par Supabase Auth). C’est elle qu’il faut en production, sur Vercel notamment.

`GET /api/health` indique le stockage actif (`storage: "local" | "supabase"`). Détails : `docs/V2-CLOUD.md`.

## Structure

```
src/app/                  pages (site, démo, entretien, espace recruteur) et routes API
src/app/actions/          Server Actions : connexion, postes, invitations, réglages
src/components/interview/ salle d’attente et écran de visio du candidat
src/components/recruiter/ espace recruteur (barre latérale, tableaux, compte rendu, réglages)
src/lib/client/           navigateur : micro, voix Gemini Live, avatar LiveAvatar, moteur de démo
src/lib/interview/        consignes de l’IA, outils, mémoire typée, compte rendu, moteur de démo
src/lib/auth/             mots de passe, cookie de session signé, contrôle d’accès
src/lib/db/index.ts       point d’entrée unique des données (base locale ou Supabase)
src/lib/db/mock.ts        base de démonstration (même schéma que supabase/migrations)
src/lib/db/supabase-store.ts  stockage Postgres via Supabase
```

Architecture détaillée et garde-fous : [`docs/V2-CLOUD.md`](../docs/V2-CLOUD.md).
