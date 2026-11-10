# TrajetIA

Application web mobile qui aide à garder son trajet en transport en commun malgré les perturbations : elle détecte un retard ou une suppression, compare avec le meilleur trajet de remplacement et recommande quoi faire.

Elle fonctionne **avec de vraies données et sans aucune clé** : horaires officiels et retards en temps réel du réseau **Ilévia** (métropole de Lille), adresses de la Base Adresse Nationale.

## Le parcours

1. **Accueil** : saisir un départ et une arrivée (arrêts Ilévia ou adresses), choisir l'heure d'arrivée. Les trajets sont calculés sur les horaires officiels, avec les retards et suppressions du moment.
2. **Perturbation** : si le trajet habituel est en retard ou supprimé, l'application le détecte, affiche « Si vous continuez » face au meilleur trajet de remplacement, et demande une recommandation à l'IA (ou affiche un plan B).
3. **Simulation** : le bouton « Tester : simuler un incident sur ma ligne » bloque la ligne pendant 25 minutes pour voir le parcours sans attendre une vraie panne. Horaires et itinéraires restent réels, seul l'incident est simulé, et l'application l'indique.
4. **Aussi** : itinéraires alternatifs, trajet en cours, alertes (trajets enregistrés, préférences), profil (compte, données, état des services, fraîcheur du temps réel).

## Technologies

- React 18 et Vite
- Node.js et Express 5
- SQLite pour les comptes et les trajets
- Calcul d'itinéraires sur des données GTFS (données ouvertes)
- Notifications push (Web Push et service worker)
- Recommandation par IA compatible avec plusieurs fournisseurs (Groq, Gemini, Ollama, Claude), avec repli sur des règles sans clé
- Tests automatiques et parcours de bout en bout dans Chrome

## Lancer le projet

```bash
git clone https://github.com/imene-be/trajetia.git
cd trajetia
npm install
npm run dev
```

Ouvrez l'adresse affichée dans le terminal (en général [http://localhost:5173](http://localhost:5173)). Au premier démarrage, le serveur télécharge les horaires du réseau (9,5 Mo) : un bandeau « Chargement des horaires… » passe au vert quand les données réelles sont prêtes.

## Aller plus loin (facultatif)

Copiez `.env.example` en `.env` pour activer des options.

| Ajout | Effet |
|---|---|
| `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` | une vraie IA (Groq, Gemini ou Ollama en local). Sans rien : recommandation automatique par règles |
| `ANTHROPIC_API_KEY` | alternative : l'API Claude |
| `npm run vapid` puis les clés dans `.env` | notifications push |
| `NAVITIA_TOKEN` | SNCF et d'autres réseaux que Lille |

## Tests

```bash
npm test                 # tests automatiques du serveur
npm run test:complet     # parcours complet dans Chrome
npm run rapport          # régénère RAPPORT.md avec les résultats réels
```

## Structure

```
server/          serveur : comptes, trajets, itinéraires, IA, notifications, surveillance
  providers/     gtfs.js (réel), navitia.js (optionnel), demo.js (tests)
  tests/         tests automatiques
src/             application React
public/sw.js     service worker des notifications
scripts/         lanceur, clés push, test de bout en bout
```

## Documentation

- [COMPRENDRE.md](COMPRENDRE.md) : le guide de l'équipe, fichier par fichier
- [RAPPORT.md](RAPPORT.md) : présentation complète, résultats des tests et déroulé de démonstration

---

Réalisé par [Imène Bentifraouine](https://imenebe.fr).
