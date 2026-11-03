# Comprendre TrajetIA : le guide pour l'équipe

*Ce document est écrit pour vous, pas pour un expert. Il explique comment l'application fonctionne, à quoi sert chaque fichier, comment modifier les choses simples, et comment répondre aux questions du prof. Le dossier « officiel » avec les résultats de tests est `RAPPORT.md`.*

---

## 1. L'idée en 30 secondes

Quand un métro ou un bus est en retard, le voyageur ne sait pas **à quelle heure il arrivera** ni **quoi faire**. TrajetIA lui dit : « Si vous continuez, vous arrivez à 15h20. Avec ce trajet de remplacement, vous arrivez à 15h02. » Et une IA explique en une phrase pourquoi elle recommande ce trajet.

Tout repose sur trois ingrédients :
1. **Des données réelles** du réseau Ilévia (Lille) : les horaires officiels et les retards du moment.
2. **Notre propre calcul** d'itinéraires (ce n'est pas Google Maps qui calcule, c'est notre code).
3. **Une IA** qui choisit parmi les trajets calculés et rédige la phrase. Elle n'invente rien : le serveur vérifie sa réponse.

---

## 2. Que se passe-t-il quand je clique ? (le parcours d'une demande)

### Cas 1 : « Rechercher »

1. Le navigateur (l'application React) appelle le serveur : « donne-moi des trajets de A vers B, pour arriver à 09:00 ».
2. Le serveur (`server/journeys.js`) passe la demande au calculateur (`server/providers/gtfs.js`).
3. Le calculateur :
   - prend les **horaires officiels** du jour (fichier GTFS d'Ilévia, gardé en mémoire) ;
   - applique les **retards et suppressions du moment** (flux GTFS-RT d'Ilévia, mis à jour toutes les 20 secondes) ;
   - cherche les trajets qui arrivent le plus tôt, en autorisant les correspondances à pied entre arrêts proches ;
   - renvoie 3 ou 4 trajets variés.
4. L'application affiche des cartes : durée, heure d'arrivée, étapes (métro, bus, marche).

### Cas 2 : « Tester : simuler un incident sur ma ligne »

1. Même chose, mais le serveur **bloque** la ligne du premier trajet pendant 25 minutes (les horaires restent réels, seul l'incident est inventé).
2. Le calculateur refait le trajet habituel avec cet incident : « si vous continuez » arrive plus tard.
3. Il cherche aussi des **alternatives qui évitent la ligne bloquée**.
4. L'application affiche l'écran « Perturbation détectée ». **Aussitôt**, elle montre les heures (elles viennent du calcul, pas de l'IA).
5. En parallèle, elle demande à l'IA une recommandation (`/api/recommend`, voir section 5).
6. Si l'IA répond en moins de 3 secondes : on affiche « Recommandation IA » avec sa phrase. Sinon : **plan B** du dossier, les alternatives restent affichées, classées par heure d'arrivée.

### Cas 3 : l'alerte automatique (sans que l'utilisateur fasse rien)

1. L'utilisateur a **enregistré un trajet** (« arriver pour 09:00 »).
2. Toutes les 5 minutes, le serveur regarde chaque trajet enregistré, **dans les 2 heures avant l'heure d'arrivée** (`server/monitor.js`).
3. S'il trouve que le trajet habituel est perturbé, ou qu'on ne pourra plus arriver à l'heure, il **crée une alerte** (une seule par trajet et par jour) et envoie une **notification** sur le téléphone ou l'ordinateur.

---

## 3. Plan du dossier : à quoi sert chaque fichier

### Le serveur (`server/`), le « cerveau »

| Fichier | Rôle en une ligne |
|---|---|
| `index.js` | Démarre tout : charge les horaires, lance la surveillance, écoute les demandes |
| `app.js` | Assemble les morceaux et pose les protections (sécurité, origines autorisées) |
| `config.js` | Lit les réglages dans `.env` (clés, délais, ports) |
| `db.js` | La base de données (SQLite) : comptes, trajets, alertes, abonnements, mesures, journal de l'IA |
| `auth.js` | Inscription, connexion, déconnexion, export et suppression du compte |
| `trips.js` | Les trajets enregistrés de l'utilisateur (chacun ne voit que les siens) |
| `journeys.js` | Les routes « lieux », « itinéraires » et « fraîcheur des données » |
| `providers/gtfs.js` | **Le calculateur d'itinéraires** (le plus gros morceau, voir section 4) |
| `providers/ilevia.js` | Mesure l'âge du flux temps réel (pour la « fraîcheur ») |
| `providers/navitia.js` | Option pour d'autres villes et la SNCF (jeton gratuit, **non testé**) |
| `providers/demo.js` | Données fictives, utilisées uniquement par les tests |
| `ai.js` | L'IA : prépare la demande, appelle le modèle, **vérifie** la réponse, plan B |
| `push.js` | Les notifications (abonnement, envoi, notification de test) |
| `monitor.js` | La surveillance automatique des trajets enregistrés |
| `events.js` | Les mesures anonymes (visites, inscriptions…) et le tableau de bord des KPI |
| `temps.js` | Petits outils de date et d'heure (fuseau de Paris) |
| `tests/` | Les 42 tests automatiques |

### L'application (`src/`), ce que voit l'utilisateur

| Fichier | Rôle |
|---|---|
| `main.jsx`, `App.jsx` | Le point de départ ; `App.jsx` garde l'état (trajets, compte, préférences) et relie tous les écrans |
| `ecrans/Accueil.jsx` | Recherche et liste de trajets |
| `ecrans/Perturbation.jsx` | « Perturbation détectée » + recommandation de l'IA |
| `ecrans/Itineraires.jsx` | Itinéraires alternatifs, priorités |
| `ecrans/TrajetEnCours.jsx` | Le trajet choisi, étape par étape |
| `ecrans/Alertes.jsx` | Trajets enregistrés, préférences IA, alertes récentes |
| `ecrans/Profil.jsx` | Compte, position, notifications, état des services, RGPD |
| `api.js` | Tous les appels au serveur (un seul endroit) |
| `ia.js` + `useRecommandation.js` | Demande la recommandation et gère le délai de 3 s |
| `data.js` | Outils d'heures et transformation des trajets reçus |
| `composants.jsx`, `formulaires.jsx` | Boutons, icônes, champs de lieu, fenêtre de compte |
| `styles.css` | **Tout le visuel** (couleurs, tailles) |

### Autres

| Fichier | Rôle |
|---|---|
| `public/sw.js` | Le « service worker » : il reçoit les notifications même quand la page est fermée |
| `.env` | Vos clés (**secret, jamais publié**) |
| `.env.example` | Le modèle de `.env`, sans secret |
| `scripts/` | `dev.mjs` (lanceur), `e2e-complet.mjs` (test A à Z), `rapport.mjs` (écrit `RAPPORT.md`) |
| `data/` | Les horaires téléchargés et la base de données (**ne pas publier**) |

---

## 4. Le calculateur d'itinéraires, expliqué simplement

**Les données** (gratuites, sans clé) :
- **GTFS** = un fichier d'Ilévia qui liste tous les arrêts, toutes les lignes et tous les horaires prévus.
- **GTFS-RT** (« RT » = temps réel) = un flux qui dit, course par course : « celle-ci a 6 minutes de retard », « celle-là est supprimée ».

**La méthode** : imaginez qu'on classe tous les trajets d'un bus à un autre de la journée dans l'ordre de départ, puis qu'on les parcourt un par un en notant « je peux être à tel arrêt à telle heure au plus tôt ». À la fin, on lit l'heure d'arrivée la plus tôt à destination. (Le nom savant : *Connection Scan Algorithm*.)

**Les détails qui comptent :**
- Entre deux arrêts à moins de 250 m, on autorise la **marche** (vitesse 4,5 km/h, distance × 1,3 car on ne marche pas à vol d'oiseau). **C'est une estimation**, pas un calcul sur les trottoirs.
- Pour « arriver à 09:00 » : on essaie un départ toutes les 5 minutes sur les 2 heures précédentes, et on garde ceux qui arrivent à l'heure en partant le plus tard possible.
- Une **perturbation** = le trajet habituel arrive **au moins 5 minutes plus tard** que prévu, ou une de ses courses est supprimée (`SEUIL_RETARD` dans `gtfs.js`).
- « Si vous continuez » = on refait **exactement le même trajet** (mêmes lignes) avec les horaires réels.

---

## 5. Comment l'IA est utilisée

**Ce qu'on lui envoie** : seulement des trajets (durée, heure d'arrivée, correspondances, marche, fiabilité), l'heure voulue et les préférences. **Jamais** de nom, d'adresse, d'e-mail ni de position (c'est testé).

**Ce qu'on lui demande** : « choisis un trajet parmi ceux-là et explique en une phrase ». Elle répond en JSON : `{routeId, claimedArrivalMin, reason}`.

**La vérification** (c'est le point fort à expliquer au prof) : avant d'afficher quoi que ce soit, le serveur contrôle que :
1. le trajet recommandé **existe** dans la liste envoyée ;
2. l'heure d'arrivée annoncée est **exactement** celle du trajet ;
3. la phrase ne cite **aucune heure inventée** ;
4. la phrase n'est pas vide ni trop longue.
Si un contrôle échoue, la réponse est jetée : on affiche le plan B.

**Le délai** : 3 secondes maximum (`AI_TIMEOUT_MS`). Au-delà : plan B (les alternatives restent affichées, classées par heure d'arrivée), comme dans notre PDF d'architecture.

**Le coût maîtrisé** : l'IA n'est appelée que lorsqu'il y a une perturbation ; une demande identique n'est pas redemandée (mémoire de 200 résultats) ; chaque appel est noté dans le journal (`ai_calls`).

**Sans IA configurée** : l'application affiche une « recommandation automatique » calculée par des règles. Elle est gratuite et **jamais présentée comme une IA**. (Ce mode n'est pas dans nos PDF.)

**Quelle IA gratuite choisir ? (mesuré pour de vrai)**
- **Groq** (modèle `qwen/qwen3.8-27b`) : **250 à 310 millisecondes**, réponses valides, limite gratuite de **1000 requêtes par jour**. C'est celle que l'application utilise maintenant. ✅
- **Google Gemini** (gratuit) : 0,5 à 1,2 seconde le matin, mais **15 à 25 secondes** plus tard dans la journée, et seulement **20 requêtes par jour** par modèle. À éviter pour une démo.
- Si une IA est trop lente ou à court de quota, l'application affiche le **plan B** (c'est le comportement prévu par notre PDF). Gardez quand même une capture d'écran de l'écran avec la phrase de l'IA au cas où.
- Les modèles Groq « gpt-oss » ne conviennent pas ici (ils renvoient des réponses vides : le serveur les refuse). `llama-3.1-8b-instant` n'existe plus.

---

## 6. Le fichier `.env` expliqué

| Ligne | À quoi ça sert |
|---|---|
| `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` | Branche l'IA (Groq actuellement ; Gemini ou Ollama possibles). `AI_MODEL` peut contenir plusieurs modèles séparés par des virgules : si l'un a épuisé son quota, le serveur essaie le suivant |
| `AI_TIMEOUT_MS` | Délai maximum de l'IA (3000 = 3 secondes). Mettre `1` pour **montrer le plan B** exprès |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Les « clés d'identité » du serveur pour envoyer des notifications (générées par `npm run vapid`) |
| `JWT_SECRET` | Secret des sessions (obligatoire en production) |
| `ADMIN_TOKEN` | Mot de passe du tableau de bord des KPI |
| `NAVITIA_TOKEN` | Facultatif : pour ajouter la SNCF et d'autres villes |

Après chaque changement dans `.env`, **redémarrez** (`Ctrl + C` puis `npm run dev`).

---

## 7. Modifier les choses simples

| Je veux changer… | Où |
|---|---|
| Les couleurs, les tailles, l'apparence | `src/styles.css` (en haut : `--teal`, `--marine`…) |
| Le trajet d'exemple (Gare Lille Flandres → Euratechnologies) | `src/App.jsx`, cherchez `stop:gare lille flandres` |
| Le seuil de retard (5 min) | `server/providers/gtfs.js`, `SEUIL_RETARD` (en secondes) |
| La durée de l'incident simulé (25 min) | `server/providers/gtfs.js`, cherchez `25 * 60` |
| Le délai de l'IA | `.env`, `AI_TIMEOUT_MS` |
| La fréquence de surveillance (5 min) | `.env`, `MONITOR_INTERVAL_MIN` |
| Les textes de l'interface | les fichiers de `src/ecrans/` |
| Le texte donné à l'IA | `server/ai.js`, la constante `SYSTEME` |
| Les préférences IA proposées | `src/ecrans/Alertes.jsx`, la liste `PREFERENCES` |

---

## 8. Les protections de sécurité, en clair

- **Mot de passe** : jamais enregistré en clair, seulement une empreinte (bcrypt). 10 caractères minimum.
- **Session** : un « cookie » que JavaScript ne peut pas lire (`httpOnly`) et qui ne part pas vers un autre site (`SameSite=Strict`). En production, il exige aussi HTTPS (`Secure`).
- **Autre site malveillant** : une demande qui vient d'un autre site est refusée (403).
- **Trop de tentatives** : la connexion est limitée à 10 essais par 15 minutes.
- **Chacun ses données** : toutes les requêtes filtrent sur l'utilisateur, impossible de lire le trajet de quelqu'un d'autre (testé).
- **RGPD** : l'utilisateur peut **télécharger** toutes ses données et **supprimer** son compte. La position n'est jamais enregistrée.
- **Secrets** : uniquement dans `.env`, qui n'est jamais publié.

---

## 9. Questions probables du prof, et réponses

**« Pourquoi seulement Lille ? »** Parce qu'Ilévia publie ses horaires et ses retards en données ouvertes, sans clé : on pouvait tout tester pour de vrai. Pour Paris, Lyon ou la SNCF, il faut un jeton Navitia (gratuit) ou brancher d'autres données ouvertes de la même façon. On a préféré un réseau qui marche vraiment.

**« L'IA calcule les trajets ? »** Non. Notre code calcule les trajets avec les horaires officiels. L'IA ne fait que **choisir** parmi eux et **expliquer**. Elle ne peut donc pas inventer un trajet ni une heure, et le serveur le vérifie.

**« Et si l'IA se trompe ou ne répond pas ? »** Le serveur rejette une réponse incohérente. Si elle ne répond pas en 3 secondes, les alternatives restent affichées, classées par heure d'arrivée (c'est le plan B de notre dossier). On l'a testé.

**« Les données sont-elles réelles ? »** Oui : horaires officiels, retards en temps réel (le flux a de 4 à 10 secondes), adresses de l'État. Le Profil mesure la fraîcheur en direct. **L'incident, lui, est simulé** et annoncé comme tel.

**« Quelle est la fraîcheur des données ? »** C'était notre incertitude n°1. Mesurée : de 4 à 10 secondes pour le flux temps réel d'Ilévia.

**« Combien ça coûte ? »** Les données, le calcul, les notifications et la base sont gratuits. L'IA est gratuite avec des limites (Groq : 1000 requêtes par jour). On n'appelle l'IA qu'en cas de perturbation et on réutilise les résultats, comme prévu dans le dossier.

**« Et la vie privée ? »** Compte facultatif, position facultative et jamais enregistrée, export et suppression du compte, aucune donnée personnelle envoyée à l'IA.

**« Qu'est-ce qui n'est pas fini ? »** Une seule ville ; marche estimée ; pas de suivi GPS pendant le trajet ; pas de réinitialisation du mot de passe par e-mail ; pas testé sur téléphone ; pas encore en ligne. (Tout est dans `RAPPORT.md`, section 8.)

**« Comment passer à 1000 utilisateurs ? »** Remplacer SQLite par PostgreSQL, héberger avec HTTPS, choisir une IA payante ou avec un meilleur quota. Le code est organisé pour ça : seules les requêtes de `server/db.js` et des routes changent.

---

## 10. Dépannage

| Problème | Cause probable | Solution |
|---|---|---|
| Bandeau rouge « Le serveur ne répond pas » | le serveur n'est pas lancé | `npm run dev` et attendre « prêts » |
| Bandeau « Chargement des horaires… » qui dure | premier démarrage (9,5 Mo à télécharger) | attendre 10 à 20 s ; sinon vérifier Internet |
| « Aucun trajet trouvé » | la nuit (le réseau ne circule presque plus) ou arrêt trop loin | changer l'heure d'arrivée |
| « Choisissez un départ et une arrivée dans les suggestions » | le texte tapé n'a pas été **choisi dans la liste** | cliquer sur une suggestion |
| L'écran dit que l'IA n'est pas disponible | IA lente (> 3 s) ou quota du jour épuisé | normal (plan B) ; essayer plus tard ou brancher Groq |
| Notifications : rien ne s'affiche | permission refusée, ou Chrome non autorisé dans les réglages du Mac | Réglages › Notifications › Chrome |
| La première notification arrive tard | le navigateur vient de s'abonner | attendre quelques secondes, puis renvoyer le test |
| « Un compte existe déjà » | l'e-mail est déjà inscrit | « J'ai déjà un compte » |
| Page blanche après un changement dans `.env` | pas redémarré | `Ctrl + C` puis `npm run dev` |

---

## 11. Mini-glossaire

- **API** : une « prise » par laquelle un programme en appelle un autre (par exemple, notre application appelle notre serveur).
- **Serveur** : le programme qui tourne en arrière-plan et fait les calculs, garde les données et répond à l'application.
- **Base de données** : la mémoire durable du serveur (comptes, trajets, alertes).
- **GTFS / GTFS-RT** : le format standard des horaires de transport / des retards en temps réel.
- **Cookie `httpOnly`** : un petit jeton de connexion que le navigateur garde mais que le code de la page ne peut pas lire.
- **Notification push** : un message qui s'affiche même quand le site est fermé ; il passe par le service de notifications du navigateur.
- **Service worker** : un petit programme du navigateur qui reçoit ces notifications.
- **Plan B** : ce qui s'affiche quand l'IA ne répond pas à temps (alternatives classées par heure d'arrivée).
- **RGPD** : la loi européenne sur les données personnelles.
- **North Star Metric** : l'indicateur principal : le nombre de trajets perturbés pour lesquels l'utilisateur consulte une alternative.
- **KPI** : indicateurs de suivi (activation, conversion par canal, rétention à 7 jours).
- **Quota** : la limite du nombre de requêtes d'un service gratuit.

---

## 12. Les commandes à connaître

```bash
npm install            # une seule fois
npm run dev            # lance tout (serveur + application)
npm test               # 42 tests automatiques (sans consommer l'IA)
npm run test:dev       # test dans Chrome du mode « npm run dev » (consomme 1 requête d'IA)
npm run test:complet   # test A à Z dans Chrome (consomme quelques requêtes d'IA : pas avant la démo !)
npm run rapport        # régénère RAPPORT.md
npm run vapid          # génère des clés de notification
```
