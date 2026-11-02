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
// Conversietekst: bij een toegerekende rij staat erbij hoeveel gemeten is en hoeveel is aangevuld vanuit het rapport.
const cv = (r) => (r.toegerekend
  ? `${conv(r.conversies)} conversies volgens het rapport (${conv(Number(r.conversies) - Number(r.toegerekend))} gemeten door het platform, ${conv(r.toegerekend)} toegerekend)`
  : `${conv(r.conversies)} conversies volgens het platform`);
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

function sectieCampagnes(g, vergelijk) {
  const regels = [vergelijk ? 'GOOGLE ADS: CAMPAGNES (deze maand tegenover vorige maand)' : 'GOOGLE ADS: CAMPAGNES DIE DEZE MAAND VERTOONDEN'];
  const nu = g.campagnes || [];
  const voor = vergelijk ? (g.campagnes_vorige_maand || []) : [];
  if (!nu.length && !voor.length) { regels.push('Geen campagnes met vertoningen in deze en vorige maand.'); return regels; }
  const namen = [...new Set([...nu.map((c) => c.campagne), ...voor.map((c) => c.campagne)])];
  namen.forEach((naam) => {
    const a = nu.find((c) => c.campagne === naam);
    const b = voor.find((c) => c.campagne === naam);
    const delen = [`${naam}${a && a.type ? ` (${TYPE[a.type] || a.type})` : ''}${a && a.status ? `, status nu: ${a.status}` : ''}`];
    if (a) delen.push(`   Deze maand: ${euro(a.kosten)} kosten, ${getal(a.klikken)} klikken, ${getal(a.vertoningen)} vertoningen, CTR ${ctr(a.klikken, a.vertoningen)}, CPC ${cpc(a.kosten, a.klikken)}, ${cv(a)}, kosten per conversie: ${perConv(a.kosten, a.conversies)}`);
    else delen.push('   Deze maand: geen vertoningen');
    if (vergelijk) {
      if (b) delen.push(`   Vorige maand: ${euro(b.kosten)} kosten, ${getal(b.klikken)} klikken, ${conv(b.conversies)} conversies volgens het platform${a ? `. Kosten ${verschil(a.kosten, b.kosten)}, klikken ${verschil(a.klikken, b.klikken)}` : ''}`);
      else delen.push('   Vorige maand: geen vertoningen');
    }
    regels.push(...delen);
  });
  regels.push('Let op: deze campagnes stonden deze maand live. Of ze nu nog aan staan, zie je alleen aan de status nu, niet aan de uitgaven.');
  return regels;
}

function sectieGroepen(g, vergelijk) {
  const regels = [vergelijk ? 'GOOGLE ADS: ADVERTENTIEGROEPEN (deze maand tegenover vorige maand)' : 'GOOGLE ADS: ADVERTENTIEGROEPEN DIE DEZE MAAND VERTOONDEN'];
  const nu = g.advertentiegroepen || [];
  const voor = vergelijk ? (g.advertentiegroepen_vorige_maand || []) : [];
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
    regels.push(`   Deze maand: ${a ? `${euro(a.kosten)}, ${getal(a.klikken)} klikken, ${cv(a)}, kosten per conversie: ${perConv(a.kosten, a.conversies)}` : 'geen vertoningen'}`);
    if (vergelijk) regels.push(`   Vorige maand: ${b ? `${euro(b.kosten)}, ${getal(b.klikken)} klikken, ${conv(b.conversies)} conversies volgens het platform` : 'geen vertoningen'}`);
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
  const regel = (r) => `${r.zoekterm} | ${r.campagne}, groep ${r.advertentiegroep} | zoekwoord ${r.zoekwoord || 'onbekend'}${r.zoekwoordType ? ` (${MATCH[r.zoekwoordType] || r.zoekwoordType})` : ''} | ${euro(r.kosten)}, ${getal(r.klikken)} klikken, ${r.toegerekend ? cv(r) : `${conv(r.conversies)} conversies`}${r.zoektermStatus && r.zoektermStatus !== 'NONE' ? `, status: ${r.zoektermStatus}` : ''}`;
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


function sectieZoektermenAlles(g) {
  const regels = ['GOOGLE ADS: ZOEKTERMEN DEZE MAAND PER CAMPAGNE EN ADVERTENTIEGROEP'];
  const rijen = g.zoektermen || [];
  if (!rijen.length) { regels.push('Geen zoektermen beschikbaar voor deze maand (bijvoorbeeld bij Performance Max of Shopping).'); return regels; }
  const totaalKosten = som(g.campagnes, 'kosten');
  const zoekKosten = som(rijen, 'kosten');
  const dekking = totaalKosten > 0 ? Math.round((zoekKosten / totaalKosten) * 100) : null;
  regels.push(`Aantal zoektermen: ${getal(rijen.length)}. Samen ${euro(zoekKosten)} van ${euro(totaalKosten)} campagnekosten${dekking !== null ? ` (${dekking}% gedekt)` : ''}. Google toont niet elke zoekterm, dus de rest is niet te zien. Per regel: zoekterm | zoekwoord waarop hij matchte | kosten, klikken, conversies volgens het platform.`);
  const perCamp = {};
  rijen.forEach((r) => {
    const c = r.campagne || 'onbekend'; const a = r.advertentiegroep || 'onbekend';
    perCamp[c] = perCamp[c] || {}; (perCamp[c][a] = perCamp[c][a] || []).push(r);
  });
  Object.keys(perCamp).sort((x, y) => som(Object.values(perCamp[y]).flat(), 'kosten') - som(Object.values(perCamp[x]).flat(), 'kosten')).forEach((c) => {
    const alle = Object.values(perCamp[c]).flat();
    regels.push('', `Campagne ${c}: ${getal(alle.length)} zoektermen, ${euro(som(alle, 'kosten'))}, ${getal(som(alle, 'klikken'))} klikken, ${conv(som(alle, 'conversies'))} conversies`);
    Object.keys(perCamp[c]).sort((x, y) => som(perCamp[c][y], 'kosten') - som(perCamp[c][x], 'kosten')).forEach((a) => {
      const lijst = perCamp[c][a].slice().sort((x, y) => y.kosten - x.kosten || y.klikken - x.klikken);
      regels.push(`  Advertentiegroep ${a}: ${getal(lijst.length)} zoektermen, ${euro(som(lijst, 'kosten'))}, ${getal(som(lijst, 'klikken'))} klikken, ${conv(som(lijst, 'conversies'))} conversies`);
      lijst.forEach((r) => regels.push(`    ${r.zoekterm} | ${r.zoekwoord || 'onbekend'}${r.zoekwoordType ? ` (${MATCH[r.zoekwoordType] || r.zoekwoordType})` : ''} | ${euro(r.kosten)}, ${getal(r.klikken)} klikken, ${conv(r.conversies)} conversies${r.zoektermStatus && r.zoektermStatus !== 'NONE' ? `, status: ${r.zoektermStatus}` : ''}`));
    });
  });
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
  const lijst = (naam, rijen) => { if (Array.isArray(rijen) && rijen.length) { regels.push(naam); rijen.forEach((r) => regels.push(platteLijst(r, '', []).join(' | '))); } };
  if (typeof m === 'object' && !Array.isArray(m) && Object.values(m).some((v) => Array.isArray(v) && v.length && typeof v[0] === 'object')) {
    Object.entries(m).forEach(([k, v]) => { if (Array.isArray(v) && v.length && typeof v[0] === 'object') { lijst(k, v.slice(0, 40)); } else if (v !== null && v !== undefined && typeof v !== 'object') regels.push(`${k}: ${v}`); });
  } else platteLijst(m, '', []).slice(0, 80).forEach((r) => regels.push(r));
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


// Het rapport is leidend. Toont het rapport meer Google Ads conversies dan het platform (bijvoorbeeld door handmatig
// toegevoegde conversies), dan rekenen we het verschil toe aan de campagne die deze maand live stond en de meeste conversies had,
// daarbinnen aan de advertentiegroep en zoekterm met de meeste conversies. Dit wordt in het pakket duidelijk als toegerekend gemarkeerd.
function toerekenen(g, rapportConversies) {
  const kopie = JSON.parse(JSON.stringify(g));
  const platform = som(kopie.campagnes, 'conversies');
  const nota = { rapport: rapportConversies, platform: Math.round(platform * 100) / 100, verschil: 0, toegepast: false, uitleg: '' };
  if (rapportConversies === null || rapportConversies === undefined || isNaN(Number(rapportConversies))) { nota.uitleg = 'Geen conversiecijfer uit het rapport gevonden, dus niets toegerekend.'; return { g: kopie, nota }; }
  const verschilWaarde = Math.round((Number(rapportConversies) - platform) * 100) / 100;
  nota.verschil = verschilWaarde;
  if (Math.abs(verschilWaarde) < 0.5) { nota.uitleg = 'Het rapport en het platform wijken niet af.'; return { g: kopie, nota }; }
  if (verschilWaarde < 0) { nota.uitleg = `Het rapport toont ${conv(rapportConversies)} conversies en het platform ${conv(platform)}. Het rapport is lager, dus er is niets toegerekend.`; return { g: kopie, nota }; }
  const kandidaten = (kopie.campagnes || []).filter((c) => c.status === 'ENABLED');
  const lijst = kandidaten.length ? kandidaten : (kopie.campagnes || []);
  if (!lijst.length) { nota.uitleg = 'Er is geen campagne om het verschil aan toe te rekenen.'; return { g: kopie, nota }; }
  const camp = lijst.slice().sort((x, y) => y.conversies - x.conversies || y.klikken - x.klikken)[0];
  camp.conversies = Math.round((Number(camp.conversies) + verschilWaarde) * 100) / 100; camp.toegerekend = verschilWaarde;
  const groepen = (kopie.advertentiegroepen || []).filter((r) => r.campagne === camp.campagne);
  const groep = groepen.slice().sort((x, y) => y.conversies - x.conversies || y.klikken - x.klikken)[0];
  if (groep) { groep.conversies = Math.round((Number(groep.conversies) + verschilWaarde) * 100) / 100; groep.toegerekend = verschilWaarde; }
  const termen = (kopie.zoektermen || []).filter((r) => r.campagne === camp.campagne && (!groep || r.advertentiegroep === groep.advertentiegroep));
  const term = termen.slice().sort((x, y) => y.conversies - x.conversies || y.klikken - x.klikken)[0];
  if (term) { term.conversies = Math.round((Number(term.conversies) + verschilWaarde) * 100) / 100; term.toegerekend = verschilWaarde; }
  nota.toegepast = true;
  nota.uitleg = `Het rapport toont ${conv(rapportConversies)} conversies en het platform ${conv(platform)}. De ${conv(verschilWaarde)} conversies die het platform mist, zijn toegerekend aan campagne ${camp.campagne}${camp.status === 'ENABLED' ? '' : ' (let op: deze campagne staat nu niet aan)'}${groep ? `, advertentiegroep ${groep.advertentiegroep}` : ''}${term ? ` en zoekterm ${term.zoekterm}` : ''}, omdat dat de campagne is die deze maand live stond en de meeste conversies had. Dit is een toerekening, geen meting.`;
  return { g: kopie, nota };
}

// Opvallende punten, alleen rekenwerk op de data. Geen conclusies: Dylan en ChatGPT bepalen wat ze ermee doen.
function sectieOpvallend(g, nota) {
  const regels = ['OPVALLEND IN DE DATA (voorstellen op basis van de cijfers hieronder, geen vaststaande conclusies)'];
  const camps = (g.campagnes || []).filter((c) => Number(c.kosten) > 0);
  if (!camps.length) { regels.push('Geen campagnes met kosten deze maand.'); return regels; }
  const totKosten = som(camps, 'kosten');
  const totConv = som(camps, 'conversies');
  const gem = totConv > 0 ? totKosten / totConv : null;
  regels.push(`Samen: ${euro(totKosten)} kosten, ${getal(som(camps, 'klikken'))} klikken, ${conv(totConv)} conversies${gem ? `, gemiddeld ${euro(gem)} per conversie` : ''}${nota && nota.toegepast ? ' (inclusief toegerekende conversies)' : ''}.`);
  const duurste = camps.slice().sort((a, b) => b.kosten - a.kosten)[0];
  regels.push(`Grootste campagne: ${duurste.campagne} met ${euro(duurste.kosten)} (${nf((duurste.kosten / totKosten) * 100, 0)}% van de kosten) en ${conv(duurste.conversies)} conversies.`);
  const metConv = camps.filter((c) => c.conversies > 0).sort((a, b) => a.kosten / a.conversies - b.kosten / b.conversies);
  if (metConv.length > 1) regels.push(`Laagste kosten per conversie: ${metConv[0].campagne} met ${perConv(metConv[0].kosten, metConv[0].conversies)}. Hoogste: ${metConv[metConv.length - 1].campagne} met ${perConv(metConv[metConv.length - 1].kosten, metConv[metConv.length - 1].conversies)}.`);
  camps.filter((c) => c.conversies === 0 && gem && c.kosten >= gem).forEach((c) => regels.push(`${c.campagne} kostte ${euro(c.kosten)} zonder conversie, meer dan de gemiddelde kosten per conversie van ${euro(gem)}.`));
  const vorige = g.campagnes_vorige_maand || [];
  if (vorige.length) {
    regels.push(`Tegenover vorige maand: kosten ${verschil(totKosten, som(vorige, 'kosten'))}, klikken ${verschil(som(camps, 'klikken'), som(vorige, 'klikken'))}, conversies ${verschil(totConv, som(vorige, 'conversies'))} (vorige maand ${conv(som(vorige, 'conversies'))} volgens het platform).`);
  }
  const termen = g.zoektermen || [];
  if (termen.length) {
    const goed = termen.filter((t) => t.conversies > 0).sort((a, b) => b.conversies - a.conversies || a.kosten - b.kosten).slice(0, 5);
    if (goed.length) regels.push(`Zoektermen met conversies: ${goed.map((t) => `${t.zoekterm} (${conv(t.conversies)} conversies, ${euro(t.kosten)})`).join('; ')}.`);
    if (gem) {
      const slecht = termen.filter((t) => t.conversies === 0 && t.kosten >= gem).sort((a, b) => b.kosten - a.kosten);
      if (slecht.length) regels.push(`Zoektermen zonder conversie met meer kosten dan de gemiddelde kosten per conversie (${euro(gem)}): ${slecht.slice(0, 8).map((t) => `${t.zoekterm} (${euro(t.kosten)})`).join('; ')}. Dit zijn kandidaten om uit te sluiten of te bekijken.`);
      else regels.push(`Geen zoekterm zonder conversie heeft meer kosten dan de gemiddelde kosten per conversie (${euro(gem)}).`);
    }
    const duurst = termen.slice().sort((x, y) => y.kosten - x.kosten).slice(0, 8);
    regels.push(`Zoektermen met de meeste kosten: ${duurst.map((t) => `${t.zoekterm} (${euro(t.kosten)}, ${getal(t.klikken)} klikken, ${conv(t.conversies)} conversies)`).join('; ')}.`);
    const nul = termen.filter((t) => t.conversies === 0);
    regels.push(`${getal(nul.length)} van de ${getal(termen.length)} zoektermen hadden geen conversie, samen ${euro(som(nul, 'kosten'))}.`);
    // Zoektermen over dezelfde zoekwoorden heen: welk deel van het geld ging naar zoektermen die bij een ander zoekwoord of type pasten.
    const perWoord = {};
    termen.forEach((t) => { const k = t.zoekwoord || 'onbekend'; perWoord[k] = perWoord[k] || { kosten: 0, klikken: 0, conversies: 0 }; perWoord[k].kosten += Number(t.kosten); perWoord[k].klikken += Number(t.klikken); perWoord[k].conversies += Number(t.conversies); });
    const woorden = Object.entries(perWoord).sort((x, y) => y[1].kosten - x[1].kosten).slice(0, 5);
    regels.push(`Zoekwoorden waar de zoektermen de meeste kosten op maakten: ${woorden.map(([k, v]) => `${k} (${euro(v.kosten)}, ${getal(v.klikken)} klikken, ${conv(v.conversies)} conversies)`).join('; ')}.`);
  }
  return regels;
}

// Extra data uit de losse workflow "Learningspakket extra data".
function metGroepStatus(g, exG) {
  const status = exG.groepen_status || [];
  if (!status.length) return g;
  const kaart = {};
  status.forEach((r) => { kaart[`${r.campagne}|||${r.advertentiegroep}`] = r.groepStatus; });
  const zet = (rijen) => (rijen || []).map((r) => { const st = kaart[`${r.campagne}|||${r.advertentiegroep}`]; return st ? { ...r, advertentiegroepStatus: st } : r; });
  return { ...g, advertentiegroepen: zet(g.advertentiegroepen), advertentiegroepen_vorige_maand: g.advertentiegroepen_vorige_maand, groepenStatusBekend: true };
}

const lijstTot = (rijen, n) => { const l = rijen.slice(0, n); return rijen.length > n ? [...l, `Nog ${rijen.length - n} regels met lagere kosten niet getoond.`] : l; };
const prestatie = (r) => `${euro(r.kosten)}, ${getal(r.klikken)} klikken, ${conv(r.conversies)} conversies`;

function sectiePmax(x) {
  const rijen = (x.pmax_zoektermen || []).slice().sort((a, b) => (b.kosten || 0) - (a.kosten || 0) || (b.klikken || 0) - (a.klikken || 0));
  if (!rijen.length) return ['GOOGLE ADS: PERFORMANCE MAX ZOEKTERMEN', 'Geen zoektermen van Performance Max beschikbaar voor deze maand.'];
  const regels = ['GOOGLE ADS: PERFORMANCE MAX ZOEKTERMEN DEZE MAAND', `Aantal zoektermen: ${getal(rijen.length)}. Per regel: zoekterm | campagne | ${rijen.some((r) => r.kosten !== undefined) ? 'kosten, klikken, conversies volgens het platform' : 'klikken, conversies volgens het platform (Google gaf geen kosten per zoekterm)'}.`];
  lijstTot(rijen, 60).forEach((r) => regels.push(typeof r === 'string' ? r : `${r.zoekterm} | ${r.campagne} | ${r.kosten !== undefined ? prestatie(r) : `${getal(r.klikken)} klikken, ${conv(r.conversies)} conversies`}`));
  return regels;
}

function sectieAssetgroepen(x) {
  const rijen = (x.assetgroepen || []).slice().sort((a, b) => b.kosten - a.kosten);
  if (!rijen.length) return null;
  const regels = ['GOOGLE ADS: PERFORMANCE MAX ONDERDELEN (eigen groepen binnen de campagne)'];
  rijen.forEach((r) => regels.push(`${r.campagne} | groep ${r.assetgroep}${r.assetgroepStatus ? `, status nu: ${r.assetgroepStatus}` : ''} | ${prestatie(r)}`));
  return regels;
}

function sectieInstellingen(x) {
  const rijen = (x.campagne_instellingen || []).slice().sort((a, b) => b.kosten - a.kosten);
  if (!rijen.length) return null;
  const pct = (v) => (v === undefined || v === null || v === '' ? 'onbekend' : (Number(v) <= 1 ? `${nf(Number(v) * 100, 0)}%` : String(v)));
  const regels = ['GOOGLE ADS: INSTELLINGEN PER CAMPAGNE (stand nu, cijfers van deze maand)'];
  rijen.forEach((r) => regels.push(`${r.campagne} | status nu: ${r.campagneStatus || 'onbekend'} | biedstrategie ${r.biedstrategie || 'onbekend'} | budget ${r.budgetPerDag !== undefined ? `${euro(r.budgetPerDag)} per dag` : 'onbekend'} | vertoningsaandeel ${pct(r.vertoningsaandeel)}, verloren door budget ${pct(r.verlorenDoorBudget)}, verloren door rang ${pct(r.verlorenDoorRang)}`));
  regels.push('Vertoningsaandeel bestaat alleen voor zoekcampagnes. Onbekend betekent dat Google geen waarde gaf.');
  return regels;
}

function samenTelPer(rijen, sleutel) {
  const m = {};
  rijen.forEach((r) => { const k = r[sleutel] || 'onbekend'; m[k] = m[k] || { kosten: 0, klikken: 0, vertoningen: 0, conversies: 0 }; m[k].kosten += Number(r.kosten || 0); m[k].klikken += Number(r.klikken || 0); m[k].vertoningen += Number(r.vertoningen || 0); m[k].conversies += Number(r.conversies || 0); });
  return Object.entries(m);
}

const APPARAAT = { MOBILE: 'mobiel', DESKTOP: 'desktop', TABLET: 'tablet', CONNECTED_TV: 'tv', OTHER: 'overig' };
const DAG = { MONDAY: 'maandag', TUESDAY: 'dinsdag', WEDNESDAY: 'woensdag', THURSDAY: 'donderdag', FRIDAY: 'vrijdag', SATURDAY: 'zaterdag', SUNDAY: 'zondag' };

function sectieApparaten(x) {
  const rijen = x.apparaten || [];
  if (!rijen.length) return null;
  const regels = ['GOOGLE ADS: APPARATEN DEZE MAAND (hele account)'];
  samenTelPer(rijen, 'apparaat').sort((a, b) => b[1].kosten - a[1].kosten).forEach(([k, v]) => regels.push(`${APPARAAT[k] || k}: ${prestatie(v)}, CTR ${ctr(v.klikken, v.vertoningen)}, kosten per conversie: ${perConv(v.kosten, v.conversies)}`));
  return regels;
}

function sectieWeekdagen(x) {
  const rijen = x.weekdagen || [];
  if (!rijen.length) return null;
  const volgorde = Object.keys(DAG);
  const regels = ['GOOGLE ADS: WEEKDAGEN DEZE MAAND (hele account)'];
  samenTelPer(rijen, 'dag').sort((a, b) => volgorde.indexOf(a[0]) - volgorde.indexOf(b[0])).forEach(([k, v]) => regels.push(`${DAG[k] || k}: ${prestatie(v)}, kosten per conversie: ${perConv(v.kosten, v.conversies)}`));
  return regels;
}

function sectieLandingspaginas(x) {
  const rijen = (x.landingspaginas || []).slice().sort((a, b) => b.klikken - a.klikken);
  if (!rijen.length) return null;
  const regels = ['GOOGLE ADS: LANDINGSPAGINAS DEZE MAAND (meeste klikken)'];
  lijstTot(rijen, 25).forEach((r) => regels.push(typeof r === 'string' ? r : `${r.url} | ${prestatie(r)}`));
  return regels;
}

function sectieConversieacties(x) {
  const rijen = x.conversieacties || [];
  if (!rijen.length) return null;
  const regels = ['GOOGLE ADS: CONVERSIEACTIES DEZE MAAND (platform, voor de verdeling)'];
  samenTelPer(rijen, 'conversieactie').sort((a, b) => b[1].conversies - a[1].conversies).forEach(([k, v]) => regels.push(`${k}: ${conv(v.conversies)} conversies`));
  return regels;
}

function sectieLinkedInExtra(x, nu) {
  const regels = ['LINKEDIN ADS: EXTRA DATA'];
  const rij = (r) => `${r.sleutel || 'onbekend'} | ${getal(r.vertoningen)} vertoningen, ${getal(r.klikken)} klikken, CTR ${ctr(r.klikken, r.vertoningen)}`;
  if ((x.campagnes_vorige_maand || []).length) {
    regels.push('Vorige maand per campagne (id van LinkedIn)');
    x.campagnes_vorige_maand.forEach((r) => regels.push(`${r.sleutel || 'onbekend'} | ${euro(r.kosten)}, ${getal(r.vertoningen)} vertoningen, ${getal(r.klikken)} klikken, ${conv(r.conversies)} conversies, ${getal(r.leads)} leads`));
  }
  const demo = [['functie', 'Functie'], ['branche', 'Branche'], ['senioriteit', 'Senioriteit'], ['bedrijfsgrootte', 'Bedrijfsgrootte'], ['functietitel', 'Functietitel']];
  demo.forEach(([k, kop]) => { if ((x[k] || []).length) { regels.push('', `${kop} van wie de advertenties zag of aanklikte, deze maand (LinkedIn geeft codes, geen namen)`); x[k].slice(0, 15).forEach((r) => regels.push(rij(r))); } });
  if ((x.advertentie_details || []).length) { regels.push('', `Advertenties in het account: ${x.advertentie_details.length}.`); x.advertentie_details.slice(0, 20).forEach((a) => regels.push(`${a.naam || a.id} | status ${a.status || 'onbekend'}${a.inhoud ? ` | ${a.inhoud}` : ''}`)); }
  return regels.length > 1 ? regels : null;
}

function sectieMetaExtra(x) {
  const regels = ['META ADS: EXTRA DATA'];
  const kop = (r) => [r.campagne, r.advertentieset, r.advertentie].filter(Boolean).join(' > ');
  if ((x.advertenties_vorige_maand || []).length) {
    regels.push('Vorige maand per advertentie');
    x.advertenties_vorige_maand.slice().sort((a, b) => b.kosten - a.kosten).slice(0, 25).forEach((r) => regels.push(`${kop(r)} | ${euro(r.kosten)}, ${getal(r.klikken)} klikken, ${getal(r.vertoningen)} vertoningen, ${conv(r.conversies)} conversies`));
  }
  const brek = [['leeftijd_geslacht', 'Leeftijd en geslacht', (r) => `${r.leeftijd || 'onbekend'}, ${r.geslacht || 'onbekend'}`], ['regio', 'Regio', (r) => r.regio || 'onbekend'], ['apparaat', 'Apparaat', (r) => r.apparaat || 'onbekend']];
  brek.forEach(([k, titel, f]) => {
    const rijen = x[k] || [];
    if (!rijen.length) return;
    const m = {};
    rijen.forEach((r) => { const s = f(r); m[s] = m[s] || { kosten: 0, klikken: 0, vertoningen: 0, conversies: 0 }; m[s].kosten += r.kosten; m[s].klikken += r.klikken; m[s].vertoningen += r.vertoningen; m[s].conversies += r.conversies; });
    regels.push('', `${titel} deze maand`);
    Object.entries(m).sort((a, b) => b[1].kosten - a[1].kosten).slice(0, 15).forEach(([s, v]) => regels.push(`${s} | ${prestatie(v)}, CTR ${ctr(v.klikken, v.vertoningen)}`));
  });
  if ((x.advertentie_details || []).length) {
    regels.push('', 'Advertenties met tekst');
    x.advertentie_details.slice(0, 25).forEach((a) => regels.push(`${a.campagne || ''} > ${a.advertentieset || ''} > ${a.advertentie} | status ${a.status || 'onbekend'}${a.titel ? ` | titel: ${a.titel}` : ''}${a.tekst ? ` | tekst: ${a.tekst}` : ''}${a.knop ? ` | knop ${a.knop}` : ''}`));
  }
  return regels.length > 1 ? regels : null;
}

// Cijfers uit de tabellen van het Word rapport. Het rapport is leidend, dus deze cijfers gaan voor op n8n.
// Werkt met tabellen waar de maanden in de kolommen staan (kpi per rij) en met tabellen waar de maanden in de rijen staan.
const VELD_NAMEN = [
  ['conversies', /^(conversies|leads|reserveringen|aanvragen|offerte aanvragen|offertes|resultaten)\b/i],
  ['kosten', /^kosten\b/i],
  ['klikken', /^(klikken|clicks)\b/i],
  ['vertoningen', /^(vertoningen|impressies|weergaven)\b/i]
];

function celGetal(t) {
  const m = String(t || '').replace(/ /g, ' ').match(/-?\d[\d.\s]*(?:,\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/[.\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const platTekst = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&euro;/g, '€').replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c))).replace(/\s+/g, ' ').trim();

function tabelNaarRijen(html) {
  return (html.match(/<tr[\s\S]*?<\/tr>/g) || []).map((r) => (r.match(/<t[dh][\s\S]*?<\/t[dh]>/g) || []).map(platTekst));
}

function cijfersUitTabel(rijen, maandNaam) {
  const uit = {};
  const mn = maandNaam.toLowerCase();
  const kort = mn.slice(0, 3);
  const isMaand = (t) => { const x = String(t || '').toLowerCase().trim(); return x === mn || x.startsWith(`${mn} `) || x === kort || x.startsWith(`${kort} `) || x.startsWith(`${kort}.`); };
  // Maanden in de kolommen: zoek de kopregel met de maand
  for (const kop of rijen) {
    const kol = kop.findIndex((c, i) => i > 0 && isMaand(c));
    if (kol < 0) continue;
    rijen.forEach((r) => {
      const def = VELD_NAMEN.find(([, re]) => re.test(String(r[0] || '').trim()));
      if (def && uit[def[0]] === undefined) { const g = celGetal(r[kol]); if (g !== null) uit[def[0]] = g; }
    });
    if (Object.keys(uit).length) return uit;
  }
  // Maanden in de rijen: de eerste cel van de rij is de maand, de kop heeft de kpi namen
  const kopRij = rijen.find((r) => r.some((c) => VELD_NAMEN.some(([, re]) => re.test(String(c).trim()))));
  const maandRij = rijen.find((r) => isMaand(r[0]));
  if (kopRij && maandRij) {
    kopRij.forEach((c, i) => {
      const def = VELD_NAMEN.find(([, re]) => re.test(String(c).trim()));
      if (def && uit[def[0]] === undefined) { const g = celGetal(maandRij[i]); if (g !== null) uit[def[0]] = g; }
    });
  }
  return uit;
}

async function leesRapportCijfers(buffer, maand) {
  const mammoth = require('mammoth');
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const blokken = html.match(/<table[\s\S]*?<\/table>|<h[1-6][\s\S]*?<\/h[1-6]>|<p[\s\S]*?<\/p>/g) || [];
  const KANALEN = [['googleAds', /google/i], ['metaAds', /meta|facebook/i], ['linkedIn', /linkedin/i], ['bingAds', /bing|microsoft/i], ['website', /website/i]];
  let kanaal = '';
  const res = {};
  blokken.forEach((b) => {
    if (b.startsWith('<table')) {
      const rijen = tabelNaarRijen(b);
      const eerste = (rijen[0] && rijen[0][0]) || '';
      const k = KANALEN.find(([, re]) => re.test(eerste));
      const naam = k ? k[0] : kanaal;
      if (!naam || res[naam]) return;
      const c = cijfersUitTabel(rijen, MAANDEN[maand - 1]);
      if (Object.keys(c).length) res[naam] = c;
    } else {
      const t = platTekst(b);
      if (t.length < 60) { const k = KANALEN.find(([, re]) => re.test(t)); if (k) kanaal = k[0]; }
    }
  });
  return res;
}

// Rapport uit Word: tekst in het pakket en next steps van het vorige rapport.
const MAX_RAPPORT = 40000;

function sectieRapport(tekst) {
  const t = String(tekst || '').trim();
  if (!t) return null;
  const regels = ['RAPPORT VAN DEZE MAAND (tekst uit het geuploade Word bestand, het rapport is leidend voor de cijfers)'];
  regels.push(t.length > MAX_RAPPORT ? `${t.slice(0, MAX_RAPPORT)}\n[Tekst afgekapt na ${getal(MAX_RAPPORT)} tekens]` : t);
  return regels;
}

// Zoekt de next steps in de tekst van een rapport. Word nummering zit niet in de platte tekst, dus we zoeken op de kop Next steps
// en nemen de zinnen eronder tot de volgende kop. Dylan controleert het resultaat in het portaal.
function haalNextSteps(tekst) {
  const alle = String(tekst || '').split(/\n+/).map((r) => r.trim()).filter(Boolean);
  const uit = [];
  let kanaal = '';
  const isKop = (r) => r.length < 60 && !/[.!?:]$/.test(r);
  for (let i = 0; i < alle.length; i++) {
    const r = alle[i];
    if (/^next steps?\b/i.test(r) && r.length < 40) {
      for (let j = i + 1; j < alle.length; j++) {
        const z = alle[j];
        if (isKop(z) || /^learnings?\b/i.test(z)) break;
        uit.push((kanaal ? `${kanaal}: ` : '') + z.replace(/^(\d+[.)]|[-\u2022*])\s*/, ''));
        i = j;
      }
    } else if (isKop(r) && /(google|meta|linkedin|bing|seo|website|overkoepelend)/i.test(r)) {
      kanaal = r.replace(/[:\u2013-].*$/, '').trim();
    }
  }
  return uit;
}

function bouwTekst({ klant, jaar, maand, context, actiepunten, verdieping, opties, rapportData, rapportTekst }) {
  const opt = opties || {};
  const o = new Proxy({}, { get: (_, k) => opt[k] !== false });
  const ex = (verdieping && verdieping.extra) || {};
  const exG = ex.google || null;
  let g = (verdieping && verdieping.google) || null;
  if (g && exG) g = metGroepStatus(g, exG);
  let nota = null;
  if (g) {
    const t = toerekenen(g, rapportData && rapportData.googleAds ? rapportData.googleAds.conversies : null);
    g = t.g; nota = t.nota;
  }
  const delen = [];
  delen.push([`LEARNINGSPAKKET ${klant.toUpperCase()}, ${MAANDEN[maand - 1].toUpperCase()} ${jaar}`,
    'Dit pakket hoort bij het rapport met de maanddata. Het rapport is leidend: waar het platform minder conversies toont dan het rapport (bijvoorbeeld door handmatig toegevoegde conversies), is het verschil toegerekend aan een campagne en duidelijk als toegerekend gemarkeerd. Alle cijfers hieronder gaan over deze maand, tenzij erbij staat dat het vorige maand is.']);
  delen.push(['CONTEXT VAN DYLAN', context && String(context).trim() ? String(context).trim() : 'Geen extra context aangegeven.']);
  delen.push(sectieActiepunten(actiepunten));
  if (rapportTekst) { const rp = sectieRapport(rapportTekst); if (rp) delen.push(rp); }
  if (g) {
    delen.push(['AFSTEMMING MET HET RAPPORT (Google Ads conversies)', nota.uitleg]);
    delen.push(sectieOpvallend(g, nota));
    delen.push(sectieCampagnes(g, !!o.vorigeMaand), sectieGroepen(g, !!o.vorigeMaand), sectieZoektermenAlles(g));
    if (o.zoekwoorden) delen.push(sectieZoekwoorden(g));
    if (o.advertenties) delen.push(sectieAdvertenties(g));
    if (o.producten) delen.push(sectieProducten(g));
    if (o.uitsluitingen) delen.push(sectieUitsluitingen(g));
    if (o.wijzigingen) delen.push(sectieWijzigingen(g));
    if (o.drieMaanden && sectieAccount(g).length) delen.push(sectieAccount(g));
    if (o.extra && exG) {
      [sectiePmax(exG), sectieAssetgroepen(exG), sectieInstellingen(exG), sectieApparaten(exG), sectieWeekdagen(exG), sectieLandingspaginas(exG), sectieConversieacties(exG)].forEach((x) => { if (x) delen.push(x); });
    }
  } else {
    delen.push(['GOOGLE ADS', 'Geen Google Ads data opgehaald voor deze klant.']);
  }
  if (o.linkedin) {
    delen.push(sectieLinkedIn(verdieping && verdieping.linkedin));
    if (o.extra && ex.linkedin) { const x = sectieLinkedInExtra(ex.linkedin, verdieping && verdieping.linkedin); if (x) delen.push(x); }
  }
  if (o.meta) {
    delen.push(sectieMeta(verdieping && verdieping.meta));
    if (o.extra && ex.meta) { const x = sectieMetaExtra(ex.meta); if (x) delen.push(x); }
  }
  const waarschuwingen = [];
  if (g && (g.fouten || []).length) g.fouten.forEach((f) => waarschuwingen.push(`Google query "${f.query}" gaf een fout: ${f.fout}`));
  if (g && (g.afgekapt || []).length) waarschuwingen.push(`Deze Google onderdelen zijn afgekapt omdat er meer rijen waren: ${g.afgekapt.join(', ')}`);
  ['google', 'linkedin', 'meta'].forEach((k) => { if (ex[k] && (ex[k].fouten || []).length) ex[k].fouten.forEach((f) => waarschuwingen.push(`Extra ${k} data, onderdeel "${f.query}" gaf een fout: ${f.fout}`)); });
  if (ex.fout) waarschuwingen.push(`De extra data kon niet worden opgehaald: ${ex.fout}`);
  if (waarschuwingen.length) delen.push(['KANTTEKENINGEN BIJ DE DATA', ...waarschuwingen]);
  return delen.filter(Boolean).map((d) => d.join('\n')).join('\n\n');
}


// Concept learnings en next steps. Een ruw concept in Dylans schrijfstijl, geschreven met OpenAI (OPENAI_API_KEY staat al in Render).
// ChatGPT maakt er daarna een versie 2.0 van op basis van alle data en het rapport.
const fs = require('fs');
const path = require('path');
const lees = (naam) => { try { return fs.readFileSync(path.join(__dirname, '..', 'config', naam), 'utf8'); } catch (err) { return ''; } };

const CONCEPT_KOP = [
  'RUW CONCEPT LEARNINGS EN NEXT STEPS (versie 1)',
  'Dit is een ruw concept en geen eindtekst. ChatGPT: maak hier een versie 2.0 van op basis van alle data in dit pakket en het bijgevoegde rapport. Verbeter de zinsopbouw en woordkeuze en schrijf het in Dylans schrijfstijl. Controleer elk cijfer en elke bewering tegen de data, haal weg wat de data niet laat zien en vul aan waar de data meer vertelt. Gebruik dit concept alleen als ruwe basis.'
];

function conceptSysteem() {
  return [
    'Je schrijft een ruw concept voor de learnings en next steps van een maandrapportage voor online marketing, op basis van het pakket dat de gebruiker plakt. Een ander model maakt er daarna een betere versie van, dus werk netjes maar hoef niet te polijsten.',
    '',
    'Eisen voor dit pakket (deze gaan voor op de schrijfwijzer hieronder):',
    '1. Gebruik alleen cijfers en feiten uit het pakket. Verzin niets. Als iets niet in het pakket staat, schrijf je er niet over.',
    '2. Het rapport is leidend. Conversies die in het pakket als toegerekend zijn gemarkeerd, noem je conversies volgens het rapport. Schrijf nooit dat het platform ze mat en nooit dat een zoekterm of groep hierdoor "geen conversie" had als er toegerekende conversies bij die campagne staan zonder dat bekend is waar ze bij horen. Schrijf dan over kosten en klikken.',
    '3. Zeg alleen dat een campagne of groep nu aan of uit staat als de status nu in het pakket staat. De status van advertentiegroepen ontbreekt vaak: zeg daar dan niets over.',
    '4. Zoektermen dekken vaak maar een deel van de kosten. Noem dat als je conclusies over zoektermen trekt.',
    '5. Schrijf per kanaal dat in het pakket staat: Learnings en Next steps. Next steps zijn twee tot vier genummerde punten, actief geformuleerd ("we sluiten uit", "we geven meer budget"), met de aanleiding in cijfers en waar mogelijk een beslismoment.',
    '6. Verwerk de context van de gebruiker en de status van de actiepunten van vorige maand als die in het pakket staan.',
    '7. Sluit af met een korte regel Wat ik niet kon zien, waarin je opnoemt welke data ontbrak en waar je dus niets over zegt.',
    '8. Schrijf in het Nederlands. Geen streepjes als leesteken, geen emoticons, geen vet.',
    '',
    'SCHRIJFWIJZER',
    lees('schrijfwijzer-learnings.md'),
    '',
    'VOORBEELD VAN DE STIJL (andere klant en andere maand, gebruik de cijfers en feiten hieruit nooit)',
    lees('voorbeeld-learnings.txt')
  ].join('\n');
}

async function schrijfConcept(pakketTekst) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { tekst: null, reden: 'OPENAI_API_KEY staat niet in Render, dus er is geen concept geschreven.' };
  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5.5', instructions: conceptSysteem(), input: pakketTekst, reasoning: { effort: 'low' } }),
      signal: AbortSignal.timeout(150000)
    });
    if (!res.ok) return { tekst: null, reden: `Het concept schrijven mislukte (status ${res.status}): ${(await res.text().catch(() => '')).slice(0, 200)}` };
    const data = await res.json();
    let tekst = typeof data.output_text === 'string' ? data.output_text : '';
    if (!tekst) for (const o of data.output || []) for (const c of o.content || []) if (c.type === 'output_text') tekst += c.text || '';
    tekst = tekst.trim();
    return tekst ? { tekst, reden: null } : { tekst: null, reden: 'Het concept was leeg.' };
  } catch (err) {
    return { tekst: null, reden: `Het concept schrijven mislukte: ${err.message}` };
  }
}

async function maakPakket({ klant, jaar, maand, context, actiepunten, opties, rapportTekst, rapportCijfers }) {
  klant = String(klant || '').trim();
  jaar = Number(jaar); maand = Number(maand);
  if (!klant) throw new Error('Kies een klant.');
  if (!(maand >= 1 && maand <= 12) || !(jaar >= 2024 && jaar <= 2100)) throw new Error('Maand of jaar klopt niet.');
  const [verdieping, extra, rijen] = await Promise.all([haalVerdieping({ klant, jaar, maand }), haalExtra({ klant, jaar, maand }), alleRijen(MAANDDATA_TABLE_ID).catch(() => [])]);
  verdieping.extra = extra;
  const rij = rijen.filter((r) => r.klant === klant && Number(r.jaar) === jaar && Number(r.maand) === maand).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
  let rapportData = null;
  try { rapportData = rij ? JSON.parse(rij.data) : null; } catch (err) { /* geen json */ }
  if (rapportCijfers && typeof rapportCijfers === 'object' && Object.keys(rapportCijfers).length) {
    rapportData = rapportData || {};
    Object.entries(rapportCijfers).forEach(([k, v]) => { rapportData[k] = { ...(rapportData[k] || {}), ...v }; });
  }
  let tekst = bouwTekst({ klant, jaar, maand, context, actiepunten, verdieping, opties, rapportData, rapportTekst });
  const concept = await schrijfConcept(tekst);
  tekst += `\n\n${CONCEPT_KOP.join('\n')}\n${concept.tekst || `Geen concept meegegeven. ${concept.reden}`}`;
  return { tekst, bestandsnaam: `Learningspakket ${klant} ${jaar}-${String(maand).padStart(2, '0')}.txt`, rapportAanwezig: !!rapportData || !!(rapportTekst && String(rapportTekst).trim()), conceptGeschreven: !!concept.tekst, conceptReden: concept.reden };
}

async function haalExtra({ klant, jaar, maand }) {
  try {
    const res = await fetch(`${N8N_BASE_URL}/webhook/learningspakket-extra`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ klant, jaar, maand }), signal: AbortSignal.timeout(170000)
    });
    const raw = await res.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (err) { /* geen json */ }
    if (Array.isArray(data)) data = data[0];
    if (!res.ok || !data) return { fout: `status ${res.status}${raw ? `, ${raw.slice(0, 150)}` : ''}` };
    return data;
  } catch (err) {
    return { fout: err.message };
  }
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

module.exports = { leesRapportCijfers, haalNextSteps, maakPakket, bouwTekst, CONCEPT_KOP, conceptSysteem };
