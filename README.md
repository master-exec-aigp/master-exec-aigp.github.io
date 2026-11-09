# Gestion du Master Exécutif AIGP

Site statique hébergé sur GitHub Pages (`https://master-exec-aigp.github.io`) avec une base de données Supabase. Il regroupe la partie publique du programme et l'espace privé de gestion administrative de l'équipe.

| Page | Accès | Rôle |
|---|---|---|
| `index.html` | public | Accueil du programme et accès aux trois espaces |
| `checkin.html?e=C4-J01-AM` | public, protégé par le code de séance | Page de pointage ouverte par le QR code |
| `etudiant.html` | participants (connexion) | Pointage par code de séance (identité connue), présences par certificat, planning et supports de cours de sa cohorte |
| `prof.html` | intervenants (connexion) | Leurs journées : checklist avant / pendant / après, affichage du QR code en séance, pointage, slides à insérer |
| `admin.html` | équipe (connexion) | Tout : participants, séances, journées et checklists de tous les intervenants, suivi, pointage, taux de présence, kit QR, dépenses, recettes, P&L, comptes et rôles, export Excel |

## Trois accès

| Accès | Compte | Voit | Fait |
|---|---|---|---|
| **Participant** | e-mail + mot de passe, créé par lui-même avec l'adresse enregistrée sur sa fiche ; ou aucun compte via le QR code | sa fiche, ses présences, le planning et les liens vers les supports de sa cohorte | pointe sa présence avec le seul code de séance depuis son espace (ou QR code + code + nom sans compte), suit son taux par certificat |
| **Intervenant** | e-mail + mot de passe, rôle `intervenant` | uniquement les journées dont le champ intervenant du planning contient son nom ; liste des participants réduite (nom, prénom, statut) | coche sa checklist, affiche le QR code en séance (ce qui coche l'étape « pendant »), régénère le code, pointe manuellement, télécharge ses slides |
| **Équipe** | e-mail + mot de passe, rôle `admin` | tout | tout, y compris le suivi des checklists de tous les intervenants et la gestion des comptes |

La séparation est appliquée par la base (politiques RLS du fichier de schéma dans `supabase/migrations/`), pas seulement par l'interface : un intervenant connecté sur `admin.html` est renvoyé vers `prof.html`, et une requête directe à l'API ne lui renvoie que ses données. Les participants n'ont aucun compte et ne peuvent lire que le planning.

### Checklist intervenant

Par journée de cours, trois phases dont les éléments sont modifiables dans *Paramètres* (par défaut : supports transmis à J-7, slide QR insérée, logistique confirmée ; QR affiché matin et après-midi, présences vérifiées ; évaluation envoyée aux participants, supports déposés sur Canvas, travaux communiqués). Chaque coche garde qui l'a faite et quand. L'équipe voit l'ensemble dans *Suivi intervenants*, avec alerte rouge si la phase « avant » n'est pas complète à moins de 7 jours de la séance.

## Mise en service (une fois)

1. **Supabase** : créer un projet sur supabase.com (région Europe). Deux façons d'appliquer la base :
   - *manuelle* : dans *SQL Editor*, coller et exécuter `supabase/migrations/20261109000001_schema.sql` puis `supabase/migrations/20261109000002_seed.sql` (plannings des cohortes 2, 3 et 4 issus du fichier Excel) ;
   - *automatique* : si le projet Supabase est relié à ce dépôt GitHub (*Integrations → GitHub*, offre Pro), les fichiers de `supabase/migrations/` sont appliqués à chaque push sur `main`.
2. **Comptes** : laisser les inscriptions par e-mail activées (*Authentication → Providers → Email*) : un déclencheur en base n'accepte que les adresses déjà connues (fiche participant ou compte déclaré par l'équipe), tout autre e-mail est refusé. Créer le premier compte équipe dans *Authentication → Users → Add user* : le **premier compte qui se connecte** devient « équipe ». Il déclare ensuite les intervenants et les autres membres de l'équipe dans *Paramètres → Comptes & rôles* (pour un intervenant, indiquer le fragment de son nom tel qu'il apparaît dans le planning, par exemple « Gouvier ») et saisit l'e-mail de chaque participant sur sa fiche. Intervenants et participants créent alors eux-mêmes leur mot de passe depuis « Première connexion ? Créer mon compte » sur leur espace. Pour éviter l'étape de confirmation par e-mail, désactiver *Confirm email* dans le même écran.
3. **Configuration** : copier dans `config.js` l'URL du projet et la clé `anon` (*Project Settings → API*). Cette clé est publique par conception ; la protection vient des politiques RLS du schéma.
4. **Publication** : pousser ce dépôt dans l'organisation GitHub sous le nom `master-exec-aigp.github.io` (branche `main`). GitHub Pages est activé automatiquement pour un dépôt portant ce nom ; sinon *Settings → Pages → Deploy from branch → main / root*.

## Fonctionnement du pointage par QR code

- Chaque demi-journée (`C4-J01-AM`, `C4-J01-PM`…) a un **code à 4 chiffres** et un lien `checkin.html?e=<id>`.
- Dans l'espace équipe, *Kit QR intervenants* génère une slide 16:9 par demi-journée (QR + code) et le texte du mail à envoyer à l'intervenant ; téléchargement PNG ou impression PDF.
- Le participant scanne, saisit le code, choisit son nom : la présence est écrite via une fonction SQL sécurisée. Sans le bon code, la liste des noms n'est pas renvoyée.
- Le pointage n'est accepté que le jour de la séance (± 1 jour), sauf si la demi-journée est marquée « ouverte » dans l'espace équipe.
- Complément manuel : vue *Pointage* (présent / absent / excusé), import CSV d'un export Canvas Roll Call ou d'un formulaire.

## Dossier administratif des participants

Depuis *Participants → Dossier*, l'équipe tient pour chaque participant : identité et coordonnées, dernier diplôme, mode de financement (frais, remise, montant pris en charge par l'organisme, financeur et contact, convention signée), recettes liées, taux de présence par certificat, et les **documents personnels** (CIN, diplôme, CV, contrat, convention, justificatifs…) déposés dans le stockage privé Supabase (bucket `dossiers`, 20 Mo par fichier). Le participant consulte son propre dossier en lecture seule dans son espace. Exports Excel : un dossier individuel (fiche, financement, documents, présences), tous les dossiers de la cohorte (*Exporter les dossiers*), ou le classeur complet depuis la vue P&L.

## Intégration Canvas

Canvas supprime le JavaScript des pages mais accepte le HTML statique. Dans *Paramètres & Canvas* de l'espace équipe, copier le tableau des journées avec liens d'émargement et le coller dans l'éditeur HTML d'une page Canvas. Le planning public (`planning.html`) a été retiré pour l'instant ; le planning reste consultable par les participants connectés dans leur espace. Pour le réactiver, restaurer le fichier depuis l'historique git.

## Mettre à jour le planning depuis Excel

```bash
python3 scripts/build_seed.py "chemin/vers/PLanning ME AIGP.xlsx" > supabase/migrations/20261109000002_seed.sql
```

puis ré-exécuter ce fichier dans Supabase (ou pousser, si l'intégration GitHub est active) : les séances et demi-journées sont mises à jour sans toucher aux présences ni aux codes existants. Les journées ajoutées directement dans l'espace équipe sont conservées.

## Modèle de données

`cohortes` · `participants` (statut, financement, frais) · `seances` (créneaux de 1 h 30) · `emargements` (demi-journées, code, intervenant) · `presences` · `depenses` (catégorie, cohorte ou « Commun », certificat) · `recettes` (payeur de type Participant / Entreprise / Sponsor / Subvention, facturé / encaissé, échéance) · `config`.

Le P&L est calculé à la volée : recettes facturées et encaissées par type, dépenses par catégorie, résultat engagé et résultat trésorerie par cohorte, détail par certificat. Export Excel complet depuis la vue P&L ; sauvegarde JSON depuis *Paramètres*.

## Sécurité

- Lecture publique : `cohortes` et `seances` uniquement (nécessaire au pointage sans compte ; aucune page publique ne l'affiche pour l'instant). Les codes de séance, participants, présences et données financières ne sont lisibles que par les comptes équipe.
- Les fonctions `checkin_participants` et `checkin` sont les seules écritures possibles sans compte ; elles exigent le code de séance et la fenêtre de date.
- Activer l'authentification à deux facteurs sur les comptes GitHub et Supabase de l'organisation.
