# RL Analysis : audit avant la version 2 (étape 0)

Code audité : `index.html` (5 418 lignes : HTML, CSS et JS dans un seul fichier, sans dépendance ni étape de build).
`pro/index.html` est une copie à 1 octet près (titre « RL Beta »). `ancienne/index.html` est l'interface précédente, gardée à part.

Technologie : HTML + CSS + JavaScript « vanilla » (ES5, une seule IIFE), pensé pour iPad/Safari en premier.
Stockage : `localStorage` (matchs, panel, préférences), OPFS (`navigator.storage.getDirectory`) pour garder les vidéos sur l'appareil, et une synchro Supabase facultative (données de codage uniquement, jamais la vidéo).

---

## 1. Inventaire des fonctionnalités

| # | Domaine | Fonctionnalité | Comportement actuel | Emplacement (`index.html`) |
|---|---|---|---|---|
| 1 | Accueil | Menu d'accueil | 3 entrées : Nouveau match, Mes projets, Modifier le panel ; jauge de stockage local ou en ligne | HTML 1665-1693, `renderHome` 2873, `renderStore` 2852 |
| 2 | Match | Création de match | Domicile, Extérieur, date, compétition, projet, vidéo facultative (sans vidéo : mode direct avec chrono) | HTML 1695-1720, submit 3680 |
| 3 | Match | Liste des matchs | Tri par date de création, menu ⋯ : exporter le CSV, libérer la vidéo, supprimer (avec annulation) | `renderHome` 2873, 3705-3714 |
| 4 | Projets | Projets multi-matchs | Un projet regroupe des matchs (ex. tous les matchs de Metz) ; créer, modifier, supprimer | `projects` 3742, `openPjForm` 3775, 3796-3830 |
| 5 | Projets | Onglets par match | Barre d'onglets en haut du match, libellé = adversaire (l'équipe commune aux matchs est retirée), + pour ajouter, ⇅ Trier | `renderPTabs` 3842, `pjLabel` 3750 |
| 6 | Direct | Chrono de match | Coup d'envoi, pause, reprise, −10 s / +10 s, mi-temps, 2e MT, prolongations 1 et 2, fin | `clockAction` 2453, `renderClockBar` 2962 |
| 7 | Vidéo | Lecteur vidéo local | Fichier choisi sur l'appareil (`URL.createObjectURL`), rien n'est envoyé | `loadVideoFile` 2572 |
| 8 | Vidéo | Vidéo gardée sur l'appareil | Copie dans le stockage privé du navigateur (OPFS, Worker), rechargée seule à la réouverture, avec jauge et « Libérer la vidéo » | `vsSave` 2530, `vsTryLoad` 2561 |
| 9 | Vidéo | Commandes | Lecture/pause (bouton + tap sur l'image), −20/−5/+5/+20 s, muet, changer de vidéo | `videoAction` 2743, `renderClockBar` 2962 |
| 10 | Vidéo | Vitesses | ×1, ×1,5, ×2 (boutons) ; ×0,5 dans le cycle `rate` | `RATES` 2614, 2756-2761 |
| 11 | Vidéo | Repères de mi-temps | Coup d'envoi (k1) et début de 2e MT (k2) dans la vidéo ; les temps de match de tous les tags sont recalculés | `videoAction` k1/k2 2765, `derive` 2488 |
| 12 | Vidéo | Reprise de lecture | Position sauvegardée toutes les 10 s et à la pause, restaurée à la réouverture | `savePos` 2594 |
| 13 | Vidéo | Barre de lecture avec repères | Curseur de lecture avec un repère par tag | `atSeek` 5232-5242 |
| 14 | Vidéo | Capture d'image | Export PNG de l'image affichée | `atCapture` 5065 |
| 15 | Vidéo | Plein écran, écran toujours allumé | Plein écran de la vidéo ; Wake Lock pendant le codage | `atFull` 5069, `requestWake` 3530 |
| 16 | Codage | Panel de codage libre | Grille de 48 colonnes, boutons et titres placés et dimensionnés librement ; par défaut 2 colonnes (titres « Offensive » / « Défensive ») | `defaultLayout` 2172, `renderEvents` 3017 |
| 17 | Codage | Un toucher = un tag | Le tag prend le temps vidéo (ou le temps du chrono), l'équipe du bouton, la couleur, les secondes avant/après du bouton | `addTag` 2779 |
| 18 | Codage | Durée avant/après par bouton | Réglable par bouton (0-60 s, 5 s par défaut), puis par tag (−/+, « Fin ici ») | `pp-clip` 4763, `clip-row` 4440 |
| 19 | Codage | Résultat, zone, note | Résultats propres au bouton (4 max), sinon « Réussi / Raté » ; zone du terrain 3 tiers × 5 couloirs ; note libre de 120 caractères ; changer d'équipe | `renderCurrent` 3127, `atResRow` 5378, 4205-4232 |
| 20 | Codage | Dernier tag | Bandeau « Dernier tag » + bouton Supprimer | `atLast` 5165 |
| 21 | Codage | Compteur sur les boutons | Nombre de tags affiché sur chaque bouton du panel | `atRefresh` 5315 |
| 22 | Panel | Éditeur de panel | Ajouter un bouton ou un titre, déplacer et redimensionner (glisser), renommer (double toucher), couleur (8 + personnalisée), motif (6), bord (couleur, épaisseur 1 à 4), résultats, dupliquer, supprimer, disposition d'origine | `openPanelEditor` 3489, 4612-4810 |
| 23 | Panel | Plusieurs panels (modèles) | Bibliothèque de panels : changer, nouveau, dupliquer, renommer, supprimer | `atLib` 5170, `atSwitchPanel` 5182, `atNewPanel` 5189 |
| 24 | Timeline | Timeline par catégorie | Une piste par bouton (couleur, numéro, nom, compteur), blocs = clips numérotés, tête de lecture | `renderTimeline` 3374, version modifiée 5346 |
| 25 | Timeline | Zoom | Pincer, glisser sur la règle, molette, double toucher (remise à 1), curseur, boutons ± ; px/s affichés ; zoom de travail auto (~6 px/s) | `zoomAt` 3347, 4368-4415, 5290-5296 |
| 26 | Timeline | Filtres | Par équipe, masquer les lignes vides, masquer une catégorie (case), « Gardés seulement » | `tlFilter` 3329, 4416-4428, `at.hidden` |
| 27 | Timeline | Édition de séquence | 1 toucher = lire le clip ; 2 touchers = mode édition : déplacer, poignées début/fin, couper, supprimer | 4334-4366, `setClip` 4271, `splitTag` 4277 |
| 28 | Timeline | Clip précédent / suivant | Saute au tag précédent ou suivant | `atJump` 5084 |
| 29 | Navigation | Liste des codes | Catégories dépliables avec leurs clips, numérotés, avec résultat et note | `atRenderCodes` 5255 |
| 30 | Navigation | Derniers tags | Liste chronologique inverse : revoir, + Liste, supprimer | `renderLog` 3191 |
| 31 | Navigation | Par tag | Catégories puis clips | `renderCats` 3227 |
| 32 | Playlists | Listes de lecture | Créer, renommer, supprimer, lire à la suite, exporter en vidéo | `renderLists` 3278, 4452-4475 |
| 33 | Analyse | Bilan | Tableau par catégorie : nombre de tags, répartition des résultats | `renderSummary` 3430 |
| 34 | Analyse | Page « Trier » (multi-matchs) | Clips d'un projet par tag, tous les matchs ou un seul, étoiles « Garder », lecteur, clip préc./suiv. | `openSort` 3892, `renderSort` 3915 |
| 35 | Export | CSV | Une ligne par tag, séparateur `;` (Excel FR) ou `,`, BOM UTF-8, protection contre l'injection de formules ; enregistrer ou copier | `buildCsv` 3584, `openExport` 3610 |
| 36 | Export | JSON d'un match | Match + panel (`carnet-de-tags`, v1) | `export-project` 4518 |
| 37 | Export | Sauvegarde complète | Tous les matchs et le panel dans un seul JSON | `btn-backup` 4901 |
| 38 | Export | Vidéo (clip, liste, montage) | Enregistrement en temps réel (canvas + MediaRecorder), MP4 ou WebM | `exportClips` 2654, `svExport` 4026 |
| 39 | Import | Import JSON | Un match ou une sauvegarde complète, validé et nettoyé (5 000 tags max) | 4529-4590, `importMatch` 4554 |
| 40 | Données | Migration du panel | Anciens formats v1 à v3 (12 → 24 → 48 colonnes, en-têtes ajoutés, anciens motifs renommés) | `layout` 2212, `normLayout` 2185 |
| 41 | Données | Sauvegarde auto locale | À chaque modification (`touch` → `saveLocal`) ; bouton Sauvegarder | `touch` 2320, `btn-save` 4503 |
| 42 | Données | Synchro en ligne facultative | Supabase (e-mail + mot de passe), « dernier modifié gagne », reprise auto en cas d'erreur, envoi groupé toutes les 1,5 s | 4910-5030, `flush` 2354, `pull` 2388 |
| 43 | Édition | Annuler | Toast « Annuler » (7 s) pour les suppressions ; bouton Annuler sur un seul niveau | `undo` 2445, `atDoUndo` 5059 |
| 44 | Interface | Deux mises en page | Page Codage (vidéo + panel) et page Analyse (timeline plus grande) | `atSetLay`, `atFit` 5096 |
| 45 | Interface | Menus et barre d'outils | Fichier, Édition, Affichage, Match, Codes, Clips, Outils, Aide ; barre d'icônes | 5110-5160, 5300-5312 |
| 46 | Interface | Confort iPad | Pas de menu Copier à l'appui long, audio en mode « ambiant », PWA plein écran, image figée lors du changement de match | CSS 1052, 4870, `snapFrame` 3497 |

---

## 2. Écarts avec la liste « à conserver »

| Ce que tu as listé | Ce que dit le code | Conséquence pour la v2 |
|---|---|---|
| Raccourcis clavier (pavé numérique) affichés sous chaque bouton | **Absents du code.** Aucun gestionnaire de touches hormis Entrée et Échap. Le commentaire CSS « raccourci discret » (l. 1156) ne correspond à aucun code. | À **ajouter** (et non à conserver) : touches 0-9 du pavé, + / − / * / ., personnalisables, affichées sous chaque bouton. Une autre version les avait-elle ? |
| Interface en anglais | **Tout est en français** (libellés, messages, menus, export CSV). | Passer l'interface en anglais. Je propose un fichier de textes séparé, pour pouvoir garder le français en option. |
| Tags Goal kick, Build-up, Open play, transitions, pressing, blocs, Goal, corners… | **Pas dans le code.** Le panel par défaut est en français et générique (Sortie de balle, Pressing, Tir, CPA…). Ces tags sont donc dans **ton panel enregistré** (stockage du navigateur ou en ligne), pas dans le programme. | Ils seront repris par la migration de tes données. J'ajouterai aussi un **modèle de panel « RL Football »** avec ces tags, en 2 colonnes Avec ballon / Sans ballon. |
| Colonne gauche « avec ballon », droite « sans ballon » | Par défaut, titres « Offensive » / « Défensive », gauche = équipe à domicile, droite = équipe à l'extérieur. Ta disposition actuelle vient de ton panel enregistré. | La disposition de ton panel sera conservée telle quelle. |
| Règles de codage (hauteur de la 1re ligne défensive ; pressing = aller au contact) | Pas présentes dans l'outil. | À afficher en aide-mémoire (info-bulle sur les boutons Bloc et Pressing, et dans l'Aide). |
| Score | La fonction `goals()` existe mais n'est jamais appelée : le score affiché est toujours « – » (l. 3459). | Score calculé à partir des tags Goal / Goal conceded. Il servira aussi au filtre Mène / Égalité / Mené. |

Fonctionnalités que tu n'avais pas listées et que je conserve : 2-4, 6, 8, 11-15, 19-23, 25-28, 32, 34, 36-40, 42, 44, 46.

---

## 3. Problèmes relevés

### 3.1 Performances (sur un match complet de 500 tags et plus)

| Gravité | Problème | Où |
|---|---|---|
| **Critique** | Chaque modification réécrit **tout** le stockage (tous les matchs, tous les projets) en un seul `JSON.stringify`, de façon synchrone : à chaque tag, à chaque frappe dans une note, toutes les 10 s pendant la lecture. Le coût augmente avec le nombre de matchs enregistrés. | `saveLocal` 2317, `touch` 2320, note 4213, `savePos` 2594 |
| **Critique** | `localStorage` est limité à environ 5 Mo et **l'erreur de dépassement est ignorée** (`catch (e) {}`) : passé la limite, le codage n'est plus enregistré, sans aucun message. C'est un **risque réel de perte de codage**. | `saveLocal` 2317 |
| Élevée | Chaque tag reconstruit tout l'écran : le panel, la timeline (tous les blocs), la liste des tags, les catégories, les listes, le bilan et les codes. | `renderMatch` 3454 |
| Élevée | Calculs en O(n²) : `tagButton`/`tagLabel` retrient tous les boutons pour chaque tag, et la timeline modifiée appelle `findTag` (parcours de tout le match) pour chaque bloc. Avec 500 tags, cela fait des centaines de milliers d'opérations à chaque rendu. | 2264, 2274, 5346-5370 |
| Élevée | `addTag` est enveloppé pour faire une copie JSON complète du match à **chaque** tag (pour l'Annuler). | 5404 |
| Moyenne | Rendu appelé 4 fois par seconde (`setInterval` 250 ms) même vidéo en pause, avec des mesures de mise en page (`getBoundingClientRect`) qui forcent le navigateur à recalculer l'affichage. | 4881, `tlReveal` 3339 |
| Moyenne | Tous les blocs de la timeline existent en permanence (aucune virtualisation), chacun avec ses styles en ligne. | `renderTimeline` |
| Moyenne | Environ 130 Ko de polices en base64 dans le CSS, et environ 330 `!important` (une interface redessinée par-dessus l'ancienne). | CSS 1056-1060 |

### 3.2 Bugs et comportements fragiles

| Gravité | Problème | Où |
|---|---|---|
| Élevée | Perte silencieuse des données quand le stockage est plein (voir plus haut). | 2317 |
| Élevée | Les boutons « Début → Fin » sont du code mort : `normLayout` force `it.dur = ""`, donc `toggleTag` n'est jamais appelé. | 2195, 2802 |
| Moyenne | Renommer un bouton du panel renomme **rétroactivement** les tags de tous les matchs (le libellé affiché vient du bouton actuel, pas du tag). Si un bouton est supprimé, ses tags passent sur une ligne « orpheline ». Cela fausse la comparaison entre matchs. | `tagLabel` 2265, `tlRows` 2282 |
| Moyenne | Annuler ne revient en arrière que d'**un seul** niveau, et il y a deux systèmes concurrents (le toast et `atUndo`). Il n'y a pas de Rétablir. | 2445, 5059 |
| Moyenne | En direct, les arrêts de jeu de la 1re mi-temps (45+2) et le début de la 2e (45:00) se chevauchent, car la 2e mi-temps commence toujours à 45:00. En mode vidéo, il n'y a pas de repère pour les prolongations. | `matchTime` 2296, `derive` 2488 |
| Moyenne | La synchro ne lit que 500 documents (`limit(500)`) et le « dernier modifié gagne » porte sur un match entier : coder le même match sur deux appareils fait perdre des tags. | `pull` 2388 |
| Faible | Plusieurs écouteurs sont branchés sur le même bouton (`rec-cancel` ×2, `btn-back` ×2, `go-projects` ×2). | 4085/4476, 3733/5022 |
| Faible | Fonctions d'affichage remplacées plusieurs fois après coup (`renderEvents` ×3, `renderLog`, `renderTimeline`, `renderMatch`, `renderCurrent`, `addTag`, `showToast`) : l'ordre d'exécution est difficile à suivre. | 5205, 5346-5412 |
| Faible | Le nom « Raphaël L. » est écrit en dur dans la barre du bas. | 5309 |
| Faible | Ancien éditeur de panel (`panel-overlay`, `panelDraft`) encore présent mais inaccessible. | HTML 2036, 4590-4630 |

### 3.3 Code dupliqué et maintenance

- `index.html` et `pro/index.html` sont identiques : chaque correction doit être faite deux fois.
- Deux moteurs d'export vidéo presque identiques (`exportClips`/`recNext` et `svRecStart`/`svRecNext`), et deux lecteurs (match et Trier).
- Trois façons de suivre l'état de suppression (toast, `snapshot`, `atUndo`).
- Le formatage des noms de fichier (`clean`) est écrit deux fois. Les messages d'erreur d'enregistrement sont recopiés à 5 endroits.
- Pas de séparation entre données, logique et affichage : tout est dans une seule fonction de plus de 3 300 lignes.

### 3.4 Interface

- Hiérarchie visuelle chargée : menus, barre d'outils, barre d'icônes, onglets et en-têtes de panneaux disent souvent la même chose (Exporter et Sauvegarder apparaissent 3 fois).
- Icônes hétérogènes : SVG à épaisseurs différentes, emoji (★ ☆ ⋯ ⇅) et caractères mélangés.
- `window.prompt` et `window.confirm` pour les panels (bloquants, peu soignés sur iPad).
- Pas de clavier (voir plus haut), ce qui est un vrai frein pour un codage rapide en direct.
- Pas de rapport imprimable, pas de filtres par mi-temps ou par score, pas de comparaison chiffrée entre matchs (Trier ne fait que lire les clips).

---

## 4. Pistes pour la phase 2 (architecture, à valider)

1. **Même technologie** (HTML/CSS/JS sans framework ni build), découpée en **modules ES** (`src/store.js`, `src/model.js`, `src/timeline.js`…). Seule contrainte : servir le dossier en HTTP (GitHub Pages comme aujourd'hui, ou `npx serve` en local), car l'ouverture directe du fichier ne charge pas les modules. Option : générer aussi un `index.html` autonome en un seul fichier.
2. **Stockage : IndexedDB** au lieu de `localStorage` (justification : plus de limite à 5 Mo, écriture **par match** et non de tout, pas de blocage de l'écran). Migration automatique des clés `carnet-de-tags.*` au premier lancement, en conservant l'original.
3. **Format de fichier v2** avec un numéro de version et des fonctions de migration en chaîne (v1 → v2). Les anciens JSON restent importables.
4. **Rendu incrémental** : index tag → bouton en mémoire, ajout d'un tag = un bloc ajouté (pas de reconstruction), timeline découpée en pistes dont seuls les blocs visibles sont dessinés, et une seule boucle `requestAnimationFrame` pendant la lecture.
5. **Annuler / Rétablir** par commandes (historique de 100 actions), qui remplace les trois systèmes actuels.
