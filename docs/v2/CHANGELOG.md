# Changelog

## 2.0.1 : interface identique à la v1 (2026-11-23)

À votre demande, la v2 reprend **exactement l'interface de la v1** : même HTML, même CSS, mêmes noms, mêmes menus.
Le code de la v1 sert de base, et les améliorations du moteur y sont greffées. Chacune est marquée « v2 : » dans les commentaires de `js/app.js`.
Une comparaison pixel par pixel des écrans v1 / v2 (mêmes données, même vidéo) ne montre que les compteurs corrigés (voir « Corrigé »).

### Retiré à votre demande
- **Avec ballon / Sans ballon** : supprimé partout.
- **Panel pré-rempli** : le panel de départ est **vierge**. « Nouveau panel » et « Disposition d'origine » donnent aussi un panel vide.
- **Interface en anglais** : l'interface est de nouveau en français, comme la v1.

### Amélioré (invisible à l'écran)
- **Enregistrement IndexedDB** au lieu du localStorage : plus de limite d'environ 5 Mo ; seuls les matchs modifiés sont réécrits ; une erreur d'enregistrement est signalée (en v1, elle était ignorée).
- **Rapidité** : avec 1 500 tags, un toucher de bouton prend 15 ms contre 81 ms en v1 (même machine). Seules les parties affichées sont redessinées.
- **Annuler sur 100 actions** (au lieu d'une seule), et **Rétablir** dans le menu Édition.
- Fonctionne **hors ligne** une fois ouverte.

### Corrigé
- Changer de panel n'affiche plus les tags sous le nom d'un autre bouton (ex. vos « OFF TRANSITION » apparaissaient comme « Pressing » avec le panel « 2 »). Renommer un bouton renomme toujours ses tags, comme avant.
- L'import d'une sauvegarde complète reprend désormais les **projets** et la **bibliothèque de panels** (la v1 les oubliait), et ne double plus la taille du panel importé.
- Après un import, le panel actif est celui qui correspond à vos tags.

### Données
- Les données de la v2 sont **séparées** de celles de la v1 sur l'appareil. La v1 continue de fonctionner comme avant.
- **Synchronisation en ligne rétablie** (même base Supabase, même connexion par e-mail). Pour ne jamais écraser la v1, la v2 range ses documents en ligne sous un préfixe `v2:` : elle ne lit pas les données en ligne de la v1, et la v1 ne voit pas celles de la v2. La session de connexion de la v2 est aussi distincte : il faut se connecter une fois dans la v2.

## 2.0.0-phase3 (remplacée)
Première v2 avec une interface redessinée. Elle a été remplacée par la 2.0.1 à votre demande.
