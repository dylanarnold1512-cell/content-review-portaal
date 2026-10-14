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

// Stappen voor Pagr. (landingspagina's). Nr 101 en hoger, zodat ze naast de Blogr. stappen in dezelfde database staan.
// gedeeld: true betekent dat de stap bij Blogr. al bestaat. Bij Beide worden die niet dubbel aangemaakt.
const PAGR_STAPPEN = [
  { nr: 101, fase: 'A', titel: 'Websitescan en nieuwe klant', uitleg: 'Naam, id, omschrijving, taal en WordPress uit de homepage gehaald.', aanZet: 'Dylan', gedeeld: true },
  { nr: 102, fase: 'A', titel: 'Gegevens voor de pagina\'s', uitleg: 'WordPress login via een veilige route, aantal pagina\'s per maand, contactpersoon, formulier en foto\'s.', aanZet: 'Klant', gedeeld: true },
  { nr: 103, fase: 'B', titel: 'Merkprofiel en kennisdocument', uitleg: 'Wat de klant doet, voor wie, toon en regels. Wordt ook gebruikt voor de teksten van de pagina\'s.', aanZet: 'Claude', gedeeld: true },
  { nr: 104, fase: 'B', titel: 'Plan voor de pagina\'s', uitleg: 'Eerste planvoorstel in de Werkplaats: diensten en plaatsen met een reden. Pas bouwen na akkoord van Dylan.', aanZet: 'Dylan' },
  { nr: 105, fase: 'C', titel: 'Sjabloon', uitleg: 'Eerste sjabloon met echte tekst van de klant, controleren en op Actief zetten.', aanZet: 'Dylan' },
  { nr: 106, fase: 'C', titel: 'WordPress koppeling', uitleg: 'REST test, SEO plugin, formulier shortcode, mediabibliotheek en Cloudflare.', aanZet: 'Claude' },
  { nr: 107, fase: 'C', titel: 'Klantgegevens in de LP Fabriek', uitleg: 'Klant, feiten met bron en tokens toevoegen aan src/lp/clients, tot dit naar Notion verhuist.', aanZet: 'Claude' },
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
