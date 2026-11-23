# RL Analysis v3 — Étape 1 : inventaire de l'existant

Source analysée : `index.html` à la racine du dépôt (5 418 lignes, 505 Ko), identique au fichier transmis.
`pro/index.html` est la même version (seul le nom d'appli iPad diffère : « RL Beta »).
`ancienne/index.html` (4 429 lignes) est l'interface d'avant l'habillage « Atelier ». Aucun de ces fichiers n'est modifié.

> **Captures** : je n'ai reçu qu'une seule image, une page WhoScored (Lens / Rennes), qui sert de référence pour l'onglet Stats.
> Les captures de ton interface actuelle ne me sont pas parvenues : l'inventaire ci-dessous est fait à partir du code.

---

## 1. Structure du fichier

| Zone | Lignes | Contenu |
|---|---|---|
| `<head>` + icône PNG en base64 | 1–10 | Méta iPad (appli plein écran, barre noire), titre « RL Analysis » |
| CSS | 11–1662 | ~1 650 lignes. **Six couches de style empilées** qui se surchargent (« Analyste », « minimal », « pupitre », « Pro », « Atelier », « Atelier beta »), beaucoup de `!important`. 5 polices embarquées en base64 (Open Sans 400/600/700, JetBrains Mono 500/700) |
| HTML | 1663–2053 | 4 vues + 5 boîtes de dialogue + toast |
| JavaScript | 2054–5418 | Un seul bloc, ~736 fonctions, 146 écouteurs. Le cœur (2054–5030) puis la couche « Atelier » (5030–5418) qui **remplace** plusieurs fonctions de rendu (`renderEvents`, `renderTimeline`, `renderLog`, `renderMatch`, `renderCurrent`, `addTag`, `showToast`) |

## 2. Écrans

### 2.1 Accueil (`#view-home` → `#home-menu`)
- Titre « RL Analysis », trois tuiles : **Nouveau match**, **Mes projets**, **Modifier le panel**.
- Jauge de stockage : local (« x Ko / 5 Mo ») ou en ligne (« x / 500 Mo ») si connecté ; ligne « Vidéos gardées sur cet appareil : n · taille ».
- Icône compte en haut à droite (connexion / synchro), pastille verte si connecté.

### 2.2 Nouveau match (`#home-new`)
- Champs : Domicile, Extérieur (obligatoires, 30 car.), Date (aujourd'hui par défaut), Compétition (40), Projet (liste, si au moins un projet existe).
- Zone « Vidéo du match » : choisir / changer / retirer. Sans vidéo → match **en direct avec chrono**.
- « Créer le match » → ouvre le match ; s'il y a une vidéo, elle est chargée et copiée sur l'appareil.

### 2.3 Mes projets (`#home-projects`)
- Barre : retour accueil, titre, état de synchro, menu « ⋯ » (Tout sauvegarder, Importer, Connexion / synchro).
- Onglets **Projets · n** / **Matchs · n** ; bouton « + Nouveau projet » ou « + Nouveau match » selon l'onglet.
- Projets : cartes (nom, nb matchs · nb tags, puces par adversaire, « Ouvrir », menu ⋯ Modifier / Supprimer) + carte « + Nouveau projet ».
- Formulaire projet : nom (40 car.) + cases à cocher des matchs. Ordre des matchs : date puis création.
- Matchs : ligne cliquable (équipes, date · compétition · nb tags, projet), menu ⋯ : Exporter (CSV), Libérer la vidéo (si gardée), Supprimer le match (annulable).
- Nom court d'un match dans un projet = l'adversaire (l'équipe commune à tous les matchs est retirée).

### 2.4 Match — Coding / Analysis (`#view-match`, habillage « Atelier »)
**Bandeau de menus** (fond clair) : Fichier · Édition · Affichage · Match · Codes · Clips · Outils · Aide, et « Version beta » à droite.

| Menu | Entrées |
|---|---|
| Fichier | Accueil, Mes projets, Nouveau match, Sauvegarder, Exporter… |
| Édition | Annuler, Supprimer le clip sélectionné |
| Affichage | Page Codage, Page Analyse, Masquer/Afficher les lignes sans tag, Plein écran vidéo |
| Match | Liste des matchs du projet (• = ouvert), Ajouter un match au projet, Mes projets |
| Codes | Modifier le panel, Afficher tous les codes |
| Clips | Lire, Finir le clip ici, Garder / Ne plus garder, Couper, Exporter le clip, Trier les clips du projet |
| Outils | Changer la vidéo, Capture d'image, Coup d'envoi ici, 2e mi-temps ici |
| Aide | 3 rappels de gestes (sans action) |

**Barre d'outils** : retour · Annuler · « Match » + sélecteur (équipes + projet) · sélecteur de page **Codage / Analyse** · Capture d'image · Trier · (espace) · Importer ▾ · **Exporter** (bouton clair) · Rapport · Sauvegarder.

**Page Codage** (`data-lay="code"`) : panel à gauche (largeur calculée pour que la vidéo remplisse son cadre, ≥ 300 px), vidéo à droite, barre de lecture dessous, bande « Dernier tag » (couleur, nom, temps, résultat, bouton **Supprimer**). Pas de timeline ni de colonne de droite.

**Page Analyse** (`data-lay="ana"`) : vidéo + barre de lecture, colonne de droite (250 px), **timeline** en bas sur toute la largeur. Pas de panel.

**Panneau « Panel »** : en-tête « Panel », sélecteur du panel actif ▾ (changer, nouveau, dupliquer, renommer, supprimer), segment Coder / Modifier. Grille de boutons (48 colonnes, lignes de 4 px + 2 px d'écart, agrandie d'un seul facteur pour remplir la hauteur ; lignes vides conservées). Bouton du clip sélectionné entouré de jaune, bouton « Début → Fin » en cours entouré de rouge. En bas : ligne de **résultats** du tag en cours (par défaut **Réussi / Raté**, sinon ceux du bouton), couleurs vert / rouge / jaune / gris, 44 px de haut.

**Lecteur** : en-tête (nom du fichier · résolution, capture, changer de vidéo, plein écran). Toucher l'image = lecture/pause. Si la vidéo n'est pas chargée : message + « Choisir la vidéo » (ou « Ouverture de la vidéo enregistrée… »). Pendant un changement de match, la dernière image est figée (pas de flash noir).

**Barre de lecture** : curseur avec **repères colorés des tags** · −20 s · −5 s · lecture/pause · +5 s · +20 s · temps vidéo `h:mm:ss / durée` · temps de match (mm:ss + période, masqué quand la vidéo est prête) · son/muet · vitesses ×1 / ×1,5 / ×2 · changer de vidéo.
Mode direct (sans vidéo) : Coup d'envoi · −10 s · +10 s · Pause/Reprendre · Mi-temps / Fin de période / Fin du match · Lancer la période suivante · Jouer la prolongation (4 périodes : 1re MT, 2e MT, Prol. 1, Prol. 2).

**Colonne de droite** (page Analyse) : « Filtre » (★ Gardés) · « Paramètres » (nb de tags) · 4 onglets en icônes :
1. **Zone et note du clip** : terrain 3 tiers × 5 couloirs (Défensif/Médian/Offensif × Aile G, Demi-espace G, Axe, Demi-espace D, Aile D), note libre (120 car.), « Changer d'équipe ».
2. **Codes** : une ligne par bouton (case de visibilité, nombre de clips, nom, couleur) ; dépliable → liste des clips (n°, temps, ★, résultat · note), toucher = lire.
3. **Derniers tags** : liste antéchronologique (temps cliquable = revoir, nom, zone / résultat / note, Supprimer).
4. **Bilan** : tableau N° · Événement · Tags · Résultats (compte par résultat).

**Timeline** (page Analyse) : barre d'outils (filtre, clip précédent / suivant, « Sélection : nom · début – fin · durée », ★, Lire / Couper / Supprimer / Exporter + pas ± avant/après, curseur de zoom 1–40×, px/s, zoom − / +). Colonne des noms (n° de tags · nom en blanc, sélection en bleu), une piste par bouton du panel, blocs colorés numérotés (nom affiché si assez large), tête de lecture jaune.
Gestes : toucher un bloc = le lire ; **double toucher** = mode édition (glisser pour déplacer, poignées gauche/droite pour rogner, Couper, Supprimer, Terminer) ; toucher la piste = se placer ; règle : **pincer / glisser / molette = zoom**, double toucher = zoom 1× ; double toucher un nom de ligne = renommer. Menu filtre : équipe (masqué), Masquer les lignes sans tag, Tout afficher. Premier passage : zoom automatique ≈ 6 px/s.

### 2.5 Modifier le panel (`#view-panel`)
- Panel à gauche (même largeur que la page Codage), outils et **inspecteur** à droite.
- Outils : Ajouter un bouton · Ajouter un titre · Disposition d'origine (annulable).
- Édition : toucher = sélectionner ; bouton sélectionné → glisser pour déplacer (accroche à la grille, se cale dans un trou trop étroit), coin bas-droit pour redimensionner ; double toucher = renommer sur place.
- Inspecteur : Texte (30 car.) · Couleur (Sans fond pour un titre, 8 couleurs, Autre…) · Motif (Uni, Lignes verticales, horizontales, Diagonales, Quadrillage, Cercles) · Bord (Par défaut, 8 couleurs, Autre) · Épaisseur 1/2/3/4/6/8 · Clip Avant / Après (0–60 s, défaut 5/5) · Résultats (4 max, séparés par des virgules) · Dupliquer · Supprimer. (Ligne Équipe présente dans le code mais masquée.)

### 2.6 Trier (`#view-sort`, depuis un projet)
- Gauche : « Par tag » → liste de tous les boutons du panel avec nb de clips (filtrés) → liste des clips groupés par match, ★ pour garder.
- Haut : segment « Tous les matchs » / un onglet par match (pastille = vidéo gardée).
- Lecteur + barre : clip précédent / lecture / suivant, « nom · match · temps · clip i / n », ☆ Garder.
- « ★ Sélection » = seulement les clips gardés. **Exporter le montage** (n clips · durée) : enregistrement temps réel 1280×720 en un seul fichier MP4/WebM.
- Vidéo manquante → « Choisis-la une fois, elle sera gardée ».

### 2.7 Boîtes de dialogue
- **Exporter** : séparateur « Excel en français (;) » / « Standard (,) », Enregistrer le CSV, Copier le CSV, Projet complet (.json).
- **Export vidéo** : progression clip par clip, Annuler.
- **Connexion** : e-mail, mot de passe, réglages avancés (adresse Supabase, clé publique), Désactiver sur cet appareil.
- **Toast** (7 s) avec « Annuler » pour les suppressions et changements de période.
- `#panel-overlay` « Boutons d'événements » : ancien éditeur par catégories, **plus accessible** dans l'interface (code mort).

## 3. Fonctions (liste de non-régression)

| # | Fonction | Où |
|---|---|---|
| F1 | Créer / supprimer (annulable) un match | Nouveau match, Mes projets |
| F2 | Projets : créer, modifier, supprimer, ouvrir le dernier match ouvert | Mes projets |
| F3 | Onglets de matchs du projet, passer d'un match à l'autre | Menu Match / sélecteur |
| F4 | Taguer sur vidéo (temps vidéo) ou en direct (chrono par période) | Panel |
| F5 | Bouton à durée fixe (avant/après) ; bouton Début → Fin (code présent, réglage masqué) | Panel |
| F6 | Résultat, zone (15 cases), note, changer d'équipe du tag | Panel, onglet Zone |
| F7 | Supprimer le dernier tag / un tag / le clip sélectionné (annulable) | Bande Dernier tag, listes, timeline |
| F8 | Annuler la dernière action | Barre d'outils, Édition |
| F9 | Lecture de clip, enchaînement, précédent / suivant | Timeline, Codes |
| F10 | Ajuster le clip : ±1 s avant/après, Fin ici, déplacer, rogner, couper en deux | Timeline |
| F11 | Garder (★) des clips, filtre « Gardés » | Timeline, Trier |
| F12 | Masquer des lignes (codes), masquer lignes vides | Codes, Affichage |
| F13 | Zoom timeline (gestes + curseur), tête de lecture suivie | Timeline |
| F14 | Coup d'envoi / 2e mi-temps sur la vidéo (recalcule les temps de match) | Outils |
| F15 | Vitesses, ±5/±20 s, muet, plein écran, capture PNG | Lecteur |
| F16 | Vidéo gardée sur l'appareil (stockage privé OPFS, copie en tâche de fond), libérer | Auto, Mes projets |
| F17 | Plusieurs panels (bibliothèque), éditeur libre de panel | Panel, Modifier le panel |
| F18 | Renommer une ligne / un bouton par double toucher | Timeline, éditeur |
| F19 | Bilan par code | Onglet Bilan / Rapport |
| F20 | Export CSV (une ligne par tag, `;` ou `,`, BOM UTF-8) | Exporter |
| F21 | Export projet .json d'un match ; Tout sauvegarder (.json) ; Importer | Exporter, Mes projets |
| F22 | Export vidéo d'un clip ; montage multi-matchs | Clips, Trier |
| F23 | Synchro en ligne facultative (Supabase), relecture toutes les 30 s | Connexion |
| F24 | Écran maintenu allumé, son de la vidéo mélangé à la musique (iPad) | Auto |
| F25 | Listes de lecture (créer, lire, exporter) | **Code présent mais plus accessible** (onglet masqué, boutons « + Liste » cachés) |

Colonnes CSV actuelles : `match, date, competition, periode, temps_match, secondes_match, temps_periode, temps_video, secondes_video, clip_debut, clip_fin, clip_duree_s, ligne, evenement, tiers, couloir, resultat, note`.

## 4. Raccourcis et gestes
- Clavier : **Échap** ferme les dialogues et le menu filtre ; **Entrée / Échap** valident / annulent un renommage ; **Entrée / Espace** ouvrent un match dans la liste. **Aucun raccourci de codage** (pas de touche pour lecture, tag, etc.).
- Gestes : ceux listés en 2.4 et 2.5 (toucher, double toucher, glisser, pincer, molette).

## 5. Thèmes, couleurs, typographie, langue
- **Langue** : français uniquement.
- **Thème** : sombre uniquement. Les variables d'un thème clair existent dans le CSS mais toutes les couches les écrasent avec les valeurs sombres ; **il n'y a pas de thème clair utilisable** aujourd'hui.
- Palette effective (Atelier) : fond `#252525`, panneaux `#333`, en-têtes `#3C3C3C`, filets `#141414`, texte `#E6E6E6`, secondaire `#A9A9A9`, bandeau de menus / bouton principal `#E9E9E9` sur `#111`, tête de lecture `#FFE100`, sélection de ligne `#1E9BF0`.
- Couleurs de boutons : Bleu `#24408A`, Rouge `#DC3C41`, Vert `#1F7A4D`, Jaune `#EAB308`, Orange `#E8730C`, Violet `#7C3AED`, Gris `#334155`, Blanc `#F1F5F9` (+ couleur libre). Résultats : `#2ECC71`, `#F4433C`, `#FFD23F`, `#555`.
- Polices : Open Sans (texte), JetBrains Mono (temps), police système en majuscules pour les boutons du panel.

## 6. Panel par défaut (noms de tags)
Titres « Offensive » (bleu) / « Défensive » (rouge), puis par groupe, un bouton Domicile (bleu) et un Extérieur (rouge) :

| Groupe | Bouton | Résultats |
|---|---|---|
| Construction | Sortie de balle courte | Réussie, Perdue |
| Construction | Sortie de balle longue | Réussie, Perdue |
| Pressing | Pressing | Récupération, Éliminé, Faute |
| Pressing | Récupération | Tir, Conservée, Reperdue |
| Transition | Perte de balle | Regagnée, Contre subi, Sans danger |
| Création | Entrée dernier tiers | Tir, Centre, Perdue |
| Création | Tir | But, Cadré, Non cadré |
| Arrêts de jeu | Coup de pied arrêté | But, Tir, Dégagé |
| — | À revoir (jaune, pleine largeur) | — |

Ton panel réel (et ta bibliothèque de panels) est dans tes données : il sera repris tel quel.

## 7. Données
**Stockage local** (`localStorage`, limite ≈ 5 Mo) :
- `carnet-de-tags.v1` : un objet `{ id → document }` contenant les matchs, les projets (`kind: "project"`), le panel actif (`id: "panel"`, `v: 4`) et la bibliothèque de panels (`id: "panelLib"`). Suppression = `{ id, deleted: true }`.
- `carnet-de-tags.prefs` (séparateur CSV, zoom), `carnet-de-tags.videos` (vidéos gardées), `carnet-de-tags.sync` (connexion), `rl-atelier.v1` (codes masqués, page Codage/Analyse).
- Vidéos : dossier `videos/` du stockage privé du navigateur (OPFS), un fichier par match.

**Match** : `id, home, away, date, comp, createdAt, updatedAt, period, phase (pre|live|break|done), clock {running, startedAt, acc}, mode ("video"), video {name, pos, k1, k2}, tags[], lists[], last`.
**Tag** : `id, p (période), t (s dans la période), v (s vidéo), team (home|away), ev, lbl, btn (id du bouton), col, d0 (avant), d1 (après), third, lane, res, note, open`.
**Bouton** : `id, type (button|label), key, label, team, color, pat, bd, bw, pre, post, res[], c, r, w, h` (grille 48 colonnes).
**Projet** : `id, kind, name, matchIds[], stars {"matchId:tagId": true}, last, createdAt`.

**Fichiers d'échange** : `{ app: "carnet-de-tags", v: 1, all: {…} }` (Tout sauvegarder) et `{ app, v, match, panel }` (projet d'un match).

## 8. Points à corriger repérés (à garder en tête pour v3)
1. **Import « Tout sauvegarder » avec pertes** : seuls les matchs et le panel actif sont restaurés. **Les projets, les clips gardés (★) et la bibliothèque de panels sont ignorés** ; `createdAt` des matchs est remis à la date d'import. La v3 corrigera ça (exigence « sans perte »).
2. **Limite de 5 Mo** du stockage local (passage à IndexedDB prévu).
3. CSS en six couches contradictoires → c'est la cause des difficultés de mise en page ; repartir d'un seul thème.
4. Fonctions qui en remplacent d'autres (couche Atelier) → effets de bord difficiles à suivre.
5. Code mort : ancien éditeur de catégories, listes de lecture, bascule d'équipe, ligne Équipe de l'inspecteur, barre d'icônes du bas, intégration `window.claude` (inactive hors claude.ai).
6. Menu « Aide » sans action ; mention « Version beta ».
7. La synchro en ligne utilise une base Supabase avec une clé publique écrite dans le code (pas un secret, mais c'est un serveur et un compte).

## 9. Questions à trancher avant l'étape 2
1. **Synchro Supabase** : la Partie C demande « sans serveur, sans compte ». Je la **retire** (et la remplace par export / import + dossier Google Drive) ou je la **garde en option** ?
2. **Thème clair** : il n'existe pas aujourd'hui. Je le **crée** (bascule sombre / clair) ou on reste sombre seulement ?
3. **Raccourcis** : il n'y en a presque pas. J'en **ajoute** un jeu au clavier (lecture, ±5 s, accepter/rejeter une suggestion, chiffres = résultats…) ou je reste strictement identique ?
4. **Listes de lecture** (F25) : les réactiver ou les supprimer ?
5. **Équipe des tags** : chaque tag porte Domicile / Extérieur via son bouton, mais l'équipe ne se règle plus dans l'interface. Pour les stats « For / Against » et « Home / Away », il faut savoir **quelle est ton équipe** dans chaque match. Je propose : un champ « Mon équipe » sur le projet (ex. Rennes) + l'équipe réglable sur chaque bouton. D'accord ?
6. **Tes données réelles** : envoie-moi ton fichier « Tout sauvegarder » (6 matchs, 488 tags) pour que je teste l'import sans perte. Rien ne sera publié.
7. **Captures de l'interface actuelle** : peux-tu les renvoyer ? Elles me serviront pour l'avant / après.
