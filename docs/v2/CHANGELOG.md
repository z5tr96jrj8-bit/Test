# Changelog

## 2.0.0-phase3 : v2 à fonctions égales (2026-11-23)

Nouvelle version **à part**, dans `v2/`. La v1 (racine du site) n'est pas modifiée.

### Conservé (fonctions de la v1, refaites sur la nouvelle base)
- Accueil, nouveau match (vidéo ou direct), liste des matchs, projets multi-matchs avec onglets par adversaire.
- Chrono du direct : coup d'envoi, pause, ±10 s, mi-temps, prolongations.
- Lecteur local : sauts −20/−5/+5/+20 s, vitesses ×0,5 ×1 ×1,5 ×2, son, toucher l'image = lecture/pause, plein écran, capture d'image, reprise à la dernière position, écran gardé allumé.
- Vidéos gardées sur l'appareil (même dossier que la v1, donc pas de double copie).
- Repères coup d'envoi / 2e mi-temps, barre de lecture avec un repère par tag.
- Panel libre en grille de 48 colonnes : couleurs, motifs, bords, résultats, secondes avant/après par bouton, compteurs ; plusieurs panels (nouveau, dupliquer, renommer, supprimer) ; disposition d'origine ; double toucher pour renommer.
- Détails du tag : résultat, zone (3 × 5), note, changement de phase, durée du clip (−/+, « Fin ici »).
- Timeline par catégorie : zoom (pincer, molette, curseur, double toucher), filtres, masquer des lignes, édition (déplacer, recadrer, couper, supprimer), tag précédent/suivant.
- Codes, derniers tags, listes de lecture, bilan ; pages Codage et Analyse.
- Page Trier (multi-matchs, étoiles), export vidéo d'un clip, d'une liste ou d'un montage.
- Export CSV (`;` ou `,`, protégé contre les formules), JSON d'un match, sauvegarde complète, import.

### Amélioré
- **Stockage IndexedDB** au lieu de `localStorage` : plus de limite d'environ 5 Mo, un seul match réécrit à chaque modification, **erreur d'enregistrement affichée** (en v1, elle était ignorée). Copies de secours automatiques (5 par match) et rappel hebdomadaire de sauvegarde complète.
- **Rapidité** : avec 1 500 tags, un toucher de bouton prend environ 3 ms contre 50 ms en v1 (mesuré sur la même machine). Seule la partie modifiée est redessinée, et le zoom de la timeline ne redessine aucun bloc.
- **Annuler / Rétablir** sur 100 actions, au lieu d'une seule action et de deux systèmes concurrents.
- **Les tags gardent leur nom** : changer de panel ou supprimer un bouton ne renomme plus les anciens tags.
- **Score réel** calculé à partir des boutons au rôle « But (pour) » / « But (contre) » (en v1, il restait affiché « – »).
- **Avec ballon / Sans ballon** au lieu de domicile / extérieur pour les colonnes du panel.
- Interface sobre et homogène : un seul jeu d'icônes, fenêtres intégrées à la place de `prompt` / `confirm`, commandes non dupliquées.
- Code découpé en 20 modules commentés (le monolithe v1 faisait 5 400 lignes).

### Ajouté
- Interface en **anglais**, avec le français en option.
- **Mode hors ligne** (application installable sur l'écran d'accueil de l'iPad).
- **Migration automatique** des sauvegardes v1, avec un rapport : panel choisi, liens orphelins nettoyés, matchs sans repères de mi-temps signalés.
- Mise en page portrait pour iPad.
- Modèle de panel **RL Football** (Goal kick, Build-up, Open play, transitions, pressing, blocs haut/médian/bas, buts, occasions, corners, coups francs, Rest defense).

### Pas encore repris
- **Synchronisation en ligne** : laissée de côté, à votre demande, pour une version à part plus simple.
- Image figée pendant le changement de match (confort visuel uniquement).
- La bande « Dernier tag » est conservée, mais la barre de menus « Fichier / Édition / … » de la v1 est remplacée par les menus ⋯.

## Phase 4 (à venir)
Raccourcis clavier (pavé et chiffres), filtres par mi-temps / équipe / score, marqueurs d'événements (but, rouge, changement, système), joueur par séquence, comparaison chiffrée de plusieurs matchs, rapport d'une page, export JSON des données, playlists par catégorie.
