// De vaste stappenlijst voor een nieuwe klant (Fase 8). Elke nieuwe klant krijgt een rij per stap in de
// Notion database "Onboarding stappen". Dezelfde lijst staat beschreven in het projectdocument
// fase-8-admin-en-onboarding-ontwerp, zodat de chat dezelfde stappen aanmaakt als het portaal.
// aanZet: wie de stap standaard doet (Dylan, Claude, Klant of Knop = een knop in het portaal).

const FASEN = [
  { code: 'A', naam: 'Aanmelden', optie: 'A Aanmelden' },
  { code: 'B', naam: 'Begrijpen', optie: 'B Begrijpen' },
  { code: 'C', naam: 'Inrichten', optie: 'C Inrichten' },
  { code: 'D', naam: 'Testen', optie: 'D Testen' },
  { code: 'E', naam: 'Live', optie: 'E Live' }
];

const STAPPEN = [
  { nr: 1, fase: 'A', titel: 'Websitescan en nieuwe klant', uitleg: 'Naam, id, omschrijving, taal en WordPress uit de homepage gehaald.', aanZet: 'Dylan' },
  { nr: 2, fase: 'A', titel: 'Gegevens van de klant verzamelen', uitleg: 'WordPress login via een veilige route, Drive map, 2 tot 3 concurrenten, wens voor goedkeuren, contactpersoon en aanhef, blogs per maand.', aanZet: 'Klant' },
  { nr: 3, fase: 'A', titel: 'Intake verwerking controleren', uitleg: 'Status In behandeling, Portaal Instellingen entry, Clients rij en Databronnen rijen aanwezig.', aanZet: 'Claude' },
  { nr: 4, fase: 'B', titel: 'Merkprofiel concept', uitleg: 'Opbouwen nadat het kennisdocument er is, zodat het profiel het document meeleest (de verslagregel moet zeggen: Kennisdocument meegelezen ja). Controleer dat alle tien kopjes er staan. Zet daarna de schakelaar Merkprofiel ingeschakeld aan in Portaal Instellingen, anders ziet de klant het tabblad niet. Merkprofiel naar Kennisdocument blijft uit tenzij Dylan dat wil.', aanZet: 'Knop' },
  { nr: 5, fase: 'B', titel: 'Kennisdocument en vragenlijst', uitleg: 'Concept uit de site, ongeveer 12 vragen waarvan 3 of 4 over vakkennis, antwoorden verwerken, blok Regels voor gebruik in blogs, inclusief met welke merken en partners de klant zelf werkt (alleen die mogen in blogs bij naam genoemd worden).', aanZet: 'Claude' },
  { nr: 6, fase: 'B', titel: 'Merktermen en concurrenten', uitleg: 'Kolom merktermen in Clients, concurrenten als verboden termen.', aanZet: 'Claude' },
  { nr: 7, fase: 'B', titel: 'SEO en GEO strategie', uitleg: 'Document met clusters, aanpak voor Google en AI, kalender voor 3 maanden. Pas bouwen na akkoord van Dylan.', aanZet: 'Claude' },
  { nr: 8, fase: 'B', titel: 'Plan van aanpak naar de klant', uitleg: 'Advertisr huisstijl, twee opties voor goedkeuren, akkoord van de klant.', aanZet: 'Claude' },
  { nr: 9, fase: 'C', titel: 'Clients rij aanvullen', uitleg: 'Branche, doelgroep, categorieen gelijk aan clusters, diensten, usps, niet_onderwerpen, canonical_terms, taal, contact_naam, fotomap.', aanZet: 'Claude' },
  { nr: 10, fase: 'C', titel: 'Notion content database', uitleg: 'Alle velden, alle 8 statusopties, Slug, SEO Meta Title en Description, opmerkingenveld, token als laatste invullen.', aanZet: 'Claude' },
  { nr: 11, fase: 'C', titel: 'Portaal en login', uitleg: 'clients.js, Render variabelen (NOTION_TOKEN en PORTAL_PASSWORD), modules aan. Dylan logt eerst zelf in als reviewer. De klant krijgt pas toegang bij Live zetten.', aanZet: 'Claude' },
  { nr: 12, fase: 'C', titel: 'WordPress', uitleg: 'REST test, post type, Yoast snippet, Cloudflare, opbouw check, schrijftest, fotomap delen met het n8n Google account.', aanZet: 'Claude' },
  { nr: 13, fase: 'C', titel: 'Databronnen en topics', uitleg: 'Seeds over de clusters, Search Console rij, eerste Topic Generator run, zoekwoorden naar natuurlijke taal, Akkoord in Telegram.', aanZet: 'Claude' },
  { nr: 14, fase: 'C', titel: 'Prestaties', uitleg: 'Search Console toegang regelen (Dylan) en Search Console site invullen in Portaal Instellingen. GA4 property ID en conversiedoelen, contact en boekpaden, portaalvlag performanceV2. Meting Inrichten draaien (GA4 dimensies en GTM werkruimte) en controleren dat de Prestatie workflows de klant oppakken. Schakelaar Prestaties pas aan als er data is.', aanZet: 'Dylan' },
  { nr: 15, fase: 'C', titel: 'AI zichtbaarheid', uitleg: 'In de Clients rij ai_meting aan, ai_domein, ai_zoektermen en ai_runs. In ai_merken het eigen merk en de concurrenten. De eerste meetvragen zetten met BA - AI Vragen Start (per klant) tijdens de onboarding, ruim voor de eerste maandag, en de voorbeelden controleren. De kernvragen blijven staan, de wisselvragen worden elke 1e van de maand vernieuwd met data. Het AI tabblad in het portaal gaat pas aan na twee volle weken meting.', aanZet: 'Claude' },
  { nr: 16, fase: 'D', titel: 'Controles vooraf', uitleg: 'Lussen versie 3, OpenAI parameters, Interne Linking, credentials gekoppeld. Bij een ander CMS dan WordPress: de router en adapter kunnen controleren, concept maken, publiceren, depubliceren en een bestaande blog lezen en aanpassen.', aanZet: 'Claude' },
  { nr: 17, fase: 'D', titel: 'Testblog', uitleg: 'Genereren, QA Gate, WordPress draft, Yoast, afbeelding, interne links, tekst in het portaal, Feedback Revisie, Publicatie Sync. Test ook de afwijsflow: zet de testblog op Afgewezen met een opmerking, wacht op de run en controleer dat de tekst in WordPress is aangepast, de status weer op Ter review staat en de mail op een testadres aankomt. Controleer ook dat de Telegram melding bij afwijzing binnenkomt.', aanZet: 'Claude' },
  { nr: 18, fase: 'D', titel: 'Eerste blog door Dylan gecontroleerd', uitleg: 'In het portaal, voordat de klant een mail krijgt.', aanZet: 'Dylan' },
  { nr: 19, fase: 'E', titel: 'Live zetten', uitleg: 'Mailadres van de klant invullen, status actief, intake op Afgerond, schakelaar Prestaties aan na minstens 1 gepubliceerde blog.', aanZet: 'Claude' },
  { nr: 20, fase: 'E', titel: 'Eerste week', uitleg: 'Telegram fouten, Prestaties na de eerste nacht, AI schakelaar aan na de eerste maandag.', aanZet: 'Claude' },
  { nr: 21, fase: 'E', titel: 'Eerste maand', uitleg: 'Maandrapport op de 4e, Effect Meting en Page Enrichment doen mee, klant ontvangt de uitleg.', aanZet: 'Claude' },
  { nr: 22, fase: 'C', titel: 'Sitemap en content inventory', uitleg: 'Content Inventory Sync moet voor deze klant draaien (WordPress of de CMS tak) en de tabel content_inventory moet gevuld zijn met pagina\'s en blogs. Zonder sitemap kan interne linking niet naar pagina\'s linken en hebben kannibalisatie en Page Enrichment geen data.', aanZet: 'Claude' },
  { nr: 23, fase: 'D', titel: 'Interne linking, kannibalisatie en Page Enrichment', uitleg: 'Test op een echte blog: krijgt hij links naar pagina\'s en naar blogs van hetzelfde cluster, werkt Interne Links Terug op oudere blogs, doet Kannibalisatie een voorstel en kan Page Enrichment (Verbeteren Voorstel) een bestaande blog aanpassen. Bij een ander CMS moet de adapter bestaande teksten kunnen lezen en wijzigen.', aanZet: 'Claude' },
  { nr: 24, fase: 'D', titel: 'Alle modules nalopen tegen een bestaande klant', uitleg: 'Loop vlak voor live zetten de hele lijst na tegen een klant die alles heeft (zoals Basecamp): alle portaaltabbladen (Overzicht, Blogs, Prestaties, AI zichtbaarheid, Maandrapporten, Merkprofiel, Kennisdocument, Beeldbank, Landingspagina\'s), Portaal Instellingen, de workflows (Maandrapport, Ter Review Reminder, Afwijzing Melding, Klantstatus Sync, Beeldbank Sync, Effect Meting) en de Clients rij. Alles wat daar wel is en hier niet, nu inrichten of bewust overslaan met reden.', aanZet: 'Claude' }
];

// Stappen voor Pagr. (landingspagina's). Nr 101 en hoger, zodat ze naast de Blogr. stappen in dezelfde database staan.
// gedeeld: true betekent dat de stap bij Blogr. al bestaat. Bij Beide worden die niet dubbel aangemaakt.
const PAGR_STAPPEN = [
  { nr: 101, fase: 'A', titel: 'Websitescan en nieuwe klant', uitleg: 'Naam, id, omschrijving, taal en WordPress uit de homepage gehaald.', aanZet: 'Dylan', gedeeld: true },
  { nr: 102, fase: 'A', titel: 'Gegevens voor de pagina\'s', uitleg: 'WordPress login via een veilige route, aantal pagina\'s per maand, contactpersoon, formulier en foto\'s.', aanZet: 'Klant', gedeeld: true },
  { nr: 103, fase: 'B', titel: 'Merkprofiel en kennisdocument', uitleg: 'Wat de klant doet, voor wie, toon en regels. Wordt ook gebruikt voor de teksten van de pagina\'s.', aanZet: 'Claude', gedeeld: true },
  { nr: 104, fase: 'B', titel: 'Plan voor de pagina\'s', uitleg: 'Eerste planvoorstel in de Werkplaats: diensten en plaatsen met een reden. Pas bouwen na akkoord van Dylan.', aanZet: 'Dylan' },
  { nr: 105, fase: 'C', titel: 'Sjabloon', uitleg: 'Eerste sjabloon met echte tekst van de klant, controleren en op Actief zetten.', aanZet: 'Dylan' },
  { nr: 106, fase: 'C', titel: 'WordPress koppeling', uitleg: 'REST test, SEO plugin, formulier shortcode, mediabibliotheek en Cloudflare.', aanZet: 'Claude' },
  { nr: 107, fase: 'C', titel: 'Klantgegevens in de LP Fabriek', uitleg: 'Bedrijfsgegevens, toon en feiten met bron invullen bij Pagr., Klantgegevens (staat in Notion). Kleuren en lettertypen (tokens) in src/lp/tokens.js en de WordPress variabelen op Render blijven een stap voor Claude.', aanZet: 'Claude' },
  { nr: 108, fase: 'C', titel: 'Portaal en login', uitleg: 'Product Pagr. aanzetten bij Instellingen en login voor de klant regelen.', aanZet: 'Claude' },
  { nr: 109, fase: 'D', titel: 'Testpagina', uitleg: 'Een pagina laten maken, controleren, als concept naar WordPress en het voorbeeld bekijken.', aanZet: 'Claude' },
  { nr: 110, fase: 'D', titel: 'Eerste pagina door Dylan gecontroleerd', uitleg: 'In de Werkplaats, voordat er iets live gaat.', aanZet: 'Dylan' },
  { nr: 111, fase: 'E', titel: 'Live zetten', uitleg: 'Eerste pagina\'s publiceren, status van de klant actief, mail naar de klant.', aanZet: 'Dylan' },
  { nr: 112, fase: 'E', titel: 'Eerste maand', uitleg: 'Meting per pagina (Google en AI) en een planvoorstel voor de volgende maand.', aanZet: 'Claude' }
];

const STATUSSEN = ['Nog niet gestart', 'Bezig', 'Wacht op Dylan', 'Wacht op klant', 'Klaar', 'Overgeslagen'];

// De stappen voor een productkeuze. Blogr. = 1 tot 21, Pagr. = 101 tot 112, Beide = Blogr. plus de Pagr. stappen die niet gedeeld zijn.
function stappenVoor(producten) {
  if (producten === 'Pagr.') return PAGR_STAPPEN;
  if (producten === 'Beide') return [...STAPPEN, ...PAGR_STAPPEN.filter((s) => !s.gedeeld)];
  return STAPPEN;
}

module.exports = { FASEN, STAPPEN, PAGR_STAPPEN, STATUSSEN, stappenVoor };
