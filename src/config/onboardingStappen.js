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
  { nr: 4, fase: 'B', titel: 'Merkprofiel concept', uitleg: 'Uit de website opgebouwd met de tien vaste kopjes.', aanZet: 'Knop' },
  { nr: 5, fase: 'B', titel: 'Kennisdocument en vragenlijst', uitleg: 'Concept uit de site, ongeveer 12 vragen waarvan 3 of 4 over vakkennis, antwoorden verwerken, blok Regels voor gebruik in blogs.', aanZet: 'Claude' },
  { nr: 6, fase: 'B', titel: 'Merktermen en concurrenten', uitleg: 'Kolom merktermen in Clients, concurrenten als verboden termen.', aanZet: 'Claude' },
  { nr: 7, fase: 'B', titel: 'SEO en GEO strategie', uitleg: 'Document met clusters, aanpak voor Google en AI, kalender voor 3 maanden. Pas bouwen na akkoord van Dylan.', aanZet: 'Claude' },
  { nr: 8, fase: 'B', titel: 'Plan van aanpak naar de klant', uitleg: 'Advertisr huisstijl, twee opties voor goedkeuren, akkoord van de klant.', aanZet: 'Claude' },
  { nr: 9, fase: 'C', titel: 'Clients rij aanvullen', uitleg: 'Branche, doelgroep, categorieen gelijk aan clusters, diensten, usps, niet_onderwerpen, canonical_terms, taal, contact_naam, fotomap.', aanZet: 'Claude' },
  { nr: 10, fase: 'C', titel: 'Notion content database', uitleg: 'Alle velden, alle 8 statusopties, Slug, SEO Meta Title en Description, opmerkingenveld, token als laatste invullen.', aanZet: 'Claude' },
  { nr: 11, fase: 'C', titel: 'WordPress', uitleg: 'REST test, post type, Yoast snippet, Cloudflare, opbouw check, schrijftest, fotomap delen met het n8n Google account.', aanZet: 'Claude' },
  { nr: 12, fase: 'C', titel: 'Databronnen en topics', uitleg: 'Seeds over de clusters, Search Console rij, eerste Topic Generator run, zoekwoorden naar natuurlijke taal, Akkoord in Telegram.', aanZet: 'Claude' },
  { nr: 13, fase: 'C', titel: 'Prestaties', uitleg: 'GA4 property ID en conversiedoelen, contact en boekpaden, portaalvlag performanceV2.', aanZet: 'Dylan' },
  { nr: 14, fase: 'C', titel: 'AI zichtbaarheid', uitleg: 'Meting aan, eigen merken, meetvragen laten maken (Claude start BA - AI Vragen Onderhoud) en de voorbeelden controleren.', aanZet: 'Claude' },
  { nr: 15, fase: 'C', titel: 'Portaal en login', uitleg: 'clients.js, Render variabelen, login voor de klant, modules aan.', aanZet: 'Claude' },
  { nr: 16, fase: 'D', titel: 'Controles vooraf', uitleg: 'Lussen versie 3, OpenAI parameters, Interne Linking, credentials gekoppeld.', aanZet: 'Claude' },
  { nr: 17, fase: 'D', titel: 'Testblog', uitleg: 'Genereren, QA Gate, WordPress draft, Yoast, afbeelding, interne links, tekst in het portaal, Feedback Revisie, Publicatie Sync.', aanZet: 'Claude' },
  { nr: 18, fase: 'D', titel: 'Eerste blog door Dylan gecontroleerd', uitleg: 'In het portaal, voordat de klant een mail krijgt.', aanZet: 'Dylan' },
  { nr: 19, fase: 'E', titel: 'Live zetten', uitleg: 'Mailadres van de klant invullen, status actief, intake op Afgerond, schakelaar Prestaties aan na minstens 1 gepubliceerde blog.', aanZet: 'Claude' },
  { nr: 20, fase: 'E', titel: 'Eerste week', uitleg: 'Telegram fouten, Prestaties na de eerste nacht, AI schakelaar aan na de eerste maandag.', aanZet: 'Claude' },
  { nr: 21, fase: 'E', titel: 'Eerste maand', uitleg: 'Maandrapport op de 4e, Effect Meting en Page Enrichment doen mee, klant ontvangt de uitleg.', aanZet: 'Claude' }
];

const STATUSSEN = ['Nog niet gestart', 'Bezig', 'Wacht op Dylan', 'Wacht op klant', 'Klaar', 'Overgeslagen'];

module.exports = { FASEN, STAPPEN, STATUSSEN };
