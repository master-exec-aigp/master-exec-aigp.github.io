# Gestion du Master Exécutif AIGP

Site statique hébergé sur GitHub Pages (`https://master-exec-aigp.github.io`) avec une base de données Supabase. Il regroupe la partie publique du programme et l'espace privé de gestion administrative de l'équipe.

| Page | Accès | Rôle |
|---|---|---|
| `index.html` | public | Accueil du programme, liens vers les plannings |
| `planning.html?cohorte=C4` | public | Planning d'une cohorte avec liens d'émargement ; intégrable dans Canvas (iframe) |
| `checkin.html?e=C4-J01-AM` | public, protégé par le code de séance | Page de pointage ouverte par le QR code |
| `admin.html` | équipe (connexion) | Participants, séances, pointage, taux de présence, kit QR, dépenses, recettes, P&L, export Excel |

## Mise en service (une fois)

1. **Supabase** : créer un projet gratuit sur supabase.com (région Europe). Dans *SQL Editor*, exécuter `supabase/schema.sql` puis `supabase/seed.sql` (plannings des cohortes 2, 3 et 4 issus du fichier Excel).
2. **Comptes équipe** : *Authentication → Providers → Email* : désactiver « Allow new users to sign up ». *Authentication → Users → Add user* : créer un compte (e-mail + mot de passe) pour chaque membre de l'équipe. Seuls ces comptes voient et modifient les données.
3. **Configuration** : copier dans `config.js` l'URL du projet et la clé `anon` (*Project Settings → API*). Cette clé est publique par conception ; la protection vient des politiques RLS du schéma.
4. **Publication** : pousser ce dépôt dans l'organisation GitHub sous le nom `master-exec-aigp.github.io` (branche `main`). GitHub Pages est activé automatiquement pour un dépôt portant ce nom ; sinon *Settings → Pages → Deploy from branch → main / root*.

## Fonctionnement du pointage par QR code

- Chaque demi-journée (`C4-J01-AM`, `C4-J01-PM`…) a un **code à 4 chiffres** et un lien `checkin.html?e=<id>`.
- Dans l'espace équipe, *Kit QR intervenants* génère une slide 16:9 par demi-journée (QR + code) et le texte du mail à envoyer à l'intervenant ; téléchargement PNG ou impression PDF.
- Le participant scanne, saisit le code, choisit son nom : la présence est écrite via une fonction SQL sécurisée. Sans le bon code, la liste des noms n'est pas renvoyée.
- Le pointage n'est accepté que le jour de la séance (± 1 jour), sauf si la demi-journée est marquée « ouverte » dans l'espace équipe.
- Complément manuel : vue *Pointage* (présent / absent / excusé), import CSV d'un export Canvas Roll Call ou d'un formulaire.

## Intégration Canvas

Canvas supprime le JavaScript des pages mais accepte les iframes. Dans *Paramètres & Canvas* de l'espace équipe, copier l'extrait :

```html
<p><iframe src="https://master-exec-aigp.github.io/planning.html?cohorte=C4&compact=1" width="100%" height="1200" style="border:0"></iframe></p>
```

et le coller dans l'éditeur HTML d'une page Canvas. Une version « tableau statique » est aussi proposée.

## Mettre à jour le planning depuis Excel

```bash
python3 scripts/build_seed.py "chemin/vers/PLanning ME AIGP.xlsx" > supabase/seed.sql
```

puis ré-exécuter `supabase/seed.sql` dans Supabase : les séances et demi-journées sont mises à jour sans toucher aux présences ni aux codes existants. Les journées ajoutées directement dans l'espace équipe sont conservées.

## Modèle de données

`cohortes` · `participants` (statut, financement, frais) · `seances` (créneaux de 1 h 30) · `emargements` (demi-journées, code, intervenant) · `presences` · `depenses` (catégorie, cohorte ou « Commun », certificat) · `recettes` (payeur de type Participant / Entreprise / Sponsor / Subvention, facturé / encaissé, échéance) · `config`.

Le P&L est calculé à la volée : recettes facturées et encaissées par type, dépenses par catégorie, résultat engagé et résultat trésorerie par cohorte, détail par certificat. Export Excel complet depuis la vue P&L ; sauvegarde JSON depuis *Paramètres*.

## Sécurité

- Lecture publique : `cohortes` et `seances` uniquement (planning). Les codes de séance, participants, présences et données financières ne sont lisibles que par les comptes équipe.
- Les fonctions `checkin_participants` et `checkin` sont les seules écritures possibles sans compte ; elles exigent le code de séance et la fenêtre de date.
- Activer l'authentification à deux facteurs sur les comptes GitHub et Supabase de l'organisation.
