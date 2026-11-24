# RL Analysis v3 — Étape 5 : installation sans GitHub

L'appli est **100 % statique** : des fichiers HTML, CSS et JavaScript. Pas de serveur à toi, pas de compte, pas de GitHub. Trois façons de l'utiliser, de la plus simple à la plus complète.

> Après chaque modification du code, `node v3/tools/build.mjs` (ou `npm run build` dans `v3/`) produit :
> - `v3/dist/RL-Analysis.html` : **un seul fichier** (méthode A) ;
> - `v3/dist/RL-Analysis-site.zip` : le même site déjà compressé ;
> - `v3/dist/site/` : **le dossier à déposer** sur Netlify ou Cloudflare (méthode B) et à installer sur l'iPad (méthode C).

---

## Méthode A — Ouvrir le fichier sur ton ordinateur
1. Récupère `RL-Analysis.html` (dans `v3/dist/`).
2. Double-clique dessus : il s'ouvre dans Chrome, Edge ou Safari.
3. C'est tout. Aucune connexion nécessaire.

Limites : pas d'installation « appli », pas de mode hors ligne automatique (ce n'est pas utile ici : le fichier est déjà sur ton disque). Les données restent dans ce navigateur, pour ce fichier précis.

---

## Méthode B — La mettre en ligne gratuitement (glisser-déposer)
Tu obtiens une adresse (https://…) qui marche partout, y compris sur l'iPad. **Seul le programme est en ligne : tes matchs, tags et vidéos ne sont jamais envoyés.**

### B1. Netlify
1. Va sur https://app.netlify.com/drop (crée un compte gratuit si on te le demande).
2. Glisse le **dossier `dist/site`** (ou, s'il le refuse, décompresse `RL-Analysis-site.zip` puis glisse le dossier obtenu) (le dossier lui-même, pas son contenu dézippé en vrac) sur la zone « Drag and drop ».
3. Netlify te donne une adresse du type `https://nom-au-hasard.netlify.app`. Tu peux la renommer dans *Site configuration → Change site name*.
4. **Pour mettre à jour** : dans le site, onglet *Deploys*, glisse le nouveau dossier `dist/site`.

### B2. Cloudflare Pages
1. Va sur https://dash.cloudflare.com → *Workers & Pages* → *Create* → *Pages* → **Upload assets** (« Direct Upload »).
2. Donne un nom au projet, puis glisse le **dossier `dist/site`**, puis *Deploy*.
3. Adresse obtenue : `https://nom.pages.dev`.
4. **Pour mettre à jour** : *Create new deployment* sur le projet, et glisse le nouveau dossier.

Les menus de ces sites changent parfois de nom ; l'idée reste « envoyer un dossier de fichiers ». Le fichier `_headers` fourni dans le dossier est lu par les deux services : il empêche qu'une ancienne version reste en mémoire.

---

## Méthode C — L'installer sur l'iPad (comme une appli, hors ligne)
Prérequis : la méthode B (une adresse https).

1. Sur l'iPad, ouvre l'adresse **dans Safari**.
2. Touche **Partager** (carré avec une flèche) → **Sur l'écran d'accueil** → **Ajouter**.
3. Ouvre l'appli depuis l'icône « RL Analysis » (plein écran, sans barre Safari).
4. **Une seule fois, avec du réseau** : ouvre l'appli et laisse-la charger quelques secondes. Le programme est alors gardé sur l'iPad ; ensuite elle démarre **sans réseau**.
5. Test : mets l'iPad en mode avion, ferme l'appli, rouvre-la : l'accueil doit s'afficher.

### Important sur iPad : deux espaces de données séparés
Les données de l'appli installée sont **séparées** de celles de Safari et de l'ancienne appli. Donc :
1. **Installe d'abord** l'appli (étapes 1 à 3).
2. **Ensuite** importe tes données *depuis l'appli installée* : Mes projets → Importer → ton fichier « Tout sauvegarder ».
3. Le fichier de sauvegarde se récupère dans l'app **Fichiers** (iCloud Drive ou Google Drive).

### Mises à jour
Quand tu déposes une nouvelle version (B), l'appli la télécharge toute seule au lancement suivant avec réseau, puis affiche « Nouvelle version installée : ferme puis rouvre l'appli ». Tes données ne sont pas touchées.

---

## Tes données

| Quoi | Où | Envoyé sur un serveur ? |
|---|---|---|
| Matchs, tags, projets, panels, réglages | Base du navigateur (IndexedDB) de l'appareil | **Non** (sauf si tu actives la synchro dans Réglages) |
| Vidéos | Stockage privé de l'appli sur l'appareil, copiées à partir du fichier que tu choisis | **Non, jamais** |
| Programme de l'appli | Gardé sur l'appareil (hors ligne) | — |

- **Vidéos sur Google Drive** : dans l'appli, « Choisir la vidéo » ouvre l'app Fichiers de l'iPad, où ton Google Drive apparaît (app Drive installée). Tu choisis la vidéo : elle est lue (et copiée sur l'appareil pour ne plus avoir à la rechoisir), elle n'est jamais envoyée ailleurs. Pour des fichiers très lourds, télécharge-les d'abord sur l'iPad (Drive → Télécharger → Enregistrer dans Fichiers).
- **Sauvegarder** : Mes projets → **Tout sauvegarder** fait un fichier `.json` (sans les vidéos). Fais-le régulièrement et garde-le dans Drive : Safari peut effacer les données d'un site peu utilisé, mais pas celles d'une appli installée sur l'écran d'accueil.
- **Passer d'un appareil à l'autre** : Tout sauvegarder → Importer sur l'autre appareil (testé automatiquement). Ou activer la synchro (facultative, Réglages).
- **Un match seul** : Exporter → « Projet complet (.json) ».
- **Anciens projets** : le fichier « Tout sauvegarder » de l'ancienne appli s'importe tel quel (6 matchs, 488 tags : testé, rien n'est perdu) ; le rapport s'affiche avant de valider.

## Mode démo
Accueil → « Essayer avec un match d'exemple ». Il crée un match fictif de 90 tags et un projet « Démo » pour tester la timeline, le bilan et les listes sans vidéo ni données personnelles. Tu le supprimes comme un match normal (Mes projets → ⋯ → Supprimer).

## Ce qui a été vérifié (automatiquement)
`node tests/offline.mjs` : manifeste d'installation, service worker, 33 fichiers gardés, **rechargement hors ligne**, données lisibles et codage hors ligne, sauvegarde complète puis import sur un autre « appareil », ouverture depuis un fichier, aucune erreur JavaScript.

## Pas vérifié ici
- Le dépôt sur Netlify / Cloudflare et l'installation sur un iPad réel (je n'ai ni compte ni iPad) : les étapes ci-dessus suivent leur fonctionnement habituel, mais les libellés des menus peuvent différer.
- Le comportement des vidéos lourdes sur iPad (copie sur l'appareil, export vidéo).
