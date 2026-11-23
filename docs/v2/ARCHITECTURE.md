# RL Analysis v2 : architecture proposée (étape 2)

Décisions validées : audit OK ; interface en anglais avec le français en option ; iPad en priorité, ordinateur aussi.
Point en attente : la synchronisation en ligne (voir § 6, recommandation : la garder, en l'améliorant).

## 1. Principes

- **Même technologie** : HTML, CSS et JavaScript sans framework ni dépendance. Le code est découpé en **modules ES** natifs (`import` / `export`), reconnus par Safari iPad et tous les navigateurs récents. Il n'y a pas d'étape de compilation.
- **Local d'abord** : tout fonctionne sans réseau, et les vidéos ne quittent jamais l'appareil.
- **Hors ligne** : un *service worker* met l'application en cache. Elle s'ouvre donc au stade même sans connexion, une fois installée sur l'écran d'accueil de l'iPad.
- **Une seule source de vérité** : les données (`model/`) ne connaissent pas l'écran. L'écran (`ui/`) s'abonne aux changements et ne redessine que ce qui a changé.

## 2. Arborescence

```
index.html                 coquille HTML légère (charge app/js/main.js)
manifest.webmanifest       installation sur l'écran d'accueil
sw.js                      cache hors ligne
app/
  css/
    tokens.css             couleurs, tailles, espacements (thème sombre unique)
    base.css  layout.css  components.css
  icons.svg                jeu d'icônes homogène (un seul trait, une seule taille de base)
  i18n/  en.js  fr.js      tous les textes de l'interface
  js/
    main.js                démarrage, navigation entre les écrans
    core/
      db.js                IndexedDB : un enregistrement par match, projet, panel
      migrate.js           lecture des données v1 et des anciens fichiers JSON
      history.js           Annuler / Rétablir (commandes, 100 niveaux)
      bus.js               notifications de changement (« tag ajouté », « tag modifié »…)
      i18n.js  util.js
    model/
      match.js  tags.js    tags + index (par catégorie, par temps, par mi-temps)
      panel.js             boutons, modèles de panels, raccourcis
      project.js  score.js  filters.js
    video/
      player.js            lecture, vitesses, sauts, image par image
      vault.js             vidéos gardées sur l'appareil (OPFS, repris de la v1)
      recorder.js          export vidéo : UN seul moteur pour clip, liste et montage
    ui/
      pad.js               panel de codage + éditeur de panel
      timeline.js          pistes, blocs visibles seulement, zoom, édition
      inspector.js         détails du tag : résultat, zone, joueur, note, début et fin
      shortcuts.js         clavier (pavé et rangée de chiffres), personnalisable
      home.js  projects.js  sort.js  lists.js  dialogs.js  toast.js
    export/
      csv.js  json.js  report.js (rapport d'une page, imprimable en PDF)
    sync/
      supabase.js          synchronisation facultative (§ 6)
tests/                     tests automatiques (migration, export, performances sur 1 000 tags)
docs/v2/                   audit, architecture, checklists, changelog
```

## 3. Stockage

| v1 | v2 | Pourquoi |
|---|---|---|
| `localStorage`, une seule clé pour tout, environ 5 Mo, erreurs ignorées | **IndexedDB**, un enregistrement par match | Plus de limite gênante ; on n'écrit que le match modifié ; une erreur d'écriture **s'affiche**, elle n'est plus ignorée |
| Écriture à chaque frappe | Écriture groupée (au plus toutes les 300 ms) + écriture immédiate si on quitte la page | Fluide, sans perte |
| Pas de sauvegarde de secours | Copie de sécurité automatique tournante (5 dernières versions de chaque match) + rappel « Exporter une sauvegarde » chaque semaine | Ne jamais perdre un codage |

**Migration automatique** : au premier lancement, la v2 lit les clés v1 (`carnet-de-tags.v1`, `.prefs`, `.videos`, `.sync`, `rl-atelier.v1`), les convertit et **ne les efface pas**. La v1 reste donc utilisable en parallèle.
Important : les données du navigateur sont rattachées à l'adresse du site (le domaine). La v2 doit donc être publiée **sur le même site GitHub Pages** (par exemple `…/Test/v2/` pendant les essais), sinon elle ne verra pas les codages de la v1.

## 4. Modèle de données v2 (résumé)

```js
Tag = {
  id, catId,            // catId : identifiant stable du bouton
  label, color,         // copiés au moment du tag : renommer un bouton ne réécrit plus l'historique
  team,                 // "home" | "away"
  at,                   // seconde dans la vidéo (ou temps de match en direct)
  start, end,           // début et fin du clip (au lieu de « secondes avant / après »)
  period,               // 1, 2, 3, 4 (prolongations), calculé à partir des repères
  result, zone, player, note,
  createdAt, updatedAt
}
Match = { id, v: 2, home, away, date, comp, mode, video, markers[], tags[], lists[], updatedAt }
Marker = { type: "kickoff" | "half2" | "et1" | "et2" | "goal" | "red" | "sub" | "system", at, team, note }
```
Les anciens champs (`d0`, `d1`, `p`, `t`, `v`, `lbl`, `btn`) sont convertis par `migrate.js`. L'import d'un ancien JSON passe par la même conversion.

## 5. Performance (objectif : 1 000 tags sans ralentissement)

- Index en mémoire (tag → bouton, tags par catégorie, triés par temps) : plus de calculs qui croissent avec le carré du nombre de tags.
- Ajouter un tag = ajouter **un** bloc dans **une** piste + mettre à jour **un** compteur. Rien d'autre n'est redessiné.
- La timeline ne crée que les blocs visibles à l'écran (virtualisation horizontale).
- Une seule boucle d'animation pendant la lecture, arrêtée quand la vidéo est en pause.
- Polices système au lieu des 130 Ko de polices intégrées ; CSS réécrit sans `!important`.

## 6. Synchronisation en ligne : recommandation

**La garder, facultative et désactivée par défaut, mais la corriger.** Raisons :
- Vous travaillez sur iPad **et** ordinateur : sans synchro, il faut exporter et importer un fichier à chaque changement d'appareil.
- Seules les données de codage partent en ligne (quelques Ko par match), jamais les vidéos. La contrainte « vidéos locales » est donc respectée.
- Les données sont envoyées dans votre propre base Supabase, protégée par votre compte.

Corrections prévues :
- Fusion **tag par tag** au lieu de « le dernier match modifié écrase l'autre » : coder sur deux appareils ne fait plus perdre de tags.
- Plus de limite à 500 éléments.
- Fonctionnement hors ligne : les changements partent quand le réseau revient.
- Indicateur clair et permanent : « Enregistré sur l'iPad » / « Synchronisé » / « En attente ».

Si vous préférez ne rien mettre en ligne (par exemple pour la confidentialité d'un club), il suffit de ne pas se connecter : tout fonctionne en local, avec export et import de fichiers.

## 7. iPad et ordinateur

- Interface au toucher d'abord (cibles d'au moins 44 px), adaptée aussi à la souris (survol, clic droit = menu).
- Raccourcis : touches du **pavé numérique** et de la **rangée de chiffres** (les claviers d'iPad n'ont souvent pas de pavé), lettres, Espace = lecture/pause, ← → = sauts, Cmd/Ctrl+Z / Maj+Cmd/Ctrl+Z = annuler/rétablir.
- Deux mises en page conservées (Codage / Analyse) ; en portrait sur iPad, vidéo en haut et panel en bas.

## 8. Déroulement

| Phase | Contenu | Livré quand |
|---|---|---|
| 3 | v2 **à fonctions égales** : les 46 fonctions de l'audit, sur la nouvelle base (stockage, modules, rendu rapide, anglais) | Checklist de non-régression de la phase 3 cochée |
| 4 | Améliorations : raccourcis, annuler/rétablir, édition avancée, joueur, filtres, score, marqueurs, comparaison, rapport, exports | Checklist de la phase 4 cochée |

Pendant les deux phases, la v1 reste en ligne et intacte. La v2 est publiée dans `v2/` et remplace la v1 seulement quand vous le décidez.

## 9. Checklist phase 2 (avant de commencer la phase 3)

- [ ] Faire une **sauvegarde complète depuis la v1** (Mes projets → ⋯ → Tout sauvegarder) et la garder de côté.
- [ ] Me dire si un ancien fichier JSON peut servir de test de migration (je l'anonymiserai, il ne sera pas publié).
- [ ] Valider l'arborescence et le modèle de données ci-dessus.
- [ ] Valider la recommandation sur la synchronisation (§ 6).
- [ ] Valider la publication de la v2 dans `v2/` sur le même site pendant les essais.

## 10. Ajustements après lecture d'une vraie sauvegarde v1

Une sauvegarde réelle (6 matchs codés, 488 tags, 2 panels) a été analysée hors du dépôt. Constats :

1. **Les colonnes ne désignent pas l'équipe à domicile et l'équipe à l'extérieur.** Dans les données, `team: "home"` veut dire « équipe analysée avec ballon » et `team: "away"` « équipe analysée sans ballon », que l'équipe analysée joue à domicile ou à l'extérieur. La v2 enregistre donc deux informations distinctes : l'**équipe analysée** (choisie dans le projet) et la **phase** (avec ou sans ballon). La migration convertit `home` en `with ball` et `away` en `without ball`.
2. **Le bug du renommage se produit déjà dans ces données** : le panel actif est le panel par défaut (« 2 »). Les tags enregistrés avec « Mon panel » s'affichent donc sous d'autres noms (par exemple « OFF TRANSITION » apparaît comme « Pressing »). La migration se base sur le **nom enregistré dans chaque tag** (`lbl`) et sur « Mon panel ».
3. **Aucun repère de mi-temps n'a été placé** : tous les tags sont en 1re mi-temps. Le filtre par mi-temps demandera de placer le coup d'envoi et le début de la 2e mi-temps, en deux touchers. Un rappel s'affichera.
4. **Le score se déduit des boutons GOAL et GOAL CONCEDED**, pas d'un résultat « But ». La v2 permet de choisir, dans le panel, le rôle d'un bouton (but pour, but contre, occasion…).
5. Un projet référence 4 matchs supprimés : la migration nettoie ces références.
6. Volume : environ 0,2 Ko par tag. La limite de 5 Mo de la v1 serait atteinte vers 100 matchs codés, soit à peu près une saison.
