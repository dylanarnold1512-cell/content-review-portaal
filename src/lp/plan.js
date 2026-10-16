// Pagr. stap 3 (14-10-2026): het plan. De AI stelt per klant paginas voor (dienst, plaats of onderwerp) met een
// reden, op basis van de echte gegevens van de klant, de bestaande pagina's en een zoeksignaal uit Google
// suggesties. Dylan keurt goed of schrapt. Pas bij goedkeuring worden pagina's aangemaakt (status Idee, in de
// werkplaats "Gepland"), dus een voorstel laat niets achter in Notion.
//
// Let op: dit is geen zoekvolume. Het signaal is het aantal Google suggesties bij "dienst plaats". Echt zoekvolume
// (DataForSEO) zit nu in n8n en niet in dit portaal. Zie het bouwstanddocument.

const { haalSuggesties } = require('./zoekvragen');
const { voegVolumeToe } = require('./zoekvolume');
const { onderwerpTekst } = require('./autoPagina');

const MAX_AANTAL = 20;

function norm(t) {
  return String(t || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function sleutelVan(item) {
  const d = norm(item.dienst);
  const pl = norm(item.plaats);
  return `${d}|${pl}`;
}

// Bestaande pagina's: titel plus (indien aanwezig) dienst en plaats uit de invoer.
function bestaandeSleutels(paginas) {
  const set = new Set();
  const titels = new Set();
  (paginas || []).forEach((p) => {
    const inv = (p && p.invoer) || {};
    const dienst = inv.dienstFocus || inv.dienst || inv.onderwerp || '';
    if (dienst || inv.plaatsnaam) set.add(`${norm(dienst)}|${norm(inv.plaatsnaam)}`);
    if (p && p.titel) titels.add(norm(p.titel));
  });
  return { set, titels };
}

// Haalt dubbelen weg: dubbel met een bestaande pagina, of onderling dubbel. Geeft { behouden, dubbel }.
// Een voorstel met plaats en dienst bestaat al als een bestaande titel die plaats noemt en een kernwoord van de dienst deelt.
function bestaatAlsTitel(v, titels) {
  const plaats = norm(v.plaats);
  if (titels.has(norm(v.titel))) return true;
  if (!plaats) return false;
  const kern = norm(`${v.dienst} ${v.titel}`).split(' ').filter((w) => w.length > 3 && w !== plaats);
  for (const t of titels) {
    if (!t.includes(plaats)) continue;
    if (kern.some((w) => t.includes(w))) return true;
  }
  return false;
}

function filterVoorstellen(voorstellen, paginas) {
  const { set, titels } = bestaandeSleutels(paginas);
  const gezien = new Set();
  const behouden = [];
  const dubbel = [];
  for (const v of voorstellen || []) {
    if (!v || !v.titel) continue;
    const sleutel = sleutelVan(v);
    const titel = norm(v.titel);
    if (set.has(sleutel) && (v.dienst || v.plaats)) { dubbel.push({ ...v, reden: 'Bestaat al' }); continue; }
    if (bestaatAlsTitel(v, titels) || gezien.has(sleutel) || gezien.has(`t:${titel}`)) { dubbel.push({ ...v, reden: 'Dubbel' }); continue; }
    gezien.add(sleutel); gezien.add(`t:${titel}`);
    behouden.push(v);
  }
  return { behouden, dubbel };
}

function bouwPlanPrompt({ klantTekst, bestaande, aantal, wens, aiVragen }) {
  const systeem = `Je bent SEO en GEO strateeg voor een bureau dat landingspagina's maakt voor lokale bedrijven in Nederland.
Je stelt een plan voor van nieuwe landingspagina's. Elke pagina heeft een duidelijke zoekintentie: een dienst, een dienst in een plaats, of een onderwerp waar mensen echt naar zoeken.
Regels:
- Gebruik alleen diensten en plaatsen die uit de gegevens van de klant blijken (website, werkgebied). Verzin geen diensten, plaatsen of cijfers.
- Stel geen pagina voor die al bestaat. De bestaande pagina's staan in de prompt.
- Zorg voor spreiding: niet vijf keer dezelfde dienst, niet alleen plaatsen.
- Geef per pagina een korte reden in gewone Nederlandse taal: waarom deze pagina, wat zoekt iemand, wat is de kans.
- Schrijf geen streepjes en geen emoticons.
Antwoord als JSON: {"voorstellen":[{"titel":"...","soort":"dienst|plaats|dienst in plaats|onderwerp","dienst":"...","plaats":"... of leeg","reden":"..."}]}`;
  const user = `Aantal pagina's dat je voorstelt: ${aantal}
${wens ? `Wens van de beheerder: ${wens}\n` : ''}
${klantTekst}
${Array.isArray(aiVragen) && aiVragen.length ? `\nVragen die AI assistenten (ChatGPT, Gemini) over deze klant en zijn markt krijgen. Gebruik ze als bron voor onderwerpen:\n${aiVragen.slice(0, 15).map((v) => `- ${v}`).join('\n')}\n` : ''}
Bestaande pagina's van deze klant (niet opnieuw voorstellen):
${bestaande.length ? bestaande.map((b) => `- ${b}`).join('\n') : '(nog geen)'}`;
  return { systeem, user };
}

// Zoeksignaal: aantal Google suggesties bij "dienst plaats". Nooit blokkerend.
async function voegSignaalToe(voorstellen, { fetchImpl } = {}) {
  const uit = [];
  for (let i = 0; i < voorstellen.length; i += 4) {
    const groep = voorstellen.slice(i, i + 4);
    const gedaan = await Promise.all(groep.map(async (v) => {
      const term = [v.dienst, v.plaats].filter(Boolean).join(' ').trim();
      let aantal = null;
      if (term) {
        try { aantal = (await haalSuggesties(term, fetchImpl)).length; } catch (e) { aantal = null; }
      }
      return { ...v, signaal: aantal };
    }));
    uit.push(...gedaan);
  }
  return uit;
}

// Hoofdfunctie. aiFn en fetchImpl zijn te vervangen in tests.
async function maakPlanVoorstel({ klant, aantal, wens, bestaandePaginas, klantTekst, aiVragen, aiFn, fetchImpl, volumeFetch, volumeAan = true }) {
  const n = Math.max(1, Math.min(MAX_AANTAL, parseInt(aantal, 10) || 4));
  const bestaande = (bestaandePaginas || []).map((p) => p.titel).filter(Boolean);
  // We vragen iets meer dan nodig, zodat er na het weghalen van dubbelen nog genoeg overblijft.
  const gevraagd = Math.min(MAX_AANTAL + 5, n + 3);
  const { systeem, user } = bouwPlanPrompt({ klantTekst, bestaande, aantal: gevraagd, wens, aiVragen });
  const antwoord = await aiFn({ systemPrompt: systeem, userPrompt: user });
  const lijst = Array.isArray(antwoord && antwoord.voorstellen) ? antwoord.voorstellen : [];
  const schoon = lijst.map((v) => ({
    titel: String(v.titel || '').trim(),
    soort: String(v.soort || '').trim(),
    dienst: String(v.dienst || '').trim(),
    plaats: String(v.plaats || '').trim(),
    reden: String(v.reden || '').trim()
  })).filter((v) => v.titel);
  const { behouden, dubbel } = filterVoorstellen(schoon, bestaandePaginas);
  const metSignaal = await voegSignaalToe(behouden.slice(0, n), { fetchImpl });
  // Volume alleen als de meting voor deze klant aan staat (kost geld per aanroep).
  const metVolume = volumeAan ? await voegVolumeToe(metSignaal, { fetchImpl: volumeFetch }) : metSignaal.map((v) => ({ ...v, volume: null }));
  // Met volume sorteren we de voorstellen op wat het meest gezocht wordt, zonder volume blijft de volgorde van de AI.
  const heeftVolume = metVolume.some((v) => typeof v.volume === 'number');
  if (heeftVolume) metVolume.sort((a, b) => (b.volume || 0) - (a.volume || 0));
  return { klant, voorstellen: metVolume, dubbel, volumeBeschikbaar: heeftVolume };
}

// Zet een goedgekeurd voorstel om in de invoer van een pagina.
function invoerVoorGoedgekeurd(v) {
  return {
    plaatsnaam: v.plaats || '',
    dienstFocus: v.dienst || '',
    onderwerp: v.titel,
    _watGaatDezePaginaOver: onderwerpTekst({ dienstFocus: v.dienst, plaatsnaam: v.plaats, plan: { reden: v.reden } }, v.titel),
    plan: { status: 'goedgekeurd', soort: v.soort || '', reden: v.reden || '', signaal: v.signaal == null ? null : v.signaal, volume: typeof v.volume === 'number' ? v.volume : null, goedgekeurdOp: new Date().toISOString().slice(0, 10) }
  };
}

module.exports = { MAX_AANTAL, filterVoorstellen, bouwPlanPrompt, maakPlanVoorstel, invoerVoorGoedgekeurd, voegSignaalToe };
