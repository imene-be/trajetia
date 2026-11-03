# TrajetIA

Application web mobile (React + JavaScript) avec un serveur Node (Express) et une base SQLite.
Elle fonctionne **avec de vraies données, sans aucune clé** : horaires officiels et retards en temps réel du réseau **Ilévia (métropole de Lille)**, adresses de la Base Adresse Nationale.
Lisez **[COMPRENDRE.md](COMPRENDRE.md)** (le guide pour l'équipe : comment tout fonctionne, fichier par fichier, questions du prof) et **[RAPPORT.md](RAPPORT.md)** : présentation complète, correspondance avec nos PDF, résultats détaillés des tests, ce qui n'a pas pu être testé, et le déroulé de démonstration.

## Lancer (une seule commande)

```bash
cd trajetia
npm install        # une seule fois
npm run dev        # lance le serveur ET l'application
```

Ouvrez l'adresse affichée dans le terminal (en général **http://localhost:5173**). Au premier démarrage, le serveur télécharge les horaires du réseau (9,5 Mo) : le bandeau en haut affiche « Chargement des horaires… » pendant quelques secondes, puis passe au vert « Données réelles ».

## Le parcours

1. **Accueil** : tapez un départ et une arrivée (arrêts Ilévia ou adresses), choisissez l'heure d'arrivée, touchez « Rechercher ». Les trajets sont calculés sur les horaires officiels, avec les retards et suppressions du moment.
2. **Perturbation** : si votre trajet habituel est en retard ou supprimé, l'application le détecte, affiche « Si vous continuez » contre le meilleur trajet de remplacement, et demande une recommandation à l'IA (ou affiche le plan B).
3. **Tester sans attendre une vraie panne** : le bouton « Tester : simuler un incident sur ma ligne » bloque votre ligne 25 minutes. Les horaires et les itinéraires restent réels, seul l'incident est simulé, et l'application l'indique.
4. **Itinéraires alternatifs**, **trajet en cours**, **alertes** (trajets enregistrés, préférences), **profil** (compte, données, état des services, mesure de la fraîcheur du temps réel).

## Pour aller plus loin (facultatif : copiez `.env.example` en `.env`)

| Ce que vous ajoutez | Ce que ça apporte |
|---|---|
| `AI_BASE_URL` + `AI_MODEL` + `AI_API_KEY` | **une vraie IA, gratuite possible** (Groq, Gemini, ou Ollama sur votre ordinateur : voir `.env.example`). Sans rien : recommandation automatique par règles, gratuite |
| `ANTHROPIC_API_KEY` | alternative payante : l'API Claude |
| `npm run vapid` puis les clés dans `.env` | notifications push |
| `NAVITIA_TOKEN` | SNCF et d'autres réseaux que Lille |

## Vérifier

```bash
npm test                          # tests automatiques du serveur (sans consommer le quota de l'IA)
npm run test:complet              # parcours complet dans Chrome de A à Z (consomme quelques requêtes de l'IA gratuite : pas avant la démo !)
npm run rapport                   # régénère RAPPORT.md avec les résultats réels
npm run build && npm run server   # puis, dans un autre terminal :
npm run test:dev                  # parcours dans Chrome (adresse dans E2E_URL, par défaut :3001)
```

## Où est quoi

```
server/        le serveur : comptes, trajets, itinéraires, IA, notifications, surveillance, mesures
  providers/   gtfs.js : calcul d'itinéraires sur les données ouvertes (réel) · navitia.js (optionnel) · demo.js (tests)
  tests/       les tests automatiques
src/           l'application React (écrans dans src/ecrans/)
public/sw.js   le service worker des notifications
scripts/       lanceur (dev.mjs), clés push, test de bout en bout
data/          horaires téléchargés (cache) et base SQLite : ne pas publier
```
