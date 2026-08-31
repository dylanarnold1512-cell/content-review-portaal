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

## Klantinstellingen aan/uit zetten

**Sinds 25-08-2026: gebruik hiervoor het adminpaneel op `/admin`**
(dus `portaal.advertisr.nl/admin`), met een eigen wachtwoord
(environment variable `ADMIN_PASSWORD`, los van de klantwachtwoorden).
Daar staat een overzicht van alle klanten met simpele aan/uit-knoppen:

- **Review** — toont wel/geen goedkeur- en afwijs-knoppen.
- **Prestaties** — toont wel/geen prestatiepaneel (Search Console/GA4-
  cijfers + trendgrafiek). Staat op basecamp Utrecht bewust uit tot er
  minstens ~1 maand aan data in de "BCU — Prestatie Log"-database in
  Notion staat, anders ziet de klant vooral nullen. Alleen togglebaar
  voor klanten met een `performanceLogDatabaseId` in `clients.js`; voor
  klanten zonder prestatie-koppeling staat de knop grijs/uit.

Een toggle werkt **direct door** — geen deploy, geen GitHub, geen
Claude nodig. De waardes staan in een eigen Notion-database "Portaal
Instellingen" (in de Advertisr AI OS-werkruimte, onder "Workflows &
Automatiseringen"), niet in `clients.js` zelf — de waardes daar
(`reviewEnabled`/`performanceEnabled`) zijn alleen nog de fallback voor
als die Notion-database onbereikbaar is.

**Eenmalig opzetwerk** (al gedaan op 25-08-2026, hieronder voor
referentie/een volgende omgeving):
1. In de Notion-werkruimte van "Advertisr AI OS": een interne integratie
   aanmaken (Notion instellingen → Connections → Develop or manage
   integrations → New integration) en de database "Portaal Instellingen"
   ermee delen (··· menu op de database → Connections).
2. Dat integratietoken als environment variable `NOTION_TOKEN_ADMIN`
   zetten op Render.
3. Een zelfgekozen wachtwoord als environment variable `ADMIN_PASSWORD`
   zetten op Render.

Nieuwe klant nog niet in de "Portaal Instellingen"-lijst? Voeg 'm eerst
toe aan `src/config/clients.js` (zie "Nieuwe klant toevoegen" hierboven)
— hij verschijnt dan vanzelf op `/admin`, en er wordt automatisch een
rij voor 'm aangemaakt in Notion zodra je voor het eerst een knop voor
die klant aanraakt.

## LP Fabriek (/lp) — landingspagina's

Sinds 31-08-2026: een interne zone naast de klant- en adminzone, voor het
bouwen van SEO/GEO-landingspagina's voor agencyklanten (eerste testcases:
Hostel Roots, later JMB). Alleen bereikbaar op `/lp`, met een eigen wachtwoord
(environment variable `LP_PASSWORD`) — helemaal los van de klant- en
adminwachtwoorden, klanten kunnen hier nooit bij. Zie `claude/lp-fabriek-besluiten.md`
in het Claude-project "Landingpage automation" voor de volledige architectuur
en alle besluiten.

**Wat blijft in Git (code), wat staat in Notion (data):**
- In de repo: klantprofielen, feiten-bibliotheken en blueprints per klant
  (`src/lp/clients/<klant>/`), de 13 herbruikbare blokken (`src/lp/blocks/`),
  designtokens (`src/lp/tokens.js`) en de renderer/validator/WordPress-publisher
  (`src/lp/render.js`, `src/lp/validator.js`, `src/lp/wordpress.js`).
- In Notion: per landingspagina de status, invoer, feitensheet en content JSON
  — in de gedeelde database "Landingspagina's" (onder de pagina "LP Fabriek"
  in de "Advertisr AI OS"-werkruimte). Eén database voor alle klanten (Klant
  als property), geen database per klant.

**Eenmalig opzetwerk:**
1. De Notion-database "Landingspagina's" delen met dezelfde interne integratie
   die ook bij `NOTION_TOKEN_ADMIN` hoort (··· menu op de database, of op de
   "LP Fabriek"-pagina erboven, → Connections → voeg de integratie toe). Zonder
   deze stap krijgt `/lp` een foutmelding zodra je pagina's probeert te laden.
2. Een zelfgekozen wachtwoord als environment variable `LP_PASSWORD` zetten op
   Render.
3. Per WordPress-klant de site-URL, gebruikersnaam en applicatiewachtwoord als
   environment variables zetten — voor Roots: `WP_URL_ROOTS`,
   `WP_USERNAME_ROOTS`, `WP_APP_PASSWORD_ROOTS` (zie `.env.example`).

**Werkstappen per pagina** (in `/lp`): Nieuwe pagina (formulier, velden komen
uit de blueprint) → Feitensheet (feiten uit de feiten-bibliotheek aanvinken,
eventueel aanvullen met een los feit + verplichte bron) → Content JSON
(momenteel handmatig/geassisteerd ingevuld, geen AI-generatie — dat komt als
aparte bouwstap) → Voorbeeld & publiceren (validator tegen de blueprint-regels,
dan als CONCEPT naar WordPress).

**Veiligheidsgrens, bewust zo gebouwd:** de publiceerknop in `/lp` zet een
WordPress-pagina ALTIJD op status "concept" (draft) — er zit geen functie in
deze tool die een pagina live zet. Een pagina echt live zetten (WordPress-status
"publish", plus de eenmalige "SWP Builder"-klik bij Roots, zie besluiten.md)
blijft een bewuste, handmatige stap door Dylan of Marc. De status-schakelaar in
`/lp` zelf (Idee t/m Gepubliceerd) is alleen een label in Notion en raakt
WordPress niet aan.

## Prestatie-tracking (Search Console + GA4)

Sinds 25-08-2026 haalt het portaal live SEO/traffic-cijfers per blog op
via twee n8n-workflows (niet in deze repo, staan in n8n):

- **"Basecamp Utrecht — Publicatie Sync"** (bestaand) — schrijft bij
  publicatie de live-URL terug naar het Notion-veld "Live URL".
- **"BCU — Dagelijkse Prestatie Sync"** (workflow-id `vv8rtOobBopeQcfo`) —
  draait dagelijks om 06:00, haalt per gepubliceerde blog (met Live URL)
  de Search Console- en GA4-cijfers van de laatste 30 dagen op, schrijft
  die naar de Notion-pagina van die blog, en logt een dagtotaal in de
  Notion-database "BCU — Prestatie Log" (databaseId
  `93a731433ea6446fb31a6ba4ba9dc9cb`) — die voedt de trendgrafiek in het
  prestatiepaneel.

Blogs die vóór 25-08-2026 al gepubliceerd waren, hebben nooit een Live
URL teruggeschreven gekregen en worden dus niet meegenomen door de
dagelijkse sync, tenzij dat veld handmatig in Notion wordt ingevuld.

## Wijzigingen publiceren (deploy)

Render is gekoppeld aan de `main`-branch op GitHub en deployt automatisch
bij elke push. Deze Claude-omgeving heeft doorgaans geen directe
push-toegang tot deze repo — wijzigingen die Claude maakt, komen dus als
zip-bestand terug, dat je zelf toepast:

1. Bestanden uit de zip in de projectmap zetten, met behoud van de
   mapstructuur (bijv. `src/middleware/auth.js` hoort ín `src/`, niet in
   de hoofdmap — sleep submappen dus rechtstreeks in hun tegenhanger, niet
   los in de hoofdmap).
2. Dubbelklik `publiceren.command` (voegt zowel `public/` als `src/` toe,
   commit en pusht).
3. Render bouwt en deployt automatisch (1-2 minuten). Status is te volgen
   op het Render-dashboard.

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
