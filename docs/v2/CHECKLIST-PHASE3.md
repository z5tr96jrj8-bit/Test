# Checklist de non-régression : phase 3 (v2 à fonctions égales)

À faire **sur votre iPad**, puis sur ordinateur. Cochez au fur et à mesure.
Déjà vérifié automatiquement dans Chromium : les points marqués ✅.

## 1. Démarrage et données
- [ ] La v2 s'ouvre à l'adresse `…/v2/`. La v1 s'ouvre toujours normalement à la racine.
- [ ] ✅ Importer votre sauvegarde v1 : 12 matchs, 488 tags, 3 projets, 2 panels, panel actif « Mon panel ».
- [ ] ✅ Après rechargement de la page, tout est toujours là.
- [ ] Ajouter l'app à l'écran d'accueil, la fermer, couper le réseau, la rouvrir : elle s'ouvre.

## 2. Codage vidéo
- [ ] ✅ Ouvrir un match, choisir la vidéo. Message « Vidéo gardée sur cet appareil ».
- [ ] ✅ Revenir à l'accueil, rouvrir le match : la vidéo se recharge seule.
- [ ] Lecture/pause (bouton et toucher sur l'image), −20/−5/+5/+20 s, ×0,5 ×1 ×1,5 ×2, son.
- [ ] ✅ Un toucher sur un bouton crée un tag au temps de la vidéo, avec les secondes avant/après du bouton.
- [ ] ✅ Le compteur du bouton et celui de la ligne augmentent. La bande « Dernier tag » se met à jour.
- [ ] ✅ Résultat, zone, note, « Passer en Sans ballon », −/+ avant/après, « Fin ici ».
- [ ] Menu ⋯ → Coup d'envoi ici / 2e mi-temps ici : le temps de match affiché change.
- [ ] Capture d'image, plein écran.
- [ ] Le score en haut correspond aux tags GOAL / GOAL CONCEDED.

## 3. Direct (sans vidéo)
- [ ] ✅ Nouveau match sans vidéo → Coup d'envoi → le chrono tourne, les tags prennent le temps du chrono.
- [ ] Pause, reprise, ±10 s, mi-temps, 2e mi-temps, fin du match, prolongation.

## 4. Timeline
- [ ] ✅ Un toucher sur un clip le lit. Deux touchers : bords jaunes, on peut déplacer ou recadrer.
- [ ] ✅ Couper un clip, supprimer un clip.
- [ ] Zoom : pincer ou glisser sur la règle, curseur, boutons ± ; double toucher sur la règle = retour à 1.
- [ ] Filtre : avec ballon / sans ballon, masquer les lignes vides, clips gardés.
- [ ] Double toucher sur le nom d'une ligne : renommer.
- [ ] Tag précédent / suivant.

## 5. Annuler / rétablir
- [ ] ✅ Annuler deux fois, puis rétablir une fois : le bon nombre de tags.
- [ ] Annuler une suppression de match ou de projet (bouton « Annuler » du message).

## 6. Analyse
- [ ] ✅ Page Analyse : Codes (déplier une ligne, masquer une ligne), Détails, Derniers tags, Listes, Bilan.
- [ ] ✅ Créer une liste, y ajouter un tag, la lire, l'exporter en vidéo.
- [ ] ✅ Page Trier : tags du projet, un match ou tous, lecture, clip précédent/suivant, étoile.
- [ ] Exporter le montage d'un tag dans la page Trier.

## 7. Panel
- [ ] ✅ Modifier le panel : ajouter un bouton, annuler.
- [ ] Déplacer un bouton (au doigt : le sélectionner d'abord), le redimensionner par le coin.
- [ ] Couleur, motif, bord, épaisseur, résultats, avant/après, rôle, dupliquer, supprimer.
- [ ] Plusieurs panels : nouveau, dupliquer, renommer, supprimer, changer. Les tags gardent leur nom.

## 8. Exports
- [ ] ✅ CSV : une ligne par tag, s'ouvre dans Excel (choisir `;` pour Excel en français).
- [ ] Copier le CSV, JSON du match, « Tout sauvegarder ».
- [ ] Réimporter le JSON exporté par la v2.

## 9. Affichage
- [ ] ✅ iPad en paysage et en portrait.
- [ ] ✅ Interface en anglais, en français via le bouton de l'accueil.
