// LP Fabriek: het klantverhaal per klant (Dylan, 19-10-2026).
//
// Aanleiding: de pagina's van MAC Bouw herhaalden steeds dezelfde boodschap ("in de werkplaats voorbereid, vaak binnen een
// dag wind en waterdicht" stond meer dan tien keer op een pagina), klonken afstandelijk (de bedrijfsnaam voluit, "het bedrijf
// kan") en hadden geen verhaallijn. De AI kreeg ruwe sitetekst en pakte daar de algemene zinnen uit. De goede inhoud stond
// wel op de site: de eigenaar die zich voorstelt, klanten die vertellen waarom ze tevreden zijn, echte projecten.
//
// Het klantverhaal ordent de site eenmalig per klant tot vaste bouwstenen, elk met een bron:
//   stem (je of u, kenmerken, voorbeeldzinnen van de site zelf), gezicht, waarom klanten kiezen, twijfels met het antwoord,
//   bewijs (reviews en projecten), werkwijze, wat niet gebruikt mag worden, tegenstrijdigheden en wat de site niet vertelt.
// De AI doet een voorstel. Elk onderdeel moet een LETTERLIJK citaat van een gelezen pagina hebben, anders wordt het
// automatisch weggehaald (controleerVoorstel). Dylan controleert en keurt het een keer goed. Pas een goedgekeurd klantverhaal
// gaat mee naar Content genereren (bouwKlantverhaalBlok). Het klantverhaal staat in het klantprofiel (Notion, klantgegevens.js).
//
// Dit bestand laadt ai.js niet bovenaan (ai.js laadt dit bestand), de AI aanroep wordt pas bij gebruik opgehaald.

const { haalSiteTeksten, formatSiteTekstenVoorPrompt, normaliseerUrl } = require('./siteTeksten');
const { waarschuwingGefilterd } = require('./bronFilter');

const EIGEN = 'eigen aanvulling';
const BEWIJS_SOORTEN = ['review', 'project', 'ervaring', 'cijfer'];
const MAX = { kenmerken: 5, voorbeeldzinnen: 6, waaromKiezen: 8, twijfels: 10, bewijs: 12, werkwijze: 8, nietGebruiken: 12, tegenstrijdig: 8, ontbreekt: 12 };

const tekst = (v, max = 500) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const lijstVan = (v) => (Array.isArray(v) ? v : []);

function eerste(t) { return tekst(t, 40) || 'onbekend onderdeel'; }

function heeftBron(item, sectie, naam) {
  const bron = tekst(item.bron, 300);
  if (!bron) throw new Error(`Klantverhaal, ${sectie}: "${eerste(naam)}" heeft nog geen bron. Vul de pagina van de site in, of "${EIGEN}" als je het zelf toevoegt.`);
  return bron;
}

// Maakt van alles wat van buiten komt (het scherm of de AI) een nette, begrensde structuur. Gooit bij een onderdeel zonder bron.
function schoonKlantverhaal(invoer) {
  if (!invoer || typeof invoer !== 'object') return null;
  const uit = { versie: 1, status: invoer.status === 'goedgekeurd' ? 'goedgekeurd' : 'concept' };
  uit.bijgewerkt = /^\d{4}-\d{2}-\d{2}$/.test(String(invoer.bijgewerkt || '')) ? invoer.bijgewerkt : new Date().toISOString().slice(0, 10);

  const s = invoer.stem || {};
  uit.stem = {
    aanspreekvorm: s.aanspreekvorm === 'u' ? 'u' : 'je',
    kenmerken: lijstVan(s.kenmerken).map((k) => tekst(k, 60)).filter(Boolean).slice(0, MAX.kenmerken),
    voorbeeldzinnen: lijstVan(s.voorbeeldzinnen).map((z) => ({ tekst: tekst(z && z.tekst, 300), bron: tekst(z && z.bron, 300) }))
      .filter((z) => z.tekst).map((z) => ({ tekst: z.tekst, bron: heeftBron(z, 'voorbeeldzinnen', z.tekst) })).slice(0, MAX.voorbeeldzinnen)
  };

  const g = invoer.gezicht;
  if (g && (tekst(g.naam) || tekst(g.tekst))) {
    uit.gezicht = { naam: tekst(g.naam, 80), rol: tekst(g.rol, 80), tekst: tekst(g.tekst, 600), bron: heeftBron(g, 'gezicht', g.naam || g.tekst), citaat: tekst(g.citaat, 300) };
  } else {
    uit.gezicht = null;
  }

  const sectie = (sleutel, velden, kern) => lijstVan(invoer[sleutel])
    .map((i) => {
      const item = {};
      velden.forEach(([veld, max]) => { item[veld] = tekst(i && i[veld], max); });
      item.bron = tekst(i && i.bron, 300);
      item.citaat = tekst(i && i.citaat, 300);
      return item;
    })
    .filter((i) => i[kern])
    .map((i) => ({ ...i, bron: heeftBron(i, sleutel, i[kern]) }))
    .slice(0, MAX[sleutel]);

  uit.waaromKiezen = sectie('waaromKiezen', [['punt', 120], ['uitleg', 500]], 'punt');
  uit.twijfels = sectie('twijfels', [['twijfel', 160], ['antwoord', 500]], 'twijfel');
  uit.bewijs = sectie('bewijs', [['soort', 12], ['wie', 80], ['tekst', 700]], 'tekst').map((b) => ({ ...b, soort: BEWIJS_SOORTEN.includes(b.soort) ? b.soort : 'ervaring' }));
  uit.werkwijze = sectie('werkwijze', [['stap', 100], ['uitleg', 400]], 'stap');

  uit.nietGebruiken = lijstVan(invoer.nietGebruiken).map((n) => ({ tekst: tekst(n && n.tekst, 200), reden: tekst(n && n.reden, 200) })).filter((n) => n.tekst).slice(0, MAX.nietGebruiken);

  uit.tegenstrijdig = lijstVan(invoer.tegenstrijdig).map((t) => ({
    onderwerp: tekst(t && t.onderwerp, 100),
    waarden: lijstVan(t && t.waarden).map((w) => ({ waarde: tekst(w && w.waarde, 150), bron: tekst(w && w.bron, 300) })).filter((w) => w.waarde),
    gekozen: tekst(t && t.gekozen, 150)
  })).filter((t) => t.onderwerp && t.waarden.length >= 1).slice(0, MAX.tegenstrijdig);

  uit.ontbreekt = lijstVan(invoer.ontbreekt).map((o) => tekst(o, 200)).filter(Boolean).slice(0, MAX.ontbreekt);

  if (uit.status === 'goedgekeurd' && !klantverhaalHeeftInhoud(uit)) {
    throw new Error('Een leeg klantverhaal kan niet worden goedgekeurd. Vul eerst iets in of laat het van de website analyseren.');
  }
  return uit;
}

function klantverhaalHeeftInhoud(kv) {
  if (!kv) return false;
  return Boolean((kv.gezicht && (kv.gezicht.naam || kv.gezicht.tekst)) || (kv.waaromKiezen || []).length || (kv.twijfels || []).length || (kv.bewijs || []).length || (kv.werkwijze || []).length || ((kv.stem || {}).voorbeeldzinnen || []).length);
}

// ---- Controle van het AI voorstel: alles moet letterlijk op de site staan ----

function normTekst(t) {
  return String(t || '').toLowerCase().replace(/[‘’“”"'`´]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Een citaat mag stukken overslaan met "..." ertussen. Elk stuk van minstens 12 tekens moet letterlijk in de pagina staan.
function citaatStaatIn(paginaNorm, citaat) {
  const delen = String(citaat || '').split(/\.\.\.|…/).map(normTekst).filter((d) => d.length >= 12);
  if (!delen.length) return false;
  return delen.every((d) => paginaNorm.includes(d));
}

// Zoekt de pagina waar het citaat staat. Eerst de opgegeven bron, daarna alle andere pagina's.
function vindBron(paginas, citaat, bron) {
  const wens = normaliseerUrl(bron || '', 'https://x.invalid/');
  const volgorde = [...paginas].sort((a, b) => (normaliseerUrl(b.url, b.url) === wens) - (normaliseerUrl(a.url, a.url) === wens));
  const gevonden = volgorde.find((p) => citaatStaatIn(p.norm, citaat));
  return gevonden ? gevonden.url : null;
}

function meetAanspreekvorm(paginas) {
  const alles = (paginas || []).map((p) => p.tekst || '').join('\n');
  const tel = (re) => (alles.match(re) || []).length;
  const je = tel(/\b(je|jij|jouw|jou|jullie)\b/gi);
  const u = tel(/\b(u|uw)\b/g);
  return { je, u, advies: u > je ? 'u' : 'je' };
}

function controleerVoorstel(ruw, paginasRuw) {
  const paginas = (paginasRuw || []).map((p) => ({ url: p.url, titel: p.titel, tekst: p.tekst, norm: normTekst(p.tekst) }));
  const waarschuwingen = [];
  const weggehaald = [];
  const r = ruw && typeof ruw === 'object' ? ruw : {};

  const controleer = (item, citaatVeld, naam) => {
    const citaat = tekst(item && item[citaatVeld], 300);
    const bron = citaat ? vindBron(paginas, citaat, item && item.bron) : null;
    if (!bron) { weggehaald.push(tekst(naam, 60)); return null; }
    return { ...item, bron, citaat };
  };
  const lijstControle = (sleutel, kern) => lijstVan(r[sleutel]).map((i) => controleer(i, 'citaat', i && i[kern])).filter(Boolean);

  const stem = r.stem || {};
  const voorbeeldzinnen = lijstVan(stem.voorbeeldzinnen).map((z) => controleer({ ...z, citaat: z && z.tekst }, 'citaat', z && z.tekst)).filter(Boolean).map((z) => ({ tekst: z.tekst, bron: z.bron }));
  const gezicht = r.gezicht ? controleer(r.gezicht, 'citaat', r.gezicht.naam) : null;

  const tegenstrijdig = lijstVan(r.tegenstrijdig).map((t) => {
    const waarden = lijstVan(t && t.waarden).map((w) => {
      const gecontroleerd = controleer(w, 'citaat', `${t.onderwerp}: ${w && w.waarde}`);
      return gecontroleerd ? { waarde: gecontroleerd.waarde, bron: gecontroleerd.bron } : null;
    }).filter(Boolean);
    return waarden.length >= 2 ? { onderwerp: t.onderwerp, waarden, gekozen: '' } : null;
  }).filter(Boolean);

  const meting = meetAanspreekvorm(paginas);
  const voorstel = schoonKlantverhaal({
    status: 'concept',
    stem: { aanspreekvorm: meting.advies, kenmerken: stem.kenmerken, voorbeeldzinnen },
    gezicht,
    waaromKiezen: lijstControle('waaromKiezen', 'punt'),
    twijfels: lijstControle('twijfels', 'twijfel'),
    bewijs: lijstControle('bewijs', 'tekst'),
    werkwijze: lijstControle('werkwijze', 'stap'),
    nietGebruiken: r.nietGebruiken,
    tegenstrijdig,
    ontbreekt: r.ontbreekt
  });

  if (weggehaald.length) {
    waarschuwingen.push(`${weggehaald.length} onderdeel${weggehaald.length === 1 ? '' : 'en'} weggelaten omdat het citaat niet letterlijk op de site staat (${weggehaald.slice(0, 5).join(', ')}${weggehaald.length > 5 ? ', ...' : ''}).`);
  }

  // Wat de site niet vertelt: wat de AI meldde, aangevuld met een controle die niet van de AI afhangt.
  const ontbreekt = [...voorstel.ontbreekt];
  const voegToe = (t) => { if (!ontbreekt.includes(t)) ontbreekt.push(t); };
  if (!voorstel.gezicht) voegToe('Geen persoon of gezicht gevonden op de site (eigenaar of vaste contactpersoon).');
  if (!voorstel.waaromKiezen.length) voegToe('Geen concrete redenen gevonden waarom klanten voor dit bedrijf kiezen.');
  if (!voorstel.twijfels.length) voegToe('Geen antwoorden gevonden op twijfels van klanten (kosten, planning, overlast, vergunning).');
  if (!voorstel.bewijs.length) voegToe('Geen reviews of projecten gevonden.');
  if (voorstel.werkwijze.length < 2) voegToe('De werkwijze is niet in stappen beschreven.');
  if (voorstel.stem.voorbeeldzinnen.length < 2) voegToe('Te weinig voorbeeldzinnen om de toon van het bedrijf te beschrijven.');
  voorstel.ontbreekt = ontbreekt.slice(0, MAX.ontbreekt);

  return { voorstel, waarschuwingen, aanspreekMeting: meting };
}

// ---- Prompt en analyse ----

const KLANTVERHAAL_SYSTEEMPROMPT = `Je bent een tekstredacteur bij een marketingbureau. Je stelt het "klantverhaal" van een bedrijf op: de vaste rode draad waarmee alle landingspagina's van dit bedrijf worden geschreven. Je krijgt de teksten van de eigen website van het bedrijf en haalt er alleen uit wat er echt staat.

REGELS DIE ALTIJD GELDEN
- Elk onderdeel heeft een "bron" (de exacte URL uit de kop van de pagina waar het staat) en een "citaat": een LETTERLIJK stuk tekst van die pagina, hooguit 30 woorden, zonder iets te veranderen. Je mag stukken overslaan met "...". Een onderdeel zonder kloppend citaat wordt automatisch verwijderd.
- Verzin niets. Geen cijfers, jaartallen, garanties, certificeringen, prijzen of namen die er niet staan. Staat er voor een onderdeel niets op de site, laat de lijst dan leeg en zet in "ontbreekt" wat je mist.
- Reclameclaims zonder bewijs (bijvoorbeeld "100% betrouwbaarheid", "talloze succesvolle projecten", "hoogwaardige kwaliteit", "meesterwerk", "excellentie in elk detail") zijn GEEN reden om te kiezen en GEEN bewijs. Zet ze bij "nietGebruiken".
- Schrijf eenvoudig Nederlands. Gebruik geen streepjes als leesteken in je eigen zinnen.

ANTWOORD ALLEEN MET JSON, exact deze velden:
{
  "stem": {
    "kenmerken": ["3 of 4 korte kenmerken van hoe dit bedrijf klinkt, zoals praktisch, direct, persoonlijk"],
    "voorbeeldzinnen": [{ "tekst": "LETTERLIJKE zin van de site", "bron": "url" }]
  },
  "gezicht": { "naam": "", "rol": "", "tekst": "wat deze persoon zelf over zijn of haar werk en achtergrond zegt, zonder iets toe te voegen", "bron": "url", "citaat": "letterlijk" },
  "waaromKiezen": [{ "punt": "korte kop", "uitleg": "een of twee zinnen in eigen woorden", "bron": "url", "citaat": "letterlijk" }],
  "twijfels": [{ "twijfel": "de zorg van de klant als vraag", "antwoord": "wat het bedrijf erover zegt", "bron": "url", "citaat": "letterlijk" }],
  "bewijs": [{ "soort": "review of project of ervaring of cijfer", "wie": "naam of plaats als de site die noemt", "tekst": "bij een review de reviewtekst LETTERLIJK, bij een project wat er gedaan is", "bron": "url", "citaat": "letterlijk" }],
  "werkwijze": [{ "stap": "korte kop", "uitleg": "een of twee zinnen", "bron": "url", "citaat": "letterlijk" }],
  "nietGebruiken": [{ "tekst": "de claim letterlijk zoals op de site", "reden": "waarom dit niet bruikbaar is" }],
  "tegenstrijdig": [{ "onderwerp": "bijvoorbeeld jaar van oprichting", "waarden": [{ "waarde": "2014", "bron": "url", "citaat": "letterlijk" }, { "waarde": "2012", "bron": "url", "citaat": "letterlijk" }] }],
  "ontbreekt": ["wat de site niet vertelt maar wat overtuigende pagina's nodig hebben"]
}

WAT BIJ WELK VELD HOORT
- voorbeeldzinnen: 3 tot 5 zinnen die het best laten horen hoe dit bedrijf zelf praat: persoonlijk, concreet, met wij en jij of u, geen reclametaal. Kies liever een zin die iets zegt dan een slogan.
- gezicht: de eigenaar, oprichter of vaste contactpersoon als die op de site staat. Anders null.
- waaromKiezen: 3 tot 6 concrete redenen die de site echt noemt.
- twijfels: zorgen die klanten bij dit soort werk hebben (kosten, planning, overlast, vergunning, kwaliteit, communicatie, eerste keer verbouwen of laten plaatsen) waarop de site een antwoord geeft. Neem er alleen een op als de site er iets over zegt.
- bewijs: echte reviews, echte projecten, en ervaring of cijfers die er exact zo staan.
- werkwijze: de stappen of afspraken in hoe het bedrijf werkt, zoals de site ze noemt.
- tegenstrijdig: dingen die de site op verschillende plekken verschillend zegt, zoals het jaar van oprichting of het aantal jaren ervaring.
- Teksten die duidelijk niet bij het bedrijf horen (spam, demotekst van een thema, een andere taal) negeer je.`;

function bouwKlantverhaalUserPrompt({ bedrijfsnaam, url, siteTekst }) {
  return `Bedrijf: ${bedrijfsnaam || '(onbekend)'}\nWebsite: ${url || ''}\n\nTeksten van de website. Elke pagina begint met een regel "--- titel (url) ---". Gebruik die url als "bron":\n\n${siteTekst}`;
}

// Leest de site en maakt een voorstel. Slaat niets op. Gooit een duidelijke fout als de site niet te lezen is.
async function bouwKlantverhaalVoorstel({ url, bedrijfsnaam, uitsluit, taal, callAi, haalTeksten } = {}) {
  const lees = haalTeksten || haalSiteTeksten;
  const site = await lees({ url, uitsluit, taal });
  if (!site || !Array.isArray(site.paginas) || !site.paginas.length) {
    throw new Error(`De website kon niet gelezen worden (${(site && site.fout) || 'geen pagina\'s gevonden'}). Controleer de website van de klant bij Bedrijf.`);
  }
  const ai = callAi || require('./ai').callOpenAi;
  const ruw = await ai({
    systemPrompt: KLANTVERHAAL_SYSTEEMPROMPT,
    userPrompt: bouwKlantverhaalUserPrompt({ bedrijfsnaam, url, siteTekst: formatSiteTekstenVoorPrompt(site) })
  });
  const { voorstel, waarschuwingen, aanspreekMeting } = controleerVoorstel(ruw, site.paginas);
  const gefilterd = (site.gefilterd || []).map((g) => ({ url: g.url, titel: g.titel, regel: g.regel, reden: g.reden }));
  const filterMelding = waarschuwingGefilterd(gefilterd);
  if (filterMelding) waarschuwingen.push(filterMelding);
  return {
    voorstel,
    waarschuwingen,
    aanspreekMeting,
    gefilterd,
    gelezen: site.paginas.map((p) => ({ url: p.url, titel: p.titel, woorden: String(p.tekst).split(/\s+/).filter(Boolean).length }))
  };
}

// ---- Naar de AI van Content genereren ----

// Regels voor de opbouw van elke pagina, ook als er (nog) geen klantverhaal is. Staat in de systeemprompt van generatePageContent.
const PAGINA_OPBOUW_REGELS = `OPBOUW VAN DE PAGINA (rode draad voor elke klant):
- Elke sectie heeft een eigen taak in het verhaal van de bezoeker: herkenning en belofte (hero), wat we voor je doen (diensten of aanbod), waarom bij ons, zo gaat het (werkwijze), bewijs (reviews en projecten), twijfels weg (veelgestelde vragen), actie (formulier). Een sectie herhaalt niet wat een eerdere al zei, maar bouwt erop voort.
- Een feit of voordeel staat op hooguit twee plekken: een keer uitgebreid en hooguit een keer kort terug (bijvoorbeeld in de hero en bij de veelgestelde vragen). Geef elk voordeel een eigen onderwerp en eigen woorden: vier voordelen die dezelfde reden herhalen zijn een voordeel.
- Vertel bij een voordeel wat het voor de bezoeker betekent (rust, tijd, zekerheid), niet alleen wat het bedrijf doet. Spreek de bezoeker direct aan en schrijf als een persoon, niet als een brochure. Gebruik niet steeds de bedrijfsnaam voluit.
- Staat bij het gezicht of bij het bewijs een zin van de eigenaar zelf in de ik-vorm (bijvoorbeeld "Met meer dan 20 jaar ervaring heb ik..."), gebruik die dan letterlijk als citaat met naam, bijvoorbeeld in de hero of bij waarom klanten kiezen. Zet zo'n zin NOOIT in een reviewblok: reviews zijn alleen uitspraken van klanten, niet van het bedrijf zelf. Laat ook geen echte review weg om ruimte te maken.
- Redenen om te kiezen haal je uit wat klanten zelf zeggen in reviews (bijvoorbeeld duidelijke communicatie, dagelijks doorwerken, netjes opgeleverd) en uit het gezicht van het bedrijf. "Sinds jaartal" of "ervaren" is op zichzelf geen reden en staat hooguit een keer kort op de pagina.
- Geen lege woorden zoals "hoogwaardig", "professioneel", "kwaliteit" of "excellentie" zonder dat er een concreet feit achter staat.
- Wissel op een pagina niet tussen "je" en "u".
- Hero en antwoordblok: gebruik hier de bedrijfsnaam niet. Open met de situatie of vraag van de bezoeker ("Wil je...", "Heb je...") en zeg direct daarna in "wij" wat jullie voor die vraag doen. Dus niet "Bedrijf X helpt je met...".
- Een badge of label op een foto (bijvoorbeeld heroBadgeTitle en heroBadgeText) is een kort, hard feit: een jaartal, een aantal jaren ervaring, een werkgebied of een beoordeling. Zet er nooit de introductie van een persoon in ("Mitchell, eigenaar"), want op de foto staat die persoon niet.
- Een bijschrift bij een foto (heroImageCaption) vertelt in een korte zin wat jullie doen of wat het sterke punt is, bijvoorbeeld "Verbouw, renovatie en onderhoud in Hillegom". Het is geen naam of functie van een persoon.
- Elke zin zegt iets nieuws. Schrijf geen vulzinnen die alleen herhalen wat er al staat, zoals "Dat maakt dit onderdeel van ons brede aanbod".
- Beweer niets wat niet in de feiten, het klantverhaal of de bronteksten staat. Verzin dus geen beloften zoals "vast aanspreekpunt" of "van begin tot eind begeleiden".
- Praktische gegevens (adres, telefoon, werkgebied, soorten projecten) zijn korte feiten. Neem geen reclamezinnen uit de website over ("wij hebben de expertise en ervaring...").
- Schrijf correct Nederlands: "kies een werkzaamheid of combineer er meerdere", "een compleet tuinhuis".`;

function bouwKlantverhaalBlok(kv, { bedrijfsnaam } = {}) {
  if (!kv || kv.status !== 'goedgekeurd' || !klantverhaalHeeftInhoud(kv)) return '';
  const naam = bedrijfsnaam || 'het bedrijf';
  const stem = kv.stem || {};
  const u = stem.aanspreekvorm === 'u';
  const delen = [];
  delen.push(`KLANTVERHAAL (door de opdrachtgever goedgekeurd, dit is de rode draad van de hele pagina; gebruik alleen wat hier of in de bronteksten staat):`);

  const stemRegels = [
    `- Spreek de bezoeker aan met "${u ? 'u' : 'je'}" en praat als bedrijf over jezelf met "wij" of "we". Wissel nooit tussen "je" en "u".`,
    `- Noem de bedrijfsnaam "${naam}" hooguit een keer voluit, in de eerste alinea. Daarna "wij", "we" of "ons".`
  ];
  if ((stem.kenmerken || []).length) stemRegels.push(`- De toon is ${stem.kenmerken.join(', ')}.`);
  if ((stem.voorbeeldzinnen || []).length) stemRegels.push(`- Zo praat dit bedrijf zelf (letterlijk van de eigen site). Dit is de stem van de klant zelf. Gebruik de beste van deze zinnen vrijwel letterlijk in de hero of bij waarom klanten kiezen (ze komen van de eigen site, dus het zijn echte feiten en echte woorden). Schrijf de rest van de pagina in dezelfde toon:\n${stem.voorbeeldzinnen.map((z) => `  * ${z.tekst}`).join('\n')}`);
  delen.push(`STEM\n${stemRegels.join('\n')}`);

  if (kv.gezicht && (kv.gezicht.naam || kv.gezicht.tekst)) {
    delen.push(`GEZICHT (maak de pagina persoonlijk, noem deze persoon waar dat natuurlijk past, bijvoorbeeld bij het advies of de werkwijze)\n- ${[kv.gezicht.naam, kv.gezicht.rol].filter(Boolean).join(', ')}${kv.gezicht.tekst ? `: ${kv.gezicht.tekst}` : ''}`);
  }
  if ((kv.waaromKiezen || []).length) delen.push(`WAAROM KLANTEN KIEZEN (gebruik elk punt hooguit een keer uitgebreid)\n${kv.waaromKiezen.map((w) => `- ${w.punt}${w.uitleg ? `: ${w.uitleg}` : ''}`).join('\n')}`);
  if ((kv.twijfels || []).length) delen.push(`TWIJFELS VAN KLANTEN EN HET ANTWOORD (laat de pagina deze zorgen beantwoorden voordat de bezoeker ze hoeft te stellen)\n${kv.twijfels.map((t) => `- ${t.twijfel}${t.antwoord ? ` Antwoord: ${t.antwoord}` : ''}`).join('\n')}`);
  if ((kv.bewijs || []).length) delen.push(`BEWIJS (echte reviews en projecten; reviews neem je letterlijk over en alleen items met soort "review" horen in een reviewblok; neem alle reviews mee)\n${kv.bewijs.map((b) => `- ${b.soort}${b.wie ? ` (${b.wie})` : ''}: ${b.tekst}`).join('\n')}`);
  if ((kv.werkwijze || []).length) delen.push(`WERKWIJZE\n${kv.werkwijze.map((w) => `- ${w.stap}${w.uitleg ? `: ${w.uitleg}` : ''}`).join('\n')}`);
  const gekozen = (kv.tegenstrijdig || []).filter((t) => t.gekozen);
  const open = (kv.tegenstrijdig || []).filter((t) => !t.gekozen);
  if (gekozen.length || open.length) {
    delen.push(`TEGENSTRIJDIGE GEGEVENS OP DE SITE\n${gekozen.map((t) => `- ${t.onderwerp}: gebruik "${t.gekozen}"`).join('\n')}${gekozen.length && open.length ? '\n' : ''}${open.map((t) => `- ${t.onderwerp}: de site zegt het op meerdere manieren (${t.waarden.map((w) => w.waarde).join(' of ')}). Noem dit onderwerp niet.`).join('\n')}`);
  }
  if ((kv.nietGebruiken || []).length) delen.push(`NIET GEBRUIKEN (lege of niet te bewijzen claims van de site)\n${kv.nietGebruiken.map((n) => `- ${n.tekst}`).join('\n')}`);
  delen.push(`Heb je voor een onderdeel van de pagina niets in het klantverhaal en niets in de bronteksten, maak het onderdeel dan korter in plaats van een algemene zin te schrijven.`);
  return delen.join('\n\n');
}

module.exports = {
  EIGEN,
  PAGINA_OPBOUW_REGELS,
  KLANTVERHAAL_SYSTEEMPROMPT,
  schoonKlantverhaal,
  klantverhaalHeeftInhoud,
  controleerVoorstel,
  meetAanspreekvorm,
  citaatStaatIn,
  normTekst,
  bouwKlantverhaalVoorstel,
  bouwKlantverhaalBlok
};
