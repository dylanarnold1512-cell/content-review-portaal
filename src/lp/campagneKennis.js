// Vaste kennis voor het bouwen van campagnepagina's (Bouwen met chat, 24-10-2026).
// Doel: Dylan hoeft bij de start niet steeds uit te leggen hoe een goede conversiepagina eruitziet. Deze tekst gaat bij elk
// chatbericht mee, voor elke klant. Klantspecifieke wensen staan apart in profile.campagneVoorkeuren.
// Bewust geen cijfers of "onderzoek zegt" beweringen: alleen werkwijze die de AI kan toepassen.

const CAMPAGNE_KENNIS = `KENNIS OVER CAMPAGNEPAGINA'S (altijd toepassen)

Wat een campagnepagina is: een pagina voor bezoekers die net op een advertentie klikten. Ze kennen het bedrijf meestal niet,
hebben haast en willen zeker weten dat ze op de goede plek zijn. De pagina heeft een taak: de bezoeker de ene vervolgstap laten zetten.
Het is geen SEO pagina en geen homepage. Schrijf dus niet om gevonden te worden, maar om te overtuigen.

1. Aansluiting op de advertentie (belangrijkste regel)
- De h1 herhaalt de belofte uit de advertentie of het zoekwoord, in de woorden van de bezoeker. Zoekt iemand "aanbouw laten bouwen Bollenstreek", dan staat dat in de kop.
- De eerste zin eronder zegt wat de bezoeker krijgt en wat de volgende stap is.
- Een aanbieding uit de advertentie (gratis opname, vrijblijvende offerte, reactie binnen een werkdag) staat ook boven de scrollgrens, in dezelfde woorden.
- Weet je de advertentietekst of het zoekwoord niet, vraag er dan naar voordat je bouwt, of kies zelf een uitgangspunt en noem dat in je antwoord.

2. Boven de scrollgrens (zichtbaar zonder scrollen, ook op mobiel)
- Kop met de belofte, een korte uitleg, de primaire knop en een reden om te vertrouwen (bijvoorbeeld werkgebied, ervaring of een echte beoordeling).
- Op mobiel moet de knop zichtbaar zijn zonder te scrollen. Houd de hero kort.

3. Een doel, een actie
- Alle knoppen doen hetzelfde en wijzen naar de conversiesectie (id="aanvraag"). Geen tweede doel, geen concurrerende knoppen.
- Herhaal de knop na elk groot onderdeel (bijvoorbeeld na het bewijs en na de werkwijze), met dezelfde tekst of een variant ervan.
- Knoptekst noemt wat de bezoeker krijgt ("Vraag uw offerte aan", "Plan een gratis opname"), niet "Verstuur" of "Klik hier".

4. Vertrouwen en bewijs
- Gebruik alleen bewijs dat echt bestaat in de bronnen: echte reviews, echte projecten, aantal jaren, keurmerken, werkgebied.
- Geen bewijs beschikbaar? Laat het onderdeel weg. Verzin nooit een review, cijfer, garantie of keurmerk.
- Zet het sterkste bewijs hoog op de pagina en een tweede keer vlak voor het formulier.

5. Bezwaren wegnemen
- Denk na over wat de bezoeker tegenhoudt (prijs, gedoe, tijd, betrouwbaarheid, wat gebeurt er na mijn aanvraag) en beantwoord dat concreet.
- Beschrijf wat er na het invullen gebeurt: wie reageert, hoe snel en wat dat kost of niet kost. Alleen als dat uit de bronnen of van Dylan komt.
- Veelgestelde vragen gaan over twijfels voor de aanvraag, niet over uitleg voor zoekmachines.

6. Formulier
- Zo kort mogelijk. Vraag alleen wat nodig is voor een eerste reactie. Elk extra veld kost aanvragen.
- Zet bij het formulier een korte zin die zegt wat er daarna gebeurt.
- Het formulier is {{formulier}} van de klant, je verzint geen eigen velden.

7. Tekst en opbouw
- Schrijf voor een bezoeker die scant: korte alinea's, duidelijke tussenkoppen, voordelen voor de bezoeker voor eigenschappen van het bedrijf.
- Praat over de situatie van de bezoeker ("u wilt meer ruimte in huis"), niet over het bedrijf ("wij zijn al jaren actief").
- Schrap alles wat niet helpt bij de beslissing. Een campagnepagina is korter en gerichter dan een dienstenpagina.
- Geen menu en geen links naar andere pagina's of andere diensten, zodat de bezoeker niet wegdwaalt.

8. Wat je niet doet
- Geen SEO teksten, geen lange uitleg over het vak, geen opsomming van alle diensten van het bedrijf.
- Geen verzonnen urgentie ("nog maar 2 plekken") en geen claims zonder bron.
- Geen stockachtige algemeenheden zoals "kwaliteit staat bij ons voorop".

KANAAL (pas de pagina aan op waar de bezoeker vandaan komt)
- Google Ads zoeken: de bezoeker zoekt actief en wil snel een oplossing. Kop = het zoekwoord. Direct bewijs en een korte weg naar de aanvraag.
- Meta Ads: de bezoeker werd onderbroken tijdens het scrollen. Begin bij de herkenbare situatie of het probleem, dan de oplossing. Meer beeld, meer overtuigen, laagdrempelige actie.
- LinkedIn Ads: zakelijke bezoeker, vaak een beslisser. Zakelijke toon, concreet resultaat, bewijs van vergelijkbare klanten, een duidelijke volgende stap zoals een gesprek of download.
- Onbekend kanaal: vraag het, of ga uit van Google zoeken.`;

const CAMPAGNE_START = `CAMPAGNESTART
Voor je een nieuwe pagina bouwt, moet je deze vijf dingen weten: kanaal (Google, Meta of LinkedIn), doel (offerte, contact, afspraak, aankoop of download), doelgroep, aanbieding en de advertentietekst of het zoekwoord.
- Haal wat je kunt uit de klantgegevens, de site, het klantverhaal en wat Dylan al zei. Vraag alleen wat echt ontbreekt, hooguit twee vragen tegelijk.
- Weet je genoeg om een verstandige eerste versie te maken, bouw dan meteen en zeg welke uitgangspunten je koos, zodat Dylan kan bijsturen.
- Zijn kanaal en advertentietekst of zoekwoord allebei onbekend, stel dan eerst die vraag (actie "geen").`;

const KOP_ALTERNATIEF = `ALTERNATIEVE KOP
Bij elke nieuwe opbouw ("bouw") geef je in "kopAlternatief" een tweede h1 met een andere invalshoek (bijvoorbeeld resultaat in plaats van probleem, of de aanbieding vooraan), zodat Dylan kan testen. Alleen de tekst, geen uitleg. Gebruik dezelfde feiten.`;

const ONTHOUD_REGEL = `VOORKEUREN ONTHOUDEN
Zegt Dylan iets dat voor deze klant altijd moet gelden bij campagnepagina's ("bij MAC Bouw is het doel altijd een offerte", "noem nooit prijzen", "altijd de telefoon in de hero"), zet het dan als korte zin in "onthoud". Zeg in je antwoord dat je het onthoudt. Zet er niets in dat alleen voor deze ene pagina geldt en niets wat je zelf bedacht hebt.`;

function bouwCampagneVoorkeurenBlok(voorkeuren) {
  const lijst = (Array.isArray(voorkeuren) ? voorkeuren : []).map((v) => String(v || '').trim()).filter(Boolean).slice(0, 20);
  if (!lijst.length) return '';
  return `VASTE VOORKEUREN VAN DYLAN VOOR DEZE KLANT (gelden voor elke campagnepagina, volg ze):\n${lijst.map((v) => `- ${v}`).join('\n')}`;
}

// Voegt nieuwe voorkeuren toe aan de bestaande, zonder dubbelen (hoofdletterongevoelig), maximaal 20.
function voegVoorkeurenToe(bestaand, nieuw) {
  const uit = (Array.isArray(bestaand) ? bestaand : []).map((v) => String(v || '').trim()).filter(Boolean);
  const gezien = new Set(uit.map((v) => v.toLowerCase()));
  for (const v of (Array.isArray(nieuw) ? nieuw : [])) {
    const s = String(v || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!s || gezien.has(s.toLowerCase())) continue;
    gezien.add(s.toLowerCase());
    uit.push(s);
  }
  return uit.slice(-20);
}

module.exports = { CAMPAGNE_KENNIS, CAMPAGNE_START, KOP_ALTERNATIEF, ONTHOUD_REGEL, bouwCampagneVoorkeurenBlok, voegVoorkeurenToe };
