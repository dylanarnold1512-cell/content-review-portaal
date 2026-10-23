// Bouwen met chat (23-10-2026). Dylan kiest een klant met een bestaand klantprofiel, beschrijft in een chat wat voor
// pagina hij wil (vaak een Ads-landingspagina) en de AI bouwt direct een volledige pagina: eigen sjabloon (HTML en CSS
// in de huisstijl van de klant) plus de echte teksten. Daarna stuurt Dylan bij in dezelfde chat. De AI kiest per
// bericht zelf wat er nodig is:
//   "geen"   alleen antwoorden (sparren, een vraag, advies), de pagina blijft gelijk
//   "tekst"  alleen teksten aanpassen (snel, het ontwerp blijft gelijk)
//   "bouw"   de pagina (opnieuw) opbouwen of de opbouw of vormgeving veranderen
// Het sjabloon en het gesprek staan in de pagina zelf (Notion sectie "Eigen sjabloon", zie eigenSjabloon.js), dus de
// pagina werkt daarna overal zoals elke andere pagina: voorbeeld, controle, deellink en als concept naar WordPress.

const MAX_BERICHTEN_IN_PROMPT = 16;
const MAX_BERICHTEN_BEWAARD = 60;
const ACTIES = ['geen', 'tekst', 'bouw'];
const IMAGE_SRC_RE = /imagesrc$/i;
const IMAGE_ALT_RE = /imagealt$/i;

function chatRegels({ heeftPagina, heeftFormulier }) {
  return `JE ROL
Je bouwt samen met Dylan, een online marketeer, een landingspagina voor een van zijn klanten. Vaak is het een pagina voor
Google Ads, Meta Ads of LinkedIn Ads: een pagina met een doel (offerte, contact, afspraak, aankoop of download) en zo min
mogelijk afleiding. Je bent tegelijk conversie copywriter en webdesigner. Je praat met Dylan in eenvoudig, kort Nederlands
en je denkt mee: zie je een betere aanpak, zeg het in een zin.

WAT JE PER BERICHT DOET (veld "actie")
- "bouw": ${heeftPagina ? 'de opbouw, de onderdelen of de vormgeving van de pagina moet veranderen (een onderdeel erbij of eraf, een andere volgorde, andere kleuren of layout). Geef dan het VOLLEDIGE nieuwe sjabloon en ALLE teksten terug. Laat alles waar het bericht niet over gaat zoals het was.' : 'er is nog geen pagina. Bouw meteen een volledige pagina zodra je weet over welke dienst of welk aanbod het gaat. Wacht niet op meer informatie: kies zelf verstandige uitgangspunten en noem ze kort in je antwoord, zodat Dylan ze kan bijsturen.'}
- "tekst": alleen teksten veranderen en het ontwerp blijft gelijk. Geef in "slotWijzigingen" alleen de slots die veranderen, met hun volledige nieuwe waarde (bij een lijst de hele lijst).
- "geen": Dylan stelt een vraag, wil sparren of je mist echt iets essentieels (bijvoorbeeld welke dienst). Antwoord dan alleen. Stel hooguit twee vragen tegelijk.

OPBOUW VAN EEN CONVERSIEPAGINA (standaard, tenzij Dylan iets anders vraagt)
1. Hero: een duidelijke belofte als h1, een korte uitleg, een primaire knop en een foto.
2. Vertrouwensbalk direct onder de hero: drie of vier korte punten, zoals werkgebied, werkwijze en de eerste stap.
3. Herkenbare situaties of diensten: waar de bezoeker nu staat en wat het bedrijf daarvoor doet.
4. Bewijs: projecten of foto's van eigen werk.
5. Werkwijze: van eerste contact tot resultaat, in drie tot vijf stappen.
6. Reviews: alleen echte reviews uit de bronnen. Zijn er geen echte reviews, laat dit onderdeel dan weg.
7. Veelgestelde vragen die twijfels wegnemen (kort, drie tot vijf vragen).
8. Conversiesectie met een kop, een korte intro${heeftFormulier ? ' en het formulier van de klant ({{formulier}}, op de volle breedte van de sectie)' : ' en een duidelijke knop (deze klant heeft nog geen formulier in het profiel)'}.
Een doel per pagina. Alle knoppen leiden naar dezelfde actie: zet "ctaHref" op "#aanvraag" en geef de conversiesectie id="aanvraag".
Geen menu, geen links naar andere pagina's en geen interne links: gebruik GEEN slot "linksItems". Een telefoonnummer alleen
prominent als Dylan daarom vraagt, en dan alleen het nummer uit de klantgegevens.

FOTO'S
Elke foto loopt via een slot (bijvoorbeeld heroImageSrc en heroImageAlt, of imageSrc en imageAlt in een lijst-item). Laat
de waarde van foto's LEEG in slotData: het systeem kiest zelf passende foto's uit de mediabibliotheek van de klant, en
foto's die al gekozen zijn blijven staan. Vraagt Dylan om een andere foto, zeg dan dat hij in het voorbeeld op de foto kan
klikken om er een te kiezen.

TEKSTEN
- Schrijf de echte teksten van de pagina, geen voorbeeldtekst. Gebruik alleen feiten uit de klantgegevens, het klantverhaal,
  de bronteksten van de site en wat Dylan in de chat zegt. Verzin geen cijfers, prijzen, garanties, jaartallen, plaatsen, reviews of namen.
- Schrijf concreet en persoonlijk, in de toon van de klant. Kort en scanbaar: een bezoeker uit een advertentie leest snel.
- Geen gedachtestreepjes en geen emoji in de teksten.
- metaTitle (50 tot 60 tekens) en metaDescription (120 tot 155 tekens) altijd invullen.

${heeftPagina ? 'Je krijgt hieronder de HUIDIGE pagina (sjabloon en teksten) en het gesprek tot nu toe. Ga uit van de huidige pagina.' : ''}`;
}

function antwoordFormaat() {
  return `ANTWOORD
Antwoord ALLEEN met een JSON-object, geen tekst erbuiten:
{
  "antwoord": string,       // je chatbericht aan Dylan: wat je gedaan hebt of je advies of vraag, hooguit vijf korte zinnen
  "actie": "bouw" | "tekst" | "geen",
  "titel": string,          // alleen bij "bouw": korte interne titel van de pagina, bijvoorbeeld "Ads: aanbouw Bollenstreek"
  "slug": string,           // alleen bij "bouw": korte url, kleine letters met koppeltekens
  "blueprint": object,      // alleen bij "bouw": het volledige sjabloon volgens het schema hierboven
  "slotData": object,       // alleen bij "bouw": per slot de echte tekst (of lijst van items), foto's leeg
  "slotWijzigingen": object // alleen bij "tekst": alleen de slots die veranderen
}`;
}

function bouwSysteemPrompt({ heeftPagina, heeftFormulier, deps }) {
  const ai = deps.ai;
  return `${chatRegels({ heeftPagina, heeftFormulier })}

${ai.ONTWERP_TOOLKIT}

${ai.SLOT_SCHEMA_REFERENCE}

${ai.SITE_BRON_REGELS}

${ai.VOLLEDIGE_ZINNEN_REGELS}

${antwoordFormaat()}`;
}

function feitenTekst(client) {
  const regels = ((client && client.feiten) || []).map((f) => `- ${f.label}: ${f.waarde}`).filter(Boolean);
  return regels.length ? `FEITEN VAN DE KLANT (met bron gecontroleerd, gebruik deze waar ze passen):\n${regels.join('\n')}` : '';
}

function gesprekTekst(berichten) {
  const laatste = (Array.isArray(berichten) ? berichten : []).slice(-MAX_BERICHTEN_IN_PROMPT);
  if (!laatste.length) return '';
  return `GESPREK TOT NU TOE:\n${laatste.map((b) => `${b.rol === 'ai' ? 'Jij' : 'Dylan'}: ${b.tekst}`).join('\n')}`;
}

async function bouwGebruikersPrompt({ klant, client, huidig, berichten, bericht, deps }) {
  const ai = deps.ai;
  const profiel = (client && client.profile) || {};
  const bedrijf = profiel.bedrijf || {};
  const [site, bronnen] = await Promise.all([
    ai.formatKlantSiteVoorPrompt(klant).catch(() => ''),
    ai.formatKlantBronnenVoorSjabloon(klant).catch(() => '')
  ]);
  const kv = profiel.klantverhaal;
  const kvBlok = deps.bouwKlantverhaalBlok ? deps.bouwKlantverhaalBlok(kv && kv.status === 'goedgekeurd' ? kv : null, { bedrijfsnaam: bedrijf.naam || profiel.naam }) : '';
  const delen = [
    `Klant: ${profiel.naam || klant}${bedrijf.naam ? ` (${bedrijf.naam})` : ''}`,
    bedrijf.telefoon ? `Telefoonnummer van de klant: ${bedrijf.telefoon}` : '',
    ai.formatBrandingForPrompt(klant),
    site,
    bronnen,
    feitenTekst(client),
    kvBlok
  ];
  if (huidig && huidig.blueprint) {
    delen.push(`HUIDIG SJABLOON:\n${JSON.stringify(huidig.blueprint)}`);
    delen.push(`HUIDIGE TEKSTEN (slotData):\n${JSON.stringify(huidig.slotData || {})}`);
  }
  delen.push(gesprekTekst(berichten));
  delen.push(`NIEUW BERICHT VAN DYLAN: ${bericht}`);
  return delen.filter((d) => d && String(d).trim()).join('\n\n');
}

function slugVan(tekst) {
  return String(tekst || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

function isLeeg(v) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
}

// Foto's die al gekozen waren blijven staan bij een nieuwe opbouw, als de nieuwe pagina hetzelfde slot (of hetzelfde
// item in een lijst) nog heeft. De AI laat foto's leeg, het systeem vult de rest uit de mediabibliotheek.
function behoudFotos(nieuw, oud) {
  if (!oud || typeof oud !== 'object') return nieuw;
  for (const [k, v] of Object.entries(oud)) {
    if ((IMAGE_SRC_RE.test(k) || IMAGE_ALT_RE.test(k)) && !isLeeg(v) && isLeeg(nieuw[k])) nieuw[k] = v;
    if (Array.isArray(v) && Array.isArray(nieuw[k])) {
      v.forEach((item, i) => {
        const doel = nieuw[k][i];
        if (!item || typeof item !== 'object' || !doel || typeof doel !== 'object') return;
        for (const [veld, waarde] of Object.entries(item)) {
          if ((IMAGE_SRC_RE.test(veld) || IMAGE_ALT_RE.test(veld)) && !isLeeg(waarde) && isLeeg(doel[veld])) doel[veld] = waarde;
        }
      });
    }
  }
  return nieuw;
}

// Haalt foto-waarden uit wat de AI teruggaf (die mag geen URL verzinnen). Alleen URL's die al in de pagina stonden blijven.
function zonderVerzonnenFotos(slotData, toegestaan) {
  const ok = new Set(toegestaan || []);
  const schoon = (obj) => {
    for (const k of Object.keys(obj)) {
      if (IMAGE_SRC_RE.test(k) && !ok.has(obj[k])) obj[k] = '';
    }
  };
  schoon(slotData);
  Object.values(slotData).forEach((v) => {
    if (Array.isArray(v)) v.forEach((item) => { if (item && typeof item === 'object') schoon(item); });
  });
  return slotData;
}

function fotoUrls(slotData) {
  const uit = [];
  const pak = (obj) => { for (const [k, v] of Object.entries(obj || {})) if (IMAGE_SRC_RE.test(k) && typeof v === 'string' && v) uit.push(v); };
  pak(slotData);
  Object.values(slotData || {}).forEach((v) => { if (Array.isArray(v)) v.forEach((it) => { if (it && typeof it === 'object') pak(it); }); });
  return uit;
}

// Zet het antwoord van de AI om in de nieuwe stand van de pagina. Puur, zonder Notion of OpenAI, zodat het testbaar is.
function verwerkAntwoord(result, huidig, { validateTemplateStructure, verdeelIconen, zorgVoorGalerijSlot } = {}) {
  if (!result || typeof result !== 'object') throw new Error('De AI gaf geen bruikbaar antwoord.');
  let actie = ACTIES.includes(result.actie) ? result.actie : 'geen';
  const antwoord = String(result.antwoord || '').trim();
  const heeftPagina = Boolean(huidig && huidig.blueprint);
  const oudeFotos = fotoUrls(huidig && huidig.slotData);

  if (actie === 'tekst' && !heeftPagina) actie = 'geen';

  if (actie === 'bouw') {
    if (!result.blueprint || typeof result.blueprint !== 'object') throw new Error('De AI wilde de pagina bouwen maar gaf geen sjabloon terug.');
    let blueprint = { ...result.blueprint, templateFormat: 'slots' };
    if (zorgVoorGalerijSlot) blueprint = zorgVoorGalerijSlot(blueprint);
    // Een Ads-pagina heeft geen interne links: een verplicht linksItems slot zou de controle laten falen.
    if (Array.isArray(blueprint.slots)) blueprint.slots = blueprint.slots.map((s) => (s && s.key === 'linksItems' ? { ...s, verplicht: false } : s));
    blueprint.linkRegels = { ...(blueprint.linkRegels || {}), minimumInterneLinks: 0, minimumNaarZusterpaginas: 0 };
    if (validateTemplateStructure) {
      const structuur = validateTemplateStructure(blueprint);
      if (!structuur.ok) {
        const err = new Error(`Het sjabloon van de AI voldoet niet aan de eisen: ${structuur.errors.join('; ')}`);
        err.structuurFouten = structuur.errors;
        throw err;
      }
    }
    const slotData = zonderVerzonnenFotos(JSON.parse(JSON.stringify(result.slotData && typeof result.slotData === 'object' ? result.slotData : {})), oudeFotos);
    behoudFotos(slotData, huidig && huidig.slotData);
    if (verdeelIconen) verdeelIconen(slotData);
    return {
      actie,
      antwoord: antwoord || 'De pagina is opgebouwd.',
      blueprint,
      slotData,
      titel: String(result.titel || '').trim(),
      slug: slugVan(result.slug || result.titel)
    };
  }

  if (actie === 'tekst') {
    const wijz = result.slotWijzigingen && typeof result.slotWijzigingen === 'object' ? result.slotWijzigingen : {};
    const bekend = new Set(((huidig.blueprint.slots) || []).map((s) => s.key).concat(['metaTitle', 'metaDescription', 'ctaLabel', 'ctaHref']));
    const slotData = JSON.parse(JSON.stringify(huidig.slotData || {}));
    const gewijzigd = [];
    for (const [k, v] of Object.entries(wijz)) {
      if (!bekend.has(k)) continue;
      slotData[k] = JSON.parse(JSON.stringify(v));
      gewijzigd.push(k);
    }
    zonderVerzonnenFotos(slotData, oudeFotos);
    behoudFotos(slotData, huidig.slotData);
    if (verdeelIconen) verdeelIconen(slotData);
    return { actie, antwoord: antwoord || 'De teksten zijn aangepast.', blueprint: huidig.blueprint, slotData, gewijzigd };
  }

  return { actie: 'geen', antwoord: antwoord || 'Wat wil je aanpassen?', blueprint: heeftPagina ? huidig.blueprint : null, slotData: heeftPagina ? huidig.slotData : null };
}

// Een chatbeurt: bericht van Dylan erin, nieuwe stand van de pagina eruit. deps maakt het testbaar zonder OpenAI.
async function chatBeurt({ klant, client, huidig, berichten, bericht, deps }) {
  const tekst = String(bericht || '').trim();
  if (!tekst) throw new Error('Typ eerst een bericht.');
  const heeftPagina = Boolean(huidig && huidig.blueprint);
  const heeftFormulier = Boolean(client && client.profile && client.profile.formulier && client.profile.formulier.shortcode);
  const systemPrompt = bouwSysteemPrompt({ heeftPagina, heeftFormulier, deps });
  const userPrompt = await bouwGebruikersPrompt({ klant, client, huidig, berichten, bericht: tekst, deps });
  const opties = { validateTemplateStructure: deps.validateTemplateStructure, verdeelIconen: deps.verdeelIconen, zorgVoorGalerijSlot: deps.zorgVoorGalerijSlot };
  const result = await deps.callOpenAi({ systemPrompt, userPrompt });
  try {
    return verwerkAntwoord(result, huidig, opties);
  } catch (err) {
    if (!err.structuurFouten) throw err;
    // Een keer opnieuw, met de fouten erbij. Meestal een script, externe link of een tweede h1.
    const tweede = await deps.callOpenAi({ systemPrompt, userPrompt: `${userPrompt}\n\nJe vorige sjabloon werd geweigerd om deze fouten, los ze op en geef alles opnieuw: ${err.structuurFouten.join('; ')}` });
    return verwerkAntwoord(tweede, huidig, opties);
  }
}

function voegBerichtenToe(berichten, ...nieuw) {
  return [...(Array.isArray(berichten) ? berichten : []), ...nieuw].slice(-MAX_BERICHTEN_BEWAARD);
}

module.exports = { chatBeurt, verwerkAntwoord, behoudFotos, zonderVerzonnenFotos, voegBerichtenToe, slugVan, bouwSysteemPrompt, bouwGebruikersPrompt, MAX_BERICHTEN_BEWAARD };
