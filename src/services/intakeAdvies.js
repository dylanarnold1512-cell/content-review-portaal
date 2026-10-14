// AI advies bij het aanmaken van een nieuwe klant (stap 15, 14-10-2026).
// De AI leest de website van de klant en zoekt zelf op internet naar vergelijkbare bedrijven en de markt. Het resultaat
// is een advies met losse voorstellen die Dylan met een klik kan overnemen. Niets wordt automatisch ingevuld of opgeslagen.

const intakeAnalyse = require('./intakeAnalyse');

const MAX_SITE_TEKST = 5000;

function schoneTekst(t, max = 400) {
  return String(t == null ? '' : t).replace(/\s+/g, ' ').replace(/\s*[–—]\s*/g, ', ').trim().slice(0, max);
}
function lijst(a, n, max) {
  return (Array.isArray(a) ? a : []).map((x) => schoneTekst(x, max)).filter(Boolean).slice(0, n);
}

// Haalt de leesbare tekst van de homepage en de menutekst op, als voeding voor de AI.
async function haalSiteTekst(website) {
  let tekst = String(website || '').trim();
  if (!tekst) return '';
  if (!/^https?:\/\//i.test(tekst)) tekst = 'https://' + tekst;
  const url = new URL(tekst);
  const pagina = await intakeAnalyse.haal(url.origin + '/');
  if (!pagina.ok) return '';
  const html = pagina.tekst.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ');
  const titel = intakeAnalyse.decodeer((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const menu = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => intakeAnalyse.decodeer(m[1].replace(/<[^>]+>/g, ' '))).filter((t) => t && t.length < 40);
  const kernTekst = intakeAnalyse.decodeer(html.replace(/<[^>]+>/g, ' '));
  return `Titel: ${titel}\nMenu en links: ${[...new Set(menu)].slice(0, 40).join(' | ')}\nTekst: ${kernTekst}`.slice(0, MAX_SITE_TEKST);
}

function bouwAdviesPrompt({ klant, website, producten, omschrijving, extra, siteTekst }) {
  const blogr = producten !== 'Pagr.';
  const pagr = producten !== 'Blogr.';
  const systeem = `Je bent strateeg bij een Nederlands bureau voor SEO en landingspagina's. Een nieuwe klant wordt aangemaakt. Jij geeft advies voor de intake.
Werkwijze:
- Lees de gegevens van de klant. Zoek daarna zelf op internet naar vergelijkbare bedrijven en de markt (concurrenten in dezelfde branche en regio, waar potentiele klanten naar zoeken, hoe de beste sites hun diensten presenteren).
- Gebruik alleen feiten die uit de website, de omschrijving of je onderzoek blijken. Verzin geen cijfers, plaatsen, diensten of prijzen. Is iets onzeker, zeg dat dan in de tekst.
- Schrijf in eenvoudig Nederlands, kort en concreet. Geen streepjes en geen emoticons.
Antwoord ALLEEN als JSON:
{"samenvatting":"2 of 3 zinnen: wat doet de klant, voor wie, waarin onderscheiden ze zich",
"omschrijving":"voorstel voor de omschrijving van de klant, maximaal 400 tekens",
"markt":"2 of 3 zinnen over de markt en de concurrentie die je vond",
"concurrenten":[{"naam":"...","url":"...","opvallend":"een korte zin"}],
"kansen":["maximaal 5 concrete kansen"],
"aandachtspunten":["maximaal 4 risico's of dingen om bij de klant na te vragen"],
${blogr ? `"blogr":{"onderwerpsrichtingen":["3 tot 5 richtingen voor blogs"],"toneOfVoice":"korte beschrijving van passende schrijfstijl","blogsPerMaand":4,"toelichting":"waarom"},` : ''}
${pagr ? `"pagr":{"diensten":["diensten die elk een eigen landingspagina verdienen"],"werkgebied":["plaatsen waar de klant werkt of kan werken"],"paginasPerMaand":4,"toelichting":"waarom"},` : ''}
"vragenAanKlant":["maximaal 4 vragen die je de klant zou stellen"]}`;
  const user = `Klant: ${klant || '(naam onbekend)'}
Website: ${website || '(geen)'}
Gekozen product: ${producten}
${omschrijving ? `Omschrijving door beheerder: ${omschrijving}\n` : ''}${extra ? `Extra input van de klant of beheerder: ${extra}\n` : ''}
${siteTekst ? `Gelezen van de website:\n${siteTekst}` : 'De website kon niet worden gelezen. Zoek de klant zelf op.'}`;
  return { systeem, user };
}

function schoonAdvies(ruw, producten) {
  const r = ruw && typeof ruw === 'object' ? ruw : {};
  const uit = {
    samenvatting: schoneTekst(r.samenvatting, 600),
    omschrijving: schoneTekst(r.omschrijving, 400),
    markt: schoneTekst(r.markt, 700),
    concurrenten: (Array.isArray(r.concurrenten) ? r.concurrenten : []).map((c) => ({
      naam: schoneTekst(c && c.naam, 80), url: /^https?:\/\//i.test(String(c && c.url || '')) ? String(c.url).slice(0, 300) : '', opvallend: schoneTekst(c && c.opvallend, 220)
    })).filter((c) => c.naam).slice(0, 5),
    kansen: lijst(r.kansen, 5, 240),
    aandachtspunten: lijst(r.aandachtspunten, 4, 240),
    vragenAanKlant: lijst(r.vragenAanKlant, 4, 200),
    bronnen: []
  };
  if (producten !== 'Pagr.') {
    const b = r.blogr || {};
    const n = Number(b.blogsPerMaand);
    uit.blogr = { onderwerpsrichtingen: lijst(b.onderwerpsrichtingen, 5, 160), toneOfVoice: schoneTekst(b.toneOfVoice, 300), blogsPerMaand: [4, 6, 8, 10].includes(n) ? n : null, toelichting: schoneTekst(b.toelichting, 400) };
  }
  if (producten !== 'Blogr.') {
    const p = r.pagr || {};
    const n = Number(p.paginasPerMaand);
    uit.pagr = { diensten: lijst(p.diensten, 8, 100), werkgebied: lijst(p.werkgebied, 12, 60), paginasPerMaand: [2, 4, 6, 8, 12].includes(n) ? n : null, toelichting: schoneTekst(p.toelichting, 400) };
  }
  return uit;
}

// Eenvoudige tekst van het advies, om in de notities van de intake te bewaren.
function adviesAlsNotitie(a) {
  const delen = [];
  if (a.samenvatting) delen.push(`AI advies: ${a.samenvatting}`);
  if (a.markt) delen.push(`Markt: ${a.markt}`);
  if (a.concurrenten && a.concurrenten.length) delen.push(`Vergelijkbaar: ${a.concurrenten.map((c) => c.naam).join(', ')}.`);
  if (a.kansen && a.kansen.length) delen.push(`Kansen: ${a.kansen.join('; ')}.`);
  if (a.aandachtspunten && a.aandachtspunten.length) delen.push(`Let op: ${a.aandachtspunten.join('; ')}.`);
  return delen.join(' ').slice(0, 1500);
}

// aiFn({ systemPrompt, userPrompt }) geeft { json, bronnen } terug. In tests te vervangen.
async function adviesVoorIntake({ klant, website, producten, omschrijving, extra, aiFn, siteTekstFn = haalSiteTekst }) {
  if (!String(website || '').trim() && !String(omschrijving || '').trim() && !String(klant || '').trim()) {
    throw new Error('Vul minstens de website of de klantnaam in, dan kan de AI advies geven.');
  }
  const p = ['Blogr.', 'Pagr.', 'Beide'].includes(producten) ? producten : 'Blogr.';
  let siteTekst = '';
  try { siteTekst = await siteTekstFn(website); } catch (err) { siteTekst = ''; }
  const { systeem, user } = bouwAdviesPrompt({ klant, website, producten: p, omschrijving, extra, siteTekst });
  const antw = await aiFn({ systemPrompt: systeem, userPrompt: user });
  const advies = schoonAdvies(antw && antw.json, p);
  advies.bronnen = (antw && Array.isArray(antw.bronnen) ? antw.bronnen : []).filter((u) => /^https?:\/\//i.test(u)).slice(0, 8);
  advies.websiteGelezen = Boolean(siteTekst);
  advies.zelfOnderzoek = Boolean(antw && antw.zocht);
  advies.notitie = adviesAlsNotitie(advies);
  return advies;
}

// OpenAI Responses API met webzoeken. Valt terug op een gewone aanroep zonder zoeken als de zoektool niet beschikbaar is.
async function callOpenAiOnderzoek({ systemPrompt, userPrompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is niet gezet, dus de AI kan geen advies geven.');
  const model = process.env.OPENAI_MODEL || 'gpt-5.5';
  const verstuur = (body) => fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(150000)
  });
  const basis = { model, instructions: systemPrompt, input: userPrompt, reasoning: { effort: 'low' } };
  let zocht = true;
  let res = await verstuur({ ...basis, tools: [{ type: 'web_search' }] });
  if (!res.ok && [400, 404].includes(res.status)) { zocht = false; res = await verstuur(basis); }
  if (!res.ok) throw new Error(`OpenAI-aanroep faalde (status ${res.status}): ${(await res.text().catch(() => '')).slice(0, 300)}`);
  const data = await res.json();
  let tekst = typeof data.output_text === 'string' ? data.output_text : '';
  const bronnen = [];
  for (const o of data.output || []) {
    for (const c of o.content || []) {
      if (!tekst && c.type === 'output_text') tekst += c.text || '';
      for (const an of c.annotations || []) if (an.type === 'url_citation' && an.url) bronnen.push(an.url.split('?')[0]);
    }
  }
  const stuk = tekst.slice(tekst.indexOf('{'), tekst.lastIndexOf('}') + 1);
  let json;
  try { json = JSON.parse(stuk); } catch (err) { throw new Error('De AI gaf geen bruikbaar advies terug. Probeer het nog eens.'); }
  return { json, bronnen: [...new Set(bronnen)], zocht };
}

module.exports = { bouwAdviesPrompt, schoonAdvies, adviesAlsNotitie, adviesVoorIntake, callOpenAiOnderzoek, haalSiteTekst };
