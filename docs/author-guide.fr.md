# Guide de l'auteur

_English version: [Author guide](author-guide.md)._

Ce guide s'adresse aux personnes qui écrivent des histoires dans Paralleax. Il
ne demande aucune connaissance technique. Il présente les idées derrière
l'éditeur, puis vous fait construire une petite histoire en vingt minutes
environ.

Pour le détail de chaque commande et raccourci, voir le
[User guide](user-guide.md) (en anglais). Les mots en **gras** sont les
libellés de l'interface en français.

> **Alpha.** Paralleax est en alpha privée accompagnée. Utilisez uniquement des
> projets de test, pas un travail que vous ne pouvez pas vous permettre de
> perdre. Une histoire ne peut pas encore être exportée.

## Les idées en cinq minutes

**Une histoire est faite d'Interactions.** Une Interaction est un moment : une
scène, un choix, une réplique, une action. Elle a un **Titre**, que le lecteur
voit comme le choix qui y mène, et un **Contenu**, qu'il lit en y arrivant.

**Les Triggers (aussi appelés déclencheurs dans l'interface) décident quand
une Interaction devient disponible.** Sur le graphe, un Trigger est le petit marqueur posé sur la flèche qui entre dans une
Interaction. Il répond à deux questions :

- _D'où ?_ Ses entrées : les Interactions où le lecteur peut se trouver.
  Plusieurs entrées veulent dire « depuis n'importe laquelle ».
- _À quelles conditions ?_ Les conditions d'un même groupe doivent toutes être
  vraies (ET). Plusieurs groupes sont des alternatives (OU).

Un Trigger sans entrée ni condition rend son Interaction disponible dès le
début de l'histoire.

**Le monde a un état.** Dans **Contexte de l'histoire** (le panneau de gauche),
vous créez des **Lieux**, des **Personnages**, des **Variables** (nombre,
vrai/faux ou texte) et des **Objets**. Une Interaction peut modifier cet état
avec des **effets** (« Mira obtient la clé », « Confiance + 1 »), et un Trigger
peut le tester avec des **conditions** (« Mira possède la clé »,
« Confiance ≥ 3 », « il fait nuit »).

**Le temps passe.** Chaque histoire a son propre calendrier. Chaque Interaction
peut avoir une durée, et les conditions peuvent vérifier la date ou l'heure.

**Vous testez en Simulation, les lecteurs lisent dans le Lecteur.** La
Simulation montre ce que verrait un lecteur, mais aussi les options _non_
disponibles, avec la raison. Le Lecteur ne montre que ce que le lecteur a le
droit de voir.

> Dans l'interface, les Variables rattachées à un personnage s'affichent comme
> des **Caractéristiques**. C'est la même chose.

## Tutoriel : la porte verrouillée

Vous allez construire ceci : l'héroïne commence dans un hall. La porte est
verrouillée. En fouillant un tiroir, elle trouve une clé, et avec la clé la
porte s'ouvre.

### 1. Créer l'histoire

1. Ouvrez **Histoires**, choisissez **Nouvelle histoire**, tapez _La porte
   verrouillée_, puis **Créer l'histoire**.
2. L'éditeur s'ouvre avec deux Interactions reliées, déjà créées. La première
   est sélectionnée et affichée dans l'inspecteur, à droite.

### 2. Écrire la scène d'ouverture

1. Dans l'inspecteur, donnez à la première Interaction le **Titre** _Hall_.
2. Cliquez sur **Ajouter du contenu** et écrivez : _Un hall poussiéreux. Une
   lourde porte vous fait face, et un vieux bureau est adossé au mur._
3. Cliquez en dehors du champ. Les changements sont enregistrés quand vous
   quittez un champ.

### 3. Créer l'héroïne et la clé

1. Dans **Contexte de l'histoire**, ouvrez **Personnages** et créez _Mira_.
   Dans son inspecteur, activez **Personnage jouable**.
2. Ouvrez **Objets**, choisissez **Ajouter une définition d'objet** et
   nommez-la _Clé_.

### 4. Ajouter les deux choix

1. Sélectionnez la seconde Interaction (créée avec l'histoire) et donnez-lui le
   titre _Fouiller le bureau_. Contenu : _Dans le tiroir du haut, sous de vieux
   papiers : une clé._
2. Toujours sélectionnée, choisissez **Ajouter un effet**, puis **Inventaire
   d'objet**, la _Clé_, l'opération **obtenir** et _Mira_.
3. Sélectionnez de nouveau _Hall_ et utilisez **Ajouter un enfant**. Donnez à la
   nouvelle Interaction le titre _Ouvrir la porte_. Contenu : _La clé tourne. La
   porte s'ouvre sur le jardin._

### 5. Verrouiller la porte

1. Sélectionnez le marqueur de Trigger sur la flèche qui entre dans _Ouvrir la
   porte_.
2. Choisissez **Ajouter une condition**, le type **Objet**, et exigez que le
   lecteur possède la _Clé_.
3. Permettez aussi d'atteindre la porte après le bureau : faites glisser le
   **+** du bas de _Fouiller le bureau_ et déposez-le sur ce même marqueur. Ce
   Trigger a maintenant deux entrées : _Hall_ ou _Fouiller le bureau_.

### 6. Tester

1. Dans l'en-tête de l'éditeur, choisissez l'icône **Tester depuis le début**
   (survolez les icônes pour voir leur nom).
2. Choisissez _Mira_, puis sélectionnez _Hall_ pour commencer. La Simulation
   laisse toujours choisir la scène d'ouverture ; le Lecteur la lance
   automatiquement quand il n'y en a qu'une.
3. Dans _Hall_, _Ouvrir la porte_ apparaît grisée, avec la raison : il manque la
   clé. Un lecteur ne la verrait pas du tout.
4. Choisissez _Fouiller le bureau_. L'inventaire de Mira affiche la clé, et
   _Ouvrir la porte_ devient disponible. Choisissez-la.
5. Utilisez **Retour** pour revenir en arrière, ou **Recommencer** pour
   rejouer. Pour tester volontairement un chemin bloqué, activez **Forcer les
   options indisponibles**.

Vous venez d'utiliser des Interactions, un Trigger à plusieurs entrées, une
condition, un effet, un personnage, un objet et la Simulation : l'essentiel de
Paralleax.

## Aller plus loin

- **Organiser une grande histoire.** Sélectionnez des Interactions et appuyez
  sur **Ctrl+G** pour les regrouper dans un Groupe (un chapitre, une quête).
  Utilisez **Réorganiser le graphe** pour remettre la disposition en ordre, et
  le champ de recherche de **Contexte de l'histoire** pour retrouver un texte ou
  toutes les utilisations d'un personnage ou d'une variable.
- **Des variables dans le texte.** Dans l'éditeur de contenu, **Ajouter une
  variable** insère la valeur courante d'une variable, par exemple l'argent de
  Mira.
- **Du texte conditionnel.** Une partie du texte d'une scène peut n'apparaître
  que si des conditions sont vraies, sans créer d'autre Interaction.
- **Hasard et pression.** Sur un Trigger, **Probabilité d'apparition** ne fait
  apparaître une option que parfois (de façon reproductible pour une même
  partie). **Timer de disponibilité** la fait disparaître après un nombre de
  secondes.
- **Relire à plusieurs.** **Placer un post-it** ou **Commenter cet élément**
  ouvre une discussion sur une partie précise de l'histoire.
- **Annuler.** Les deux premières icônes de la barre d'outils du graphe (ou
  Ctrl+Z hors d'un champ de texte) annulent et rétablissent votre dernière
  modification, même après un rechargement.

## Partager une histoire

Depuis la roue dentée à côté du titre, ouvrez **Accès**. Une histoire peut être
privée, ouverte aux utilisateurs connectés, lisible par toute personne ayant le
lien (sans apparaître dans la bibliothèque publique), ou publique. Vous pouvez
accorder des droits de lecture ou d'édition à des comptes précis.

Les lecteurs ouvrent l'histoire avec **Lire**. Les lecteurs connectés
conservent leur progression, les lecteurs anonymes non.

## Ce que Paralleax ne sait pas encore faire

- Exporter une histoire ou l'envoyer vers un moteur de jeu. C'est la prochaine
  priorité, voir la [Roadmap](roadmap.md#next).
- Fusionner les modifications de deux personnes sur un même texte. Quand
  quelqu'un d'autre enregistre, votre éditeur recharge sa modification : évitez
  de modifier le même champ en même temps.
- Traduire le contenu des histoires. L'interface existe en anglais, français et
  italien.
- Écrire une suite de scènes en texte brut. Un mode texte est prévu.
- Héberger des images ou des vidéos. Vous pouvez les insérer par URL.
- Marquer une histoire comme terminée, ou publier une version figée.

## Vocabulaire

Le [Glossaire](glossary.md) (en anglais) donne les définitions précises. Les
termes du projet restent en anglais dans la documentation technique :
Interaction, Trigger, Condition group, Effect, Variable, Item, Location,
Character, Simulation Mode, Reader. Leurs équivalents dans l'interface
française : Interaction, trigger ou déclencheur (les deux libellés coexistent
encore), groupe de conditions, effet, variable, objet,
lieu, personnage, Simulation, Lecteur.
