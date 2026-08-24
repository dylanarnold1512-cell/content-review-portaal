# Content review portaal

Kleine, meerdere-klanten-tegelijk webapp bovenop Notion-contentplanningen.
Elke klant leest en schrijft naar zijn eigen Notion-database; welke klanten
er zijn en of ze een reviewstap hebben, staat in `src/config/clients.js`.

## Hoe het werkt

- Notion blijft de bron van waarheid — status, SEO-velden en de volledige
  blogtekst staan gewoon in de Notion-pagina's, dit portaal leest en
  schrijft daar rechtstreeks in via de officiële Notion-API.
- Per klant een eigen Notion-integratietoken (environment variable), want
  een Notion-integratie werkt alleen binnen de werkruimte waarin hij is
  aangemaakt.
- `reviewEnabled: false` (zoals nu bij PPExport) toont het portaal als
  leesweergave zonder goedkeur/afwijs-knoppen.
- Inloggen is één gedeeld wachtwoord per klant — geen aparte gebruikers-
  accounts. Prima voor één of enkele reviewers; zie "Later uitbreiden"
  hieronder voor de volgende stap.

## Nieuwe klant toevoegen

1. Voeg een object toe aan `src/config/clients.js` met een uniek `id`.
2. Maak in de Notion-werkruimte van die klant een interne integratie aan
   (Notion instellingen → Connections → Develop or manage integrations →
   New integration), en deel de contentplanning-database met die
   integratie (··· menu op de database → Connections → voeg de integratie
   toe).
3. Zet het integratietoken in een environment variable en verwijs daarnaar
   vanuit `notionTokenEnv` in de configuratie.
4. Zet een wachtwoord in een environment variable voor `loginPasswordEnv`.

Geen andere code hoeft aangepast te worden.

## Lokaal draaien

```
npm install
cp .env.example .env   # vul de waarden in
npm start
```

De app draait dan op http://localhost:3000.

## Deployen

Gebouwd als een gewone Node/Express-webservice — te draaien op Render
(Web Service, build command `npm install`, start command `npm start`) met
dezelfde environment variables als in `.env.example`.

## Later uitbreiden

- **Individuele accounts in plaats van één gedeeld wachtwoord per klant**:
  vervang `src/middleware/auth.js` door een echte user-tabel; de rest van
  de app hoeft niet te veranderen.
- **Direct triggeren van de n8n-workflow bij goedkeuren/afwijzen** in
  plaats van wachten op de volgende geplande run: voeg een `fetch()` naar
  de n8n-webhook-URL toe in `approveItem`/`rejectItem` in
  `src/services/notion.js`.
- **Eigen database in plaats van rechtstreeks Notion** als het aantal
  klanten/reviewers groeit en de Notion API-rate limit gaat knellen: dat
  raakt alleen `src/services/notion.js`, de rest van de app blijft gelijk.
