# RL Analysis v3 — Étape 3 : reconstruction à fonctions identiques

L'appli est reconstruite sur une base propre, avec les mêmes écrans, la même disposition (pages Codage et Analyse), les mêmes noms de tags et couleurs. La nouvelle mise en forme validée à l'étape 2 arrive à l'étape 4.

## Ce qui change sous le capot
| Avant | Maintenant |
|---|---|
| 1 fichier de 5 418 lignes, 6 couches de styles empilées | 18 modules JavaScript (`app/js/`), 1 thème (`app/css/theme.css`) + 1 feuille de style (`app/css/app.css`) |
| Stockage limité à ~5 Mo (localStorage) | IndexedDB (plusieurs centaines de Mo), écriture automatique toutes les 150 ms |
| « Annuler » seulement pour quelques actions | **Annuler / Rétablir** pour toutes les actions (tags, résultats, notes, zones, clips, panel, projets, imports) |
| Pas de raccourci clavier | **Raccourcis modifiables** (Réglages), inactifs pendant la saisie |
| Import « Tout sauvegarder » avec pertes | **Import complet** avec rapport avant validation |
| Synchro en ligne active si connecté | Synchro **désactivée par défaut**, activable dans Réglages |
| Listes de lecture inaccessibles | **Listes réactivées** (onglet de la colonne de droite + « + Liste ») |
| Équipe des boutons figée | **Équipe réglable** dans l'inspecteur ; **« Mon équipe »** sur chaque projet |

## Tes données (fichier « Tout sauvegarder » du 23/11)
- Contenu reconnu : **12 matchs (dont 6 sans tag), 488 tags, 3 projets, 2 panels**.
- 13 éléments supprimés dans l'ancienne appli sont ignorés ; 4 références du projet « San Antonio FC » vers des matchs supprimés sont retirées.
- « Mon équipe » déduite pour 2 projets (Rennes, San Antonio). Pour « RC Lens », les noms varient (« RC Lens » / « Lens ») : à renseigner dans le projet.
- **Export CSV identique à l'octet près** à celui de l'ancienne appli sur les 6 matchs tagués.
- Ton fichier n'est pas enregistré dans le dépôt.

## Tests
- `npm test` (sans navigateur) : 11 tests — import sans perte, CSV identique à l'ancienne appli (données fictives `tests/fixtures/`), panel, temps de match, annuler / rétablir, raccourcis AZERTY, fichier unique complet.
- `node tests/e2e.mjs` (navigateur) : accueil, import, ouverture d'un projet, vidéo, codage au clavier, saisie sans déclencher de raccourci, annuler / rétablir, persistance après rechargement, fluidité, aucune erreur JavaScript.
- Mesures (machine de test, sans carte graphique) avec **2 000 tags** dans un match : ajout d'un tag ≈ 40 ms en page Codage, ≈ 90 ms en page Analyse (timeline entière redessinée). À mesurer sur ton iPad.

## Checklist de non-régression
| # | Fonction | État |
|---|---|---|
| F1 | Créer / supprimer un match (annulable) | ✅ |
| F2 | Projets : créer, modifier, supprimer, rouvrir le dernier match | ✅ + « Mon équipe » |
| F3 | Passer d'un match à l'autre (menu Match, sélecteur) | ✅ |
| F4 | Taguer sur vidéo ou en direct (chrono par période) | ✅ |
| F5 | Durée fixe avant / après ; Début → Fin | ✅ durée fixe ; Début → Fin : code repris, réglage toujours masqué (comme avant) |
| F6 | Résultat, zone, note, changer d'équipe | ✅ |
| F7 | Supprimer dernier tag / un tag / clip sélectionné | ✅ |
| F8 | Annuler | ✅ + Rétablir |
| F9 | Lire un clip, précédent / suivant | ✅ |
| F10 | Ajuster, déplacer, rogner, couper un clip | ✅ |
| F11 | Garder (★), filtre Gardés | ✅ |
| F12 | Masquer des codes, masquer lignes vides | ✅ |
| F13 | Zoom de la timeline (gestes, curseur) | ✅ |
| F14 | Coup d'envoi / 2e mi-temps sur la vidéo | ✅ |
| F15 | Vitesses, ±5/±20 s, muet, plein écran, capture | ✅ |
| F16 | Vidéo gardée sur l'appareil, libérer | ✅ (mêmes fichiers que l'ancienne appli si même adresse) |
| F17 | Plusieurs panels, éditeur de panel | ✅ |
| F18 | Renommer par double toucher | ✅ |
| F19 | Bilan par code, bouton « Rapport » | ✅ (gardé jusqu'à l'onglet Stats) |
| F20 | Export CSV `;` ou `,` | ✅ identique |
| F21 | Export projet .json, Tout sauvegarder, Importer | ✅ format v3 (relit aussi l'ancien) |
| F22 | Export vidéo d'un clip, montage multi-matchs | ✅ (non testable ici : à vérifier sur ton iPad) |
| F23 | Synchro en ligne | ✅ désactivée par défaut |
| F24 | Écran allumé, son mélangé | ✅ |
| F25 | Listes de lecture | ✅ réactivées |

Retiré : le bouton « Sauvegarder » de la barre d'outils (sauvegarde automatique ; l'entrée reste dans Fichier). Le menu Aide renvoie aussi vers les raccourcis.

## Différences à connaître
- Les données sont rangées **par navigateur et par adresse**. La v3 ouverte depuis un fichier, puis depuis Netlify, ce sont deux espaces séparés : on passe de l'un à l'autre avec « Tout sauvegarder » → « Importer ». Si la v3 remplace un jour l'appli à la même adresse que l'ancienne, elle reprend toute seule les données et les vidéos gardées.
- Le format de « Tout sauvegarder » v3 est `{ app: "rl-analysis", v: 3, docs }`. La v3 relit les anciens fichiers ; l'ancienne appli ne lit pas les nouveaux.

## Lancer la v3
- **Sur ordinateur** : télécharger `v3/dist/RL-Analysis.html` et l'ouvrir dans Chrome, Edge ou Safari.
- **Pour développer** : `cd v3/app && python3 -m http.server`, puis ouvrir http://localhost:8000. Après une modification : `node tools/build.mjs` refait le fichier unique.
- **iPad (appli installée, hors ligne) et Netlify / Cloudflare** : étape 5.
