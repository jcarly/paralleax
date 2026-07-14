# Scenarios de tests MVP

## Objectif

Controler les parcours critiques du MVP : Story, Interaction, Trigger et Lecteur.

## Tests unitaires / composants

- Editeur : modifier le titre d'une interaction garde la page visible et met a jour le bloc.
- Editeur : deplacer une interaction sauvegarde uniquement la position sans effacer le titre ou le contenu.
- Editeur : selectionner une interaction sans trigger affiche un etat d'erreur controle au lieu d'une page blanche.
- Moteur lecteur : une interaction sans entree est disponible au demarrage.
- Moteur lecteur : une interaction avec entree n'est disponible qu'apres l'interaction source.
- Moteur lecteur : les conditions visitee / non visitee filtrent correctement les choix.

## Tests fonctionnels Playwright

- Editeur : ouvrir une story, selectionner une interaction, renommer son titre, verifier que le canvas et l'inspecteur restent visibles.
- Editeur : deplacer une interaction, verifier que le titre et le contenu restent visibles apres la sauvegarde.
- Editeur : creer une interaction racine, verifier qu'elle apparait dans le canvas.
- Editeur : creer une suite depuis une interaction selectionnee, verifier le lien d'entree du trigger.
- Lecteur : ouvrir une story, choisir une interaction de depart, verifier les choix suivants.
- Lecteur : recommencer remet l'historique et les choix dans l'etat initial.

## Priorite actuelle

1. Stabilite de l'edition du titre.
2. Stabilite du deplacement d'interaction.
3. Non-regression du lecteur.
