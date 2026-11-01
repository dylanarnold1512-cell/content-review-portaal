// Learningspakket: alle relevante data van een klant en maand in een tekst die Dylan in ChatGPT plakt.
// Bronnen (niets nieuws in n8n nodig):
// 1. Rapportage Maanddata: de cijfers uit het rapport (leidend, inclusief handmatige waarden).
// 2. Rapport Starts: de handmatige invoer van de start in het portaal.
// 3. De bestaande n8n webhook Verdiepingsdata volledig: campagnes, groepen, zoektermen, producten, LinkedIn, Meta, wijzigingen.
// 4. De actiepunten van vorige maand met de status die Dylan aangeeft.
// De tekst bevat alleen data en de context van Dylan. Er worden geen conclusies verzonnen.

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
const MAANDDATA_TABLE_ID = process.env.N8N_MAANDDATA_TABLE_ID || 'ETh1KzCbKLnmPkz3';
const STARTS_TABLE_ID = process.env.N8N_RAPPORT_STARTS_TABLE_ID || 'xwFXvnAkrOkX3Rgp';
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const STATUS_ACTIEPUNT = { opgepakt: 'Opgepakt', deels: 'Deels opgepakt', niet: 'Niet opgepakt' };

function getApiKey() {
  const key = process.env.N8N_API_KEY;
  if (!key) throw new Error('N8N_API_KEY is niet gezet, het portaal kan niet bij n8n.');
  return key;
}

async function n8nApi(pad) {
  const res = await fetch(`${N8N_BASE_URL}/api/v1${pad}`, { headers: { 'X-N8N-API-KEY': getApiKey() } });
  const raw = await res.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (err) { /* geen json */ }
  if (!res.ok) throw new Error(`n8n gaf een fout (${res.status}): ${data.message || raw.slice(0, 200)}`);
  return data;
}

async function alleRijen(tabelId) {
  let rijen = [];
  let cursor = '';
  for (let i = 0; i < 20; i++) {
    const data = await n8nApi(`/data-tables/${tabelId}/rows?limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    rijen = rijen.concat(data.data || []);
    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }
  return rijen;
}

function vorigePeriode(jaar, maand) {
  return maand === 1 ? { jaar: jaar - 1, maand: 12 } : { jaar, maand: maand - 1 };
}

// Opmaak helpers. Geen streepjes in de tekst: een verschil wordt "omhoog" of "omlaag".
const nf = (n, d) => Number(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const euro = (n) => `€${nf(n, 2)}`;
const getal = (n) => nf(n, 0);
const conv = (n) => nf(n, Math.abs(Number(n || 0) - Math.round(Number(n || 0))) < 0.005 ? 0 : 2);
function verschil(nu, voor) {
  nu = Number(nu || 0); voor = Number(voor || 0);
  if (!voor) return nu ? 'nieuw' : 'gelijk';
  const p = ((nu - voor) / voor) * 100;
  if (Math.abs(p) < 0.5) return 'gelijk';
  return `${p > 0 ? 'omhoog' : 'omlaag'} ${nf(Math.abs(p), 0)}%`;
}
const perConv = (kosten, c) => (Number(c) > 0 ? euro(Number(kosten) / Number(c)) : 'geen, want geen conversies');
const TYPE = { SEARCH: 'Search', PERFORMANCE_MAX: 'Performance Max', SHOPPING: 'Shopping', DISPLAY: 'Display', VIDEO: 'Video', DEMAND_GEN: 'Demand Gen' };
const cpc = (kosten, klikken) => (Number(klikken) > 0 ? euro(Number(kosten) / Number(klikken)) : 'onbekend');
const ctr = (kl, vt) => (Number(vt) > 0 ? `${nf((Number(kl) / Number(vt)) * 100, 2)}%` : 'onbekend');
const som = (rijen, veld) => (rijen || []).reduce((t, r) => t + Number(r[veld] || 0), 0);
const MATCH = { EXACT: 'exact', PHRASE: 'woordgroep', BROAD: 'broad' };

function platteLijst(obj, voorvoegsel, uit) {
  Object.entries(obj || {}).forEach(([k, v]) => {
    const naam = voorvoegsel ? `${voorvoegsel} ${k}` : k;
    if (v === null || v === undefined || v === '') return;
    if (Array.isArray(v)) {
      if (v.every((x) => typeof x !== 'object')) uit.push(`${naam}: ${v.join(', ')}`);
      else v.forEach((x, i) => platteLijst(x, `${naam} ${i + 1}`, uit));
    } else if (typeof v === 'object') platteLijst(v, naam, uit);
    else uit.push(`${naam}: ${v}`);
  });
  return uit;
}

function sectieRapportcijfers(maanddata, jaar, maand) {
  const regels = ['RAPPORTCIJFERS (deze komen uit het rapport en zijn leidend boven de platformcijfers)'];
  const nu = maanddata.nu;
  const voor = maanddata.voor;
  if (!nu) {
    regels.push('Voor deze maand staat nog niets in Rapportage Maanddata. Start eerst het rapport en wacht tot het klaar is.');
    return regels;
  }
  regels.push(`${MAANDEN[maand - 1]} ${jaar}`);
  platteLijst(nu, '', []).forEach((r) => regels.push(r));
  if (voor) {
    const p = vorigePeriode(jaar, maand);
    regels.push('', `Vorige maand (${MAANDEN[p.maand - 1]} ${p.jaar})`);
    platteLijst(voor, '', []).forEach((r) => regels.push(r));
  }
  return regels;
}

function sectieHandmatig(start) {
  const regels = ['HANDMATIG INGEVULD BIJ HET STARTEN VAN DE RAPPORTAGE'];
  if (!start) { regels.push('Geen start gevonden in het portaal voor deze maand. Als je handmatige waarden in n8n zelf hebt ingevuld, staan ze hierboven al in de rapportcijfers.'); return regels; }
  let velden = {};
  try { velden = JSON.parse(start.velden || '{}'); } catch (err) { /* leeg */ }
  const items = Object.entries(velden).filter(([k, v]) => k !== 'notities' && String(v).trim() !== '');
  if (!items.length) regels.push('Niets handmatig ingevuld. Alles kwam automatisch uit de API.');
  items.forEach(([k, v]) => regels.push(`${k}: ${v} (handmatig ingevuld)`));
  if (items.length) regels.push('Handmatige conversies kunnen niet aan een campagne of zoekterm worden gekoppeld door het platform. Gebruik hiervoor het rapport.');
  return regels;
}

function sectieActiepunten(punten) {
  const regels = ['ACTIEPUNTEN VAN VORIGE MAAND'];
  const lijst = (punten || []).filter((p) => p && String(p.tekst || '').trim());
  if (!lijst.length) { regels.push('Er zijn geen actiepunten van vorige maand aangeleverd.'); return regels; }
  lijst.forEach((p, i) => {
    const status = STATUS_ACTIEPUNT[p.status] || 'Status niet aangegeven';
    regels.push(`${i + 1}. ${String(p.tekst).trim()}`);
    regels.push(`   Status: ${status}${p.toelichting && String(p.toelichting).trim() ? `. ${String(p.toelichting).trim()}` : ''}`);
  });
  return regels;
}

function sectieCampagnes(g) {
  const regels = ['GOOGLE ADS: CAMPAGNES (deze maand tegenover vorige maand)'];
  const nu = g.campagnes || [];
  const voor = g.campagnes_vorige_maand || [];
  if (!nu.length && !voor.length) { regels.push('Geen campagnes met vertoningen in deze en vorige maand.'); return regels; }
  const namen = [...new Set([...nu.map((c) => c.campagne), ...voor.map((c) => c.campagne)])];
  namen.forEach((naam) => {
    const a = nu.find((c) => c.campagne === naam);
    const b = voor.find((c) => c.campagne === naam);
    const delen = [`${naam}${a && a.type ? ` (${TYPE[a.type] || a.type})` : ''}${a && a.status ? `, status nu: ${a.status}` : ''}`];
    if (a) delen.push(`   Deze maand: ${euro(a.kosten)} kosten, ${getal(a.klikken)} klikken, ${getal(a.vertoningen)} vertoningen, CTR ${ctr(a.klikken, a.vertoningen)}, CPC ${cpc(a.kosten, a.klikken)}, ${conv(a.conversies)} conversies volgens het platform, kosten per conversie: ${perConv(a.kosten, a.conversies)}`);
    else delen.push('   Deze maand: geen vertoningen');
    if (b) delen.push(`   Vorige maand: ${euro(b.kosten)} kosten, ${getal(b.klikken)} klikken, ${conv(b.conversies)} conversies volgens het platform${a ? `. Kosten ${verschil(a.kosten, b.kosten)}, klikken ${verschil(a.klikken, b.klikken)}` : ''}`);
    else delen.push('   Vorige maand: geen vertoningen');
    regels.push(...delen);
  });
  regels.push('Let op: een campagne die alleen in de maandcijfers staat, kan inmiddels uit staan. Gebruik de status nu, niet de uitgaven, om te zeggen of iets nog loopt.');
  return regels;
}

function sectieGroepen(g) {
  const regels = ['GOOGLE ADS: ADVERTENTIEGROEPEN (deze maand tegenover vorige maand)'];
  const nu = g.advertentiegroepen || [];
  const voor = g.advertentiegroepen_vorige_maand || [];
  if (!nu.length && !voor.length) { regels.push('Geen advertentiegroepen met vertoningen (bijvoorbeeld bij Performance Max).'); return regels; }
  const sleutel = (r) => `${r.campagne}|||${r.advertentiegroep}`;
  const heeftStatus = nu.some((r) => r.advertentiegroepStatus || r.statusGroep);
  const sleutels = [...new Set([...nu.map(sleutel), ...voor.map(sleutel)])];
  let verborgen = 0;
  sleutels.forEach((k) => {
    const a = nu.find((r) => sleutel(r) === k);
    const b = voor.find((r) => sleutel(r) === k);
    if (!(a && (a.kosten > 0 || a.klikken > 0)) && !(b && (b.kosten > 0 || b.klikken > 0))) { verborgen++; return; }
    const [camp, groep] = k.split('|||');
    const status = a && (a.advertentiegroepStatus || a.statusGroep) ? `, status nu: ${a.advertentiegroepStatus || a.statusGroep}` : '';
    regels.push(`${camp}, groep ${groep}${status}`);
    regels.push(`   Deze maand: ${a ? `${euro(a.kosten)}, ${getal(a.klikken)} klikken, ${conv(a.conversies)} conversies volgens het platform, kosten per conversie: ${perConv(a.kosten, a.conversies)}` : 'geen vertoningen'}`);
    regels.push(`   Vorige maand: ${b ? `${euro(b.kosten)}, ${getal(b.klikken)} klikken, ${conv(b.conversies)} conversies volgens het platform` : 'geen vertoningen'}`);
  });
  if (verborgen) regels.push(`${verborgen} groepen zonder kosten en klikken in beide maanden zijn weggelaten.`);
  if (!heeftStatus) regels.push('De status van de groepen zelf (actief of gepauzeerd) is niet opgehaald. Zeg dus niet dat een groep nu actief of uit staat. Een groep zonder vertoningen deze maand kan gepauzeerd zijn of gewoon niets hebben getoond.');
  return regels;
}

function sectieZoektermen(g, drempel) {
  const regels = ['GOOGLE ADS: ZOEKTERMEN DEZE MAAND'];
  const rijen = g.zoektermen || [];
  if (!rijen.length) { regels.push('Geen zoektermen beschikbaar voor deze maand.'); return regels; }
  const totaalKosten = som(g.campagnes, 'kosten');
  const zoekKosten = som(rijen, 'kosten');
  const dekking = totaalKosten > 0 ? Math.round((zoekKosten / totaalKosten) * 100) : null;
  regels.push(`Aantal zoektermen: ${getal(rijen.length)}. Samen ${euro(zoekKosten)} van ${euro(totaalKosten)} campagnekosten${dekking !== null ? ` (${dekking}% gedekt)` : ''}. Google toont niet elke zoekterm, dus de rest is niet te zien.`);
  const regel = (r) => `${r.zoekterm} | ${r.campagne}, groep ${r.advertentiegroep} | zoekwoord ${r.zoekwoord || 'onbekend'}${r.zoekwoordType ? ` (${MATCH[r.zoekwoordType] || r.zoekwoordType})` : ''} | ${euro(r.kosten)}, ${getal(r.klikken)} klikken, ${conv(r.conversies)} conversies${r.zoektermStatus && r.zoektermStatus !== 'NONE' ? `, status: ${r.zoektermStatus}` : ''}`;
  const metConv = rijen.filter((r) => Number(r.conversies) > 0).sort((a, b) => b.conversies - a.conversies || b.kosten - a.kosten);
  regels.push('', `Zoektermen met conversies (${metConv.length})`);
  metConv.slice(0, 25).forEach((r) => regels.push(regel(r)));
  const duur = rijen.filter((r) => Number(r.conversies) === 0 && Number(r.kosten) >= drempel).sort((a, b) => b.kosten - a.kosten);
  regels.push('', `Zoektermen zonder conversie met minimaal ${euro(drempel)} kosten (${duur.length})`);
  duur.slice(0, 25).forEach((r) => regels.push(regel(r)));
  const meeste = rijen.slice().sort((a, b) => b.klikken - a.klikken).slice(0, 15);
  regels.push('', 'Zoektermen met de meeste klikken');
  meeste.forEach((r) => regels.push(regel(r)));
  return regels;
}

function sectieZoekwoorden(g) {
  const regels = ['GOOGLE ADS: ZOEKWOORDEN DEZE MAAND'];
  const rijen = (g.zoekwoorden || []).slice().sort((a, b) => b.kosten - a.kosten);
  if (!rijen.length) { regels.push('Geen zoekwoorden beschikbaar (bijvoorbeeld bij Performance Max of Shopping).'); return regels; }
  rijen.slice(0, 30).forEach((r) => regels.push(`${r.zoekwoord} (${MATCH[r.zoekwoordType] || r.zoekwoordType}) | ${r.campagne}, groep ${r.advertentiegroep} | status: ${r.zoekwoordStatus || 'onbekend'} | ${euro(r.kosten)}, ${getal(r.klikken)} klikken, ${conv(r.conversies)} conversies`));
  if (rijen.length > 30) regels.push(`Nog ${rijen.length - 30} zoekwoorden met lagere kosten niet getoond.`);
  return regels;
}

function sectieAdvertenties(g) {
  const regels = ['GOOGLE ADS: ADVERTENTIES DEZE MAAND'];
  const rijen = g.advertenties || [];
  if (!rijen.length) { regels.push('Geen advertenties met vertoningen.'); return regels; }
  rijen.slice().sort((a, b) => b.kosten - a.kosten).slice(0, 25).forEach((r) => {
    const koppen = (r.koppen || []).slice(0, 4).join(' / ');
    regels.push(`${r.campagne}, groep ${r.advertentiegroep} | status nu: ${r.status || 'onbekend'}${koppen ? ` | koppen: ${koppen}` : ''} | ${euro(r.kosten)}, ${getal(r.klikken)} klikken, ${conv(r.conversies)} conversies`);
  });
  return regels;
}

function sectieProducten(g) {
  const regels = ['GOOGLE ADS: PRODUCTEN DEZE MAAND (Shopping en Performance Max)'];
  const rijen = (g.producten || []).slice().sort((a, b) => b.kosten - a.kosten);
  if (!rijen.length) { regels.push('Geen productdata voor deze maand.'); return regels; }
  rijen.slice(0, 25).forEach((r) => regels.push(`${r.product} | ${r.campagne} | ${euro(r.kosten)}, ${getal(r.klikken)} klikken, ${conv(r.conversies)} conversies${r.conversiewaarde ? `, waarde ${euro(r.conversiewaarde)}` : ''}`));
  if (rijen.length > 25) regels.push(`Nog ${rijen.length - 25} producten met lagere kosten niet getoond.`);
  return regels;
}

function sectieUitsluitingen(g) {
  const regels = ['GOOGLE ADS: UITGESLOTEN ZOEKWOORDEN (alleen aantallen)'];
  const camp = g.uitsluitingen_campagne || [];
  const lijsten = g.uitsluitingen_lijsten || [];
  regels.push(`Uitsluitingen op campagneniveau: ${getal(camp.length)}. Uitsluitingen in lijsten: ${getal(lijsten.length)}.`);
  const perCamp = {};
  camp.forEach((r) => { perCamp[r.campagne] = (perCamp[r.campagne] || 0) + 1; });
  Object.entries(perCamp).forEach(([k, v]) => regels.push(`${k}: ${getal(v)} uitsluitingen`));
  return regels;
}

function sectieLinkedIn(l) {
  const regels = ['LINKEDIN ADS DEZE MAAND'];
  if (!l) { regels.push('Geen LinkedIn account bij deze klant.'); return regels; }
  (l.campagnes || []).forEach((c) => regels.push(`${c.naam || `campagne ${c.id}`} | ${euro(c.kosten)}, ${getal(c.vertoningen)} vertoningen, ${getal(c.klikken)} klikken, ${conv(c.conversies)} conversies, ${getal(c.leads)} leads`));
  if (!(l.campagnes || []).length) regels.push('Geen campagnes met data.');
  if ((l.advertenties || []).length) regels.push(`Advertenties: ${l.advertenties.length}. LinkedIn geeft alleen een id per advertentie, dus onderwerpen per advertentie zijn niet bekend.`);
  const bedrijven = (l.bedrijven || []).slice().sort((a, b) => b.klikken - a.klikken).slice(0, 10);
  if (bedrijven.length) { regels.push('Bedrijven met de meeste klikken'); bedrijven.forEach((b) => regels.push(`${b.bedrijf}: ${getal(b.klikken)} klikken, ${getal(b.vertoningen)} vertoningen`)); }
  return regels;
}

function sectieMeta(m) {
  const regels = ['META ADS DEZE MAAND'];
  if (!m) { regels.push('Geen Meta account bij deze klant.'); return regels; }
  platteLijst(m, '', []).slice(0, 60).forEach((r) => regels.push(r));
  return regels;
}

function sectieWijzigingen(g) {
  const regels = ['GOOGLE ADS: WIJZIGINGEN IN HET ACCOUNT'];
  if (g.wijzigingenBeschikbaar === false) { regels.push('Google bewaart wijzigingen maximaal 30 dagen. Voor deze maand zijn ze niet meer op te halen.'); return regels; }
  const rijen = [...(g.wijzigingen || []), ...(g.wijzigingenOpgeslagen || [])];
  if (!rijen.length) { regels.push('Geen wijzigingen gevonden.'); return regels; }
  const groep = {};
  rijen.forEach((r) => {
    const dag = String(r.moment || '').slice(0, 10);
    const k = `${dag}|||${r.onderdeel}|||${r.actie}|||${r.campagne || ''}`;
    groep[k] = (groep[k] || 0) + 1;
  });
  Object.entries(groep).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 60).forEach(([k, n]) => {
    const [dag, onderdeel, actie, campagne] = k.split('|||');
    regels.push(`${dag} | ${onderdeel} | ${actie}${campagne ? ` | ${campagne}` : ''} | ${n}x`);
  });
  return regels;
}

function sectieAccount(g) {
  const a = (g.account_3_maanden || [])[0];
  if (!a) return [];
  return ['GOOGLE ADS: DRIE MAANDEN SAMEN', `Kosten ${euro(a.kosten)}, ${getal(a.klikken)} klikken, ${conv(a.conversies)} conversies volgens het platform, gemiddelde kosten per conversie ${perConv(a.kosten, a.conversies)}.`];
}

function bouwTekst({ klant, jaar, maand, context, actiepunten, maanddata, start, verdieping }) {
  const g = (verdieping && verdieping.google) || null;
  const delen = [];
  delen.push([`LEARNINGSPAKKET ${klant.toUpperCase()}, ${MAANDEN[maand - 1].toUpperCase()} ${jaar}`,
    'Alle cijfers zijn van deze klant en deze maand, tenzij erbij staat dat het vorige maand is. Het rapport is leidend: waar het platform een ander conversieaantal toont dan het rapport, geldt het rapport.']);
  delen.push(['CONTEXT VAN DYLAN', context && String(context).trim() ? String(context).trim() : 'Geen extra context aangegeven.']);
  delen.push(sectieActiepunten(actiepunten));
  delen.push(sectieRapportcijfers(maanddata || {}, jaar, maand));
  delen.push(sectieHandmatig(start));
  if (g) {
    delen.push(sectieCampagnes(g), sectieGroepen(g), sectieZoekwoorden(g), sectieZoektermen(g, 15), sectieAdvertenties(g), sectieProducten(g), sectieUitsluitingen(g), sectieAccount(g).length ? sectieAccount(g) : null, sectieWijzigingen(g));
  } else {
    delen.push(['GOOGLE ADS', 'Geen Google Ads data opgehaald voor deze klant.']);
  }
  delen.push(sectieLinkedIn(verdieping && verdieping.linkedin), sectieMeta(verdieping && verdieping.meta));
  const waarschuwingen = [];
  if (g && (g.fouten || []).length) g.fouten.forEach((f) => waarschuwingen.push(`Google query "${f.query}" gaf een fout: ${f.fout}`));
  if (g && (g.afgekapt || []).length) waarschuwingen.push(`Deze Google onderdelen zijn afgekapt omdat er meer rijen waren: ${g.afgekapt.join(', ')}`);
  if (verdieping && verdieping.linkedin && (verdieping.linkedin.fouten || []).length) waarschuwingen.push('LinkedIn gaf een fout bij het ophalen.');
  if (waarschuwingen.length) delen.push(['KANTTEKENINGEN BIJ DE DATA', ...waarschuwingen]);
  return delen.filter(Boolean).map((d) => d.join('\n')).join('\n\n');
}

async function maakPakket({ klant, jaar, maand, context, actiepunten }) {
  klant = String(klant || '').trim();
  jaar = Number(jaar); maand = Number(maand);
  if (!klant) throw new Error('Kies een klant.');
  if (!(maand >= 1 && maand <= 12) || !(jaar >= 2024 && jaar <= 2100)) throw new Error('Maand of jaar klopt niet.');
  const p = vorigePeriode(jaar, maand);

  const [maandRijen, startRijen, verdieping] = await Promise.all([
    alleRijen(MAANDDATA_TABLE_ID),
    alleRijen(STARTS_TABLE_ID).catch(() => []),
    haalVerdieping({ klant, jaar, maand })
  ]);
  const parse = (r) => { try { return JSON.parse(r.data); } catch (err) { return null; } };
  const vind = (j, m) => maandRijen.filter((r) => r.klant === klant && Number(r.jaar) === j && Number(r.maand) === m).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
  const nuRij = vind(jaar, maand);
  const voorRij = vind(p.jaar, p.maand);
  const maandSleutel = `${jaar}-${String(maand).padStart(2, '0')}`;
  const start = startRijen.filter((r) => r.klant === klant && r.maand === maandSleutel).sort((a, b) => String(b.gestart).localeCompare(String(a.gestart)))[0];

  const tekst = bouwTekst({
    klant, jaar, maand, context, actiepunten,
    maanddata: { nu: nuRij ? parse(nuRij) : null, voor: voorRij ? parse(voorRij) : null },
    start, verdieping
  });
  return { tekst, bestandsnaam: `Learningspakket ${klant} ${maandSleutel}.txt`, rapportAanwezig: !!nuRij };
}

async function haalVerdieping({ klant, jaar, maand }) {
  const res = await fetch(`${N8N_BASE_URL}/webhook/verdiepingsdata-volledig`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ klant, jaar, maand })
  });
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (err) { /* geen json */ }
  if (!res.ok) throw new Error(`De accountdata ophalen mislukte (${res.status}): ${(data && data.message) || raw.slice(0, 200)}`);
  if (Array.isArray(data)) data = data[0];
  if (!data) throw new Error('De accountdata ophalen gaf een leeg antwoord.');
  return data;
}

module.exports = { maakPakket, bouwTekst };
