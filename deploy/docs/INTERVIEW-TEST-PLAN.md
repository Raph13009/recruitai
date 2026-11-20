# Plan de tests entretien (crédits minimaux)

Environnement : `https://recruitai-test.boostaiconsulting.com`

## Prérequis config

| Service | Attendu pré-prod | Vérification |
|---------|------------------|--------------|
| Resend | `RESEND_API_KEY` + `RESEND_FROM` domaine vérifié | service `externals-check` |
| Gemini Live | `GEMINI_API_KEY` | `externals-check` (liste models, **pas** de session Live) |
| LiveAvatar | `LIVEAVATAR_API_KEY`, **`LIVEAVATAR_SANDBOX=true`** | `externals-check` |

Garder le sandbox LiveAvatar jusqu’à la bascule domaine : sessions ~1 min, visage Wayne, **sans crédits payants**.

## Séquence (une fois)

1. Login recruteur (après reset) → créer / ouvrir un poste.
2. Créer une invitation → e-mail Resend OU copier le lien.
3. Lobby candidat : branding PNG 200, consentement micro.
4. Démarrer l’entretien **sandbox** (< 60 s) : une question, une réponse, terminer.
5. Côté recruteur : rapport + transcript visibles ; export JSON OK.
6. Isolation : avec un second compte d’une autre agence, export de l’id session → 404.
7. Optionnel **une seule fois** : `LIVE_SMOKE=1 node web/scripts/smoke-gemini-live.mjs` en local (1 tour audio).

## À ne pas faire

- Boucles de sessions LiveAvatar hors sandbox.
- Stress Gemini Live sur l’environnement de test.
- Basculer `LIVEAVATAR_SANDBOX=false` avant l’accord de mise en production.
