// Effect van FAQ aanpassingen (BA - AI FAQ Voorstel / Toepassen). Per toegepaste vraag vergelijken we hoe vaak AI het
// merk noemde bij precies die vraag in de dagen voor en na de aanpassing. De data komt uit ai_faq_voorstellen
// (status toegepast, datum toegepast) en ai_metingen (per vraag, per platform, genoemd ja of nee).
// Er staan alleen gemeten cijfers in de tekst, geen beloftes en geen oorzaken.

const PLATFORMEN = ['chatgpt', 'gemini'];
const FASEN = [56, 28];
const MIN_METINGEN = 2;
const DAG = 86400000;

const waar = (v) => v === true || String(v) === 'true';
const nl = (n) => Number(n).toLocaleString('nl-NL');

function dagIso(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function telVenster(metingen, van, tot) {
  let totaal = 0;
  let genoemd = 0;
  for (const m of metingen) {
    const d = String(m.datum || '').slice(0, 10);
    if (d < van || d >= tot) continue;
    totaal += 1;
    if (waar(m.genoemd)) genoemd += 1;
  }
  return { totaal, genoemd };
}

// Een item per toegepaste vraag. nu: ISO datum van vandaag. maand (YYYY-MM): alleen metingen die in die maand vallen.
function faqItem(rij, metingen, nu, maand) {
  const toegepast = String(rij.toegepast || '').slice(0, 10);
  const start = Date.parse(toegepast);
  const vandaag = Date.parse(String(nu).slice(0, 10));
  const gelijk = (metingen || []).filter((m) => m && String(m.prompt_id) === String(rij.prompt_id) && !m.fout && PLATFORMEN.includes(m.platform));
  const regels = [`Op deze pagina is de vraag "${rij.vraag}" als veelgestelde vraag toegevoegd.`];
  let gemetenNa = null;
  for (const dagen of FASEN) {
    if (vandaag - start < dagen * DAG) continue;
    const meetDatum = dagIso(start + dagen * DAG);
    if (maand && meetDatum.slice(0, 7) !== maand) continue;
    const voor = telVenster(gelijk, dagIso(start - dagen * DAG), toegepast);
    const na = telVenster(gelijk, toegepast, dagIso(start + dagen * DAG));
    if (voor.totaal < MIN_METINGEN || na.totaal < MIN_METINGEN) continue;
    gemetenNa = dagen;
    regels.push(`In de ${dagen} dagen voor de aanpassing noemden AI antwoorden het merk bij deze vraag in ${nl(voor.genoemd)} van ${nl(voor.totaal)} antwoorden. In de ${dagen} dagen erna was dat ${nl(na.genoemd)} van ${nl(na.totaal)} antwoorden. Dit zegt iets over deze vraag, de oorzaak ligt niet vast.`);
    break;
  }
  if (!gemetenNa) regels.push('De eerste meting volgt 28 dagen na de aanpassing.');
  return {
    soort: 'faq',
    soortLabel: 'Veelgestelde vraag toegevoegd',
    titel: rij.pagina_titel || rij.pagina_url,
    url: rij.pagina_url || '',
    datum: toegepast,
    gemetenNa,
    regels
  };
}

function bouwFaqItems(faqRijen, metingen, nu, maand) {
  const toegepast = (faqRijen || []).filter((r) => r && r.status === 'toegepast' && /^\d{4}-\d{2}-\d{2}/.test(String(r.toegepast || '')) && r.prompt_id);
  return toegepast.map((r) => faqItem(r, metingen, nu || new Date().toISOString(), maand));
}

// Haalt de toegepaste FAQ rijen en de metingen die erbij horen op. Mislukt het ophalen, dan blijft de lijst leeg.
async function laadFaqItems(klantNaam, { maand, faqRijen, nu } = {}) {
  try {
    const ai = require('./aiZichtbaarheid');
    const klant = { columnName: 'klant', condition: 'eq', value: klantNaam };
    const rijen = faqRijen || await ai.n8nTabel(process.env.N8N_AI_FAQ_TABLE_ID || 'kPhlO5AWU6bOmTyo', [klant]);
    const toegepast = (rijen || []).filter((r) => r && r.status === 'toegepast' && String(r.toegepast || '').length >= 10);
    if (!toegepast.length) return [];
    const eerste = toegepast.map((r) => String(r.toegepast).slice(0, 10)).sort()[0];
    const van = dagIso(Date.parse(eerste) - 56 * DAG);
    const metingen = await ai.n8nTabel(process.env.N8N_AI_METINGEN_TABLE_ID || 'IRsXYL5ndnD6Yy7m', [klant, { columnName: 'datum', condition: 'gte', value: van }]);
    return bouwFaqItems(toegepast, metingen, nu, maand);
  } catch (err) {
    return [];
  }
}

module.exports = { faqItem, bouwFaqItems, laadFaqItems };
