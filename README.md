# rythme-hebdo

Deux barres au-dessus du prompt de Claude Code pour ne pas brûler le quota hebdomadaire de l'abonnement (fenêtre `seven_day`) en début de semaine.

Une ligne compacte, qui se déplie avec le bouton « Détails » (ou la touche `u` quand la bande a le focus). Dans l'app desktop, les barres sont dessinées en SVG arrondi ; dans le terminal, en caractères :

```
Sem. ━━━━┃───── 42 % ▼1  ·  Jour ━━━━━━━╸── 76 % ▾
╭────────────────────────────────────────────────╮
│ Hebdomadaire     Réinitialisation lun. 10:00 · 42 % │
│ ━━━━━━━━━━━━━━━━━━━┃──────────────────────────  │
│ ▼ 1 pts de marge ≈ 0,1 j · rythme 43 %          │
│                                                │
│ Aujourd'hui              12 / 15,8 pts · 76 %   │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╸───────────  │
│ reste 3,8 pts budget = reste du quota ÷ jours restants │
╰────────────────────────────────────────────────╯
```

**Semaine** : le remplissage est votre % du quota, le repère `┃` là où vous devriez en être à un rythme régulier sur 7 jours. La pastille dit l'avance (▲, orange puis rouge au-delà de 5 pts) ou la marge (▼, vert), et son équivalent en jours.

**Jour** : le budget du jour est ce qu'il restait du quota ce matin, divisé par les jours restants avant la réinitialisation. Le budget se recalcule donc chaque jour : une veille économe agrandit celui du lendemain, une veille gourmande le rétrécit. Vert sous 75 % du budget, orange jusqu'à 100 %, rouge au-delà.

La ligne de statut résume : `Sem. 42 % ▼1 · Jour 76 %`. `/hebdo` masque ou réaffiche les barres.

Les chiffres viennent du moteur (aucun appel extérieur) et apparaissent après la première réponse de la session. Le point de départ du jour est la dernière lecture vue sur ce poste un jour précédent : la consommation faite ailleurs (claude.ai, autre machine) depuis cette lecture compte dans la journée. Hors abonnement (clé API), il n'y a pas de fenêtre hebdo et les barres restent cachées.

## Installation

À l'invite d'une session Claude Code dans un terminal :

```
/plugin install rythme-hebdo --marketplace ZQUEMA/rythme-hebdo
```

Répondre `y` à « Add marketplace? », puis Entrée pour la portée utilisateur.

Depuis un shell :

```bash
claude plugin install rythme-hebdo --marketplace ZQUEMA/rythme-hebdo
```

Dans l'app desktop (où `/plugin` ne tourne pas) : cliquer sur + à côté du champ de saisie, puis Plugins, Add marketplace avec `ZQUEMA/rythme-hebdo`, puis Add plugin.

Le dépôt est privé : l'installation ne marche que pour les personnes invitées sur GitHub dont la machine a déjà un accès git à github.com (une clé SSH, ou `gh auth login` puis `gh auth setup-git`) ; elle ne demande jamais d'identifiants.
