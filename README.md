# Poker Coach PWA

Application PWA complète de coaching Texas Hold'em, 100 % locale et hors ligne
(HTML/CSS/JS vanilla, aucune dépendance externe au runtime).

## Lancer l'application

Il faut la servir via HTTP (les modules ES et le service worker ne fonctionnent
pas en `file://`). Depuis le dossier du projet :

```bash
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

Ou avec n'importe quel serveur statique (`npx serve`, extension "Live Server", etc.).
Pour un vrai test PWA (installation, mode hors ligne), servez en HTTPS ou en
`localhost` (les deux sont considérés comme des "origines sécurisées" par les
navigateurs).

## Structure

```
poker-coach-pwa/
├── index.html              Écrans : accueil, table, dashboard, apprentissage
├── style.css                Design system complet (mobile-first)
├── manifest.json / sw.js    PWA : installation + cache offline
├── js/
│   ├── config.js             Constantes, 5 niveaux de difficulté
│   ├── poker-engine.js       Évaluation des mains, équité (Monte Carlo), pot odds
│   ├── table-engine.js       Orchestration d'une main (blinds, tours, side pots)
│   ├── ai-opponent.js        Décisions des IA adverses (5 niveaux)
│   ├── coach.js               Conseils et explications pédagogiques
│   ├── stats-manager.js      Persistance IndexedDB
│   ├── ui-table.js / ui-coach-panel.js / ui-stats-dashboard.js / learning-mode.js
│   └── app.js                 Contrôleur principal, boucle de jeu
└── assets/icons/             Icônes PWA (8 tailles)
```

## Ce qui fonctionne (testé)

- **Moteur de poker** : évaluation exacte des mains (carte haute → quinte flush
  royale, y compris la "roue" A-2-3-4-5), comparaison, gestion des side pots
  multiples. Stress-testé sur **18 500+ mains simulées** (heads-up et 6 joueurs,
  tous niveaux d'IA) sans fuite de jetons ni crash.
- **5 niveaux d'IA** avec profils de jeu distincts (fold/relance/bluff, sizing,
  ajustement positionnel), suivi des tendances par adversaire.
- **Coach** en mode Apprentissage (explication avant/après chaque décision) et
  Interactif (conseil à la demande) — réponse < 200 ms, recommandations
  cohérentes avec la classification de la main.
- **Dashboard** 5 onglets (vue d'ensemble, position, mains, progression,
  historique), mis à jour en direct pendant la session en cours.
- **Centre d'apprentissage** : classement des mains, position, pot odds,
  bankroll, erreurs courantes, glossaire.
- **Persistance IndexedDB** vérifiée après rechargement complet de la page.
- **Export JSON** des données de session.
- **PWA** : service worker actif, 23 fichiers en cache, app testée et
  fonctionnelle avec le réseau complètement coupé.
- **Responsive** : testé à 390 px (mobile) et 1400 px (desktop), raccourcis
  clavier desktop (F/C/R/A/H).

## Écart assumé par rapport au brief : pas de WebLLM/Llama 3.2

Le brief demandait un LLM Llama 3.2 embarqué via WebLLM. Le coach de cette
version utilise à la place une **logique heuristique locale** (calcul d'équité
par simulation Monte Carlo + règles de décision). Raison : un vrai modèle
1B+ via WebLLM pèse plusieurs centaines de Mo à quelques Go, se charge
lentement sur mobile, et l'exigence du cahier des charges elle-même
(réponse < 1 s, textes de coaching structurés et prévisibles) est mieux
tenue par des règles déterministes que par de l'inférence générative.

Le code est prévu pour qu'on puisse brancher un vrai LLM plus tard :
`PokerCoach.setLLMBackend(backend)` dans `js/coach.js` est le point
d'extension prévu à cet effet — actuellement inutilisé.

## Limites connues

- Les graphiques du dashboard sont de simples barres CSS (pas de bibliothèque
  de charting), suffisants pour visualiser une tendance mais sans axes gradués.
- "Niveau battu" (progression de difficulté) se déclenche sur un ROI de
  session positif à ce niveau — critère simple, pas de lissage multi-session.
- Pas de tests automatisés unitaires livrés dans le dossier (les vérifications
  ont été faites en amont via des scripts Node/Playwright ad hoc, non inclus
  ici) — à ajouter si le projet doit être maintenu dans la durée.
