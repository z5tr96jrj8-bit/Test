# RL Analysis v2

Même interface que la version 1 (disposition, couleurs, boutons, noms), avec un moteur plus sûr et plus rapide.
La v1 (racine du site) n'est pas modifiée. La v2 a ses propres données.

## Installation

Aucune installation : ce sont des fichiers HTML, CSS et JavaScript.
- **En ligne** : ouvrir `…/Test/v2/`. Sur iPad : Partager → **Sur l'écran d'accueil**. Après une première ouverture, l'app fonctionne aussi **sans réseau**.
- **Sur ordinateur, sans site** : dans ce dossier, lancer `python3 -m http.server`, puis ouvrir `http://localhost:8000`.

## Reprendre les codages de la v1

1. Dans la **v1** : Mes projets → ⋯ → **Tout sauvegarder** (un fichier `.json` est créé).
2. Dans la **v2** : Mes projets → ⋯ → **Importer**, puis choisir ce fichier.

Sont repris : matchs, tags, projets, listes, panels. Le panel actif est celui qui correspond à vos tags.
Les vidéos déjà gardées sur l'appareil par la v1 sont réutilisées (sans nouvelle copie).

## Utilisation

Identique à la v1. Différences :
- **Panel vierge** au départ : vous créez vos propres boutons (Modifier le panel → Ajouter un bouton).
- **Édition → Annuler / Rétablir** : jusqu'à 100 actions.
- Pas de connexion ni de synchronisation en ligne : tout reste sur l'appareil. Pensez à **Tout sauvegarder** régulièrement.

## Fichiers

```
index.html        écrans (même HTML que la v1)
css/app.css       styles (identiques à la v1)
js/storage.js     enregistrement IndexedDB (nouveau), lance ensuite js/app.js
js/app.js         application (code de la v1 + améliorations marquées « v2 : » dans les commentaires)
sw.js             fonctionnement hors ligne
```
