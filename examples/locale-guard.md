---
marp: true
theme: indaco
paginate: true
lang: fr
footer: "SlideWright · guardefou de langue"
acronyms:
  CA: chiffre d'affaires
---

<!-- _class: title silent -->

# La narration parle la langue du deck.

`Fonctionnalité · guardefou de langue`

Réglez `lang:` sur une langue autre que l'anglais et la narration lit le texte tel qu'il est écrit — sans y injecter de mots anglais.

<!-- Bienvenue. Ce deck montre le guardefou de langue : une présentation en français est lue en français, sans que la machinerie anglaise ne s'y invite. -->

---

<!-- _class: divider -->

## Le problème : une machinerie « say-as » anglaise.

Cadenza sait dire « FY26 » comme « fiscal year twenty-six » et « 40% » comme « forty percent ». Utile en anglais — mais dans un deck français, cela injecte des mots anglais au milieu des phrases.

<!-- L'idée : le dictionnaire d'abréviations, les nombres en toutes lettres et l'analyseur d'exercice sont tous anglais. Appliqués à un deck français, ils le déforment. -->

---

## Les chiffres se lisent comme vous les écrivez.

Le CA de l'exercice FY26 a progressé de 40%. Nous avons servi 1,024 clients au T3, contre 512 un an plus tôt.

<!-- Le chiffre d'affaires de l'exercice FY26 a progressé de 40%. Nous avons servi 1,024 clients au troisième trimestre, contre 512 un an plus tôt. -->

---

## Votre registre reste actif.

Un `acronyms:` dans l'en-tête vous appartient — ici, `CA` se lit « chiffre d'affaires ». Le guardefou ne coupe que la machinerie anglaise, jamais vos propres prononciations.

<!-- Votre registre d'acronymes reste honoré dans toutes les langues, car il vous appartient. Seule la machinerie anglaise est contournée. -->

---

## Le signal : une seule clé, déjà connue.

`lang:` est la directive Marp standard — elle règle aussi la langue du document pour l'accessibilité. Une seule clé décrit la langue du deck ; les trois producteurs de sous-titres la lisent au même endroit.

<!-- Le signal est la directive lang de Marp, que vous connaissez déjà. Une seule clé, lue de façon identique par l'export, le téléchargement du navigateur et la lecture à voix haute. -->

---

<!-- _class: light -->

## L'anglais, lui, ne change pas.

Sans `lang:`, ou avec `en` / `en-US`, tout se comporte exactement comme avant — au octet près. Le guardefou est une assurance, invisible pour la grande majorité des decks.

<!-- Et pour l'anglais, rien ne change : le comportement est identique à l'octet près. Le guardefou est une simple assurance. Merci de votre attention. -->
