// Pagr. werkplaats (stap 2, 14-10-2026): een scherm per klant met de stappen, de pagina's in vier standen,
// de sjablonen en een adviespaneel. Gebruikt alleen bestaande API's (/clients, /pages, /templates).
// De negen Notion-statussen blijven ongewijzigd; hier worden ze alleen als vier standen getoond.

const WP_STAND = {
  'Idee': 'Gepland',
  'Formulier ingevuld': 'In de maak',
  'Feitensheet ter review': 'Ter controle',
  'Content klaar': 'Ter controle',
  'Ter review': 'Ter controle',
  'Goedgekeurd': 'Ter controle',
  'Klaar voor live': 'Klaar voor live',
  'Afgewezen': 'In de maak',
  'Fout': 'In de maak',
  'Gepubliceerd': 'Live'
};
const WP_STAND_KLASSE = { 'Voorstel': 'wp-voorstel', 'Gepland': 'wp-gepland', 'In de maak': 'wp-maak', 'Ter controle': 'wp-controle', 'Klaar voor live': 'wp-klaar', 'Live': 'wp-live' };
const WP_STANDEN = ['Voorstel', 'Gepland', 'In de maak', 'Ter controle', 'Klaar voor live', 'Live'];

function wpStandVan(status) { return WP_STAND[status] || 'In de maak'; }
// Een pagina met stand Idee die nog op jouw besluit wacht (voorstel uit het plan of idee van de klant) heeft de stand
// Voorstel en telt niet mee als Gepland. De Notion status blijft Idee. p.voorstel wordt gezet in wpMarkeerVoorstellen.
function wpStandPagina(p) { return p && p.voorstel && p.status === 'Idee' ? 'Voorstel' : wpStandVan(p && p.status); }
function wpEsc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Zet p.voorstel op pagina's die wachten op jouw besluit: de voorstellen van het plan en de ideeen van de klant.
function wpMarkeerVoorstellen(pages) {
  const ids = new Set([...(((lpState.wpVoorgesteld || {}).voorstellen) || []), ...(lpState.wpIdeeen || [])].map((x) => x.id));
  return (pages || []).map((p) => (ids.has(p.id) ? { ...p, voorstel: true } : p));
}

// ---- Fase 3: maanden, Onderweg, resultaten en activiteit (23-10-2026). Zuivere functies, getest in test/lp-werkplaats.test.js ----
const WP_MAAND_NAMEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
function wpMaandSleutel(nu) {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit' }).formatToParts(nu || new Date());
  return `${d.find((x) => x.type === 'year').value}-${d.find((x) => x.type === 'month').value}`;
}
function wpVolgendeMaand(sleutel) { const [j, m] = String(sleutel).split('-').map(Number); return m === 12 ? `${j + 1}-01` : `${j}-${String(m + 1).padStart(2, '0')}`; }
function wpMaandNaam(sleutel) { return WP_MAAND_NAMEN[Number(String(sleutel).split('-')[1]) - 1] || sleutel; }

// Pillen onder de kop van de werkplaats: wat is aan, hoeveel per maand, automatisch live en plan, paginameting.
function wpKopPillen(inst, pages) {
  const i = inst || {};
  const live = (pages || []).filter((p) => p.status === 'Gepubliceerd').length;
  const pillen = [];
  if (i.automatisering) pillen.push({ klasse: 'wp-live', tekst: i.intern && !i.pagr ? 'Eigen werk, automatisering draait' : 'Pagr. aan, automatisering draait' });
  else pillen.push({ klasse: 'wp-controle', tekst: 'Pagr. uit, je maakt pagina\'s zelf' });
  if (i.paginasPerMaand) pillen.push({ klasse: 'wp-gepland', tekst: `${i.paginasPerMaand} pagina's per maand` });
  const auto = (naam, aan) => (aan ? (live >= 5 ? { klasse: 'wp-live', tekst: `${naam} aan` } : { klasse: 'wp-gepland', tekst: `${naam} aan vanaf 5 live pagina's (nu ${live})` }) : { klasse: 'wp-controle', tekst: `${naam} uit: ${live} van 5 live pagina's` });
  pillen.push(auto('Automatisch live', i.autoLive === true));
  if (i.plan) pillen.push(auto('Plan automatisch goedkeuren', i.autoPlan === true));
  pillen.push(i.paginameting ? { klasse: 'wp-live', tekst: 'Paginameting aan' } : { klasse: 'wp-controle', tekst: 'Paginameting uit' });
  return pillen;
}

// Wat gebeurt er na akkoord op het plan? Drie stappen in gewone woorden, afhankelijk van automatisch live.
function wpNaAkkoordStappen(inst, live) {
  const i = inst || {};
  const n = Number(live) || 0;
  let laatste;
  if (i.autoLive === true && n >= 5) laatste = 'Een schone pagina gaat meteen na de controle automatisch live. Er is geen vaste datum: elke pagina gaat live zodra hij klaar is.';
  else if (i.autoLive === true) laatste = `Automatisch live staat aan, maar werkt pas vanaf 5 live pagina's (nu ${n}). Tot dan zet jij schone pagina's live met de knop Zet live.`;
  else laatste = 'Automatisch live staat uit: jij zet schone pagina\'s live met de knop Zet live bij Wacht op jou. Er is dus geen vaste datum. Een pagina gaat pas live als jij dat doet.';
  return [
    'Schrijven: het systeem begint direct, een pagina per keer. Ze komen eerst in de kolom Gepland en in de maak.',
    'Controle: een pagina zonder open punten wordt Klaar voor live. Een pagina met een punt komt bij Wacht op jou om te controleren.',
    laatste
  ];
}

// Wat staat er voor volgende maand klaar? Voorstellen van het plan met plan.maand van volgende maand.
function wpVolgendeInfo(voorstellen, nu) {
  const volgende = wpVolgendeMaand(wpMaandSleutel(nu));
  const lijst = (voorstellen || []).filter((v) => v.maand === volgende);
  return { maand: volgende, naam: wpMaandNaam(volgende), voorstellen: lijst };
}

// Vijf kolommen van voorstel tot live. Gepland en In de maak zitten samen in een kolom. Live toont de laatste vijf.
function wpOnderwegKolommen(pages, maxLive) {
  const kolommen = [
    { naam: 'Voorstel', klasse: 'wp-voorstel', leeg: 'Hier staat het plan van het systeem tot jij het goedkeurt.', paginas: [] },
    { naam: 'Gepland en in de maak', klasse: 'wp-maak', leeg: 'Na akkoord begint het schrijven vanzelf.', paginas: [] },
    { naam: 'Ter controle', klasse: 'wp-controle', leeg: 'Alleen pagina\'s met een open punt komen hier.', paginas: [] },
    { naam: 'Klaar voor live', klasse: 'wp-klaar', leeg: 'Schoon door de controle.', paginas: [] },
    { naam: 'Live', klasse: 'wp-live', leeg: 'Nog niets live.', paginas: [] }
  ];
  const plek = { 'Voorstel': 0, 'Gepland': 1, 'In de maak': 1, 'Ter controle': 2, 'Klaar voor live': 3, 'Live': 4 };
  (pages || []).forEach((p) => {
    kolommen[plek[wpStandPagina(p)]].paginas.push({ id: p.id, titel: p.titel || '(zonder titel)', fout: p.status === 'Fout' || p.status === 'Afgewezen', bijgewerkt: p.laatstGewijzigd || '', liveDatum: p.liveDatum || '', voorstel: wpStandPagina(p) === 'Voorstel' });
  });
  const live = kolommen[4];
  live.paginas.sort((a, b) => String(b.bijgewerkt).localeCompare(String(a.bijgewerkt)));
  live.meer = Math.max(0, live.paginas.length - (maxLive || 5));
  live.paginas = live.paginas.slice(0, maxLive || 5);
  return kolommen;
}

// Wat deed het systeem? Afgeleid uit de status en de laatste wijziging per pagina, nieuwste eerst. Geen aparte opslag.
function wpActiviteit(pages, max) {
  const tekst = {
    'Gepubliceerd': 'is live gezet',
    'Klaar voor live': 'is geschreven en gecontroleerd, klaar voor live',
    'Content klaar': 'is geschreven en wacht op jouw controle',
    'Ter review': 'staat als concept in WordPress',
    'Goedgekeurd': 'is goedgekeurd',
    'Formulier ingevuld': 'wordt geschreven',
    'Fout': 'is mislukt',
    'Afgewezen': 'is afgewezen'
  };
  return (pages || []).map((p) => {
    let t = tekst[p.status];
    if (p.status === 'Idee') t = p.voorstel ? 'staat als voorstel klaar' : 'staat gepland';
    return t && p.laatstGewijzigd ? { id: p.id, titel: p.titel || '(zonder titel)', tekst: t, op: p.status === 'Gepubliceerd' && p.liveDatum ? p.liveDatum : p.laatstGewijzigd, fout: p.status === 'Fout' } : null;
  }).filter(Boolean).sort((a, b) => String(b.op).localeCompare(String(a.op))).slice(0, max || 8);
}

// Resultaat van een live pagina in gewone woorden.
function wpResultaatTekst(p, nu) {
  const dagen = p.liveDatum ? Math.floor(((nu || new Date()) - new Date(p.liveDatum)) / 86400000) : null;
  if (!p.google) return { google: dagen != null && dagen < 7 ? 'Meting na 7 dagen' : 'Geen meting', ai: '' };
  const g = p.google;
  const ai = p.ai ? (p.ai.geciteerd > 0 ? `${p.ai.geciteerd}x genoemd` : 'Niet genoemd') : '';
  return { google: `${g.vertoningen} vertoningen, ${g.klikken} klikken${g.positie != null ? `, positie ${g.positie}` : ''}`, ai };
}

// Advies uit de echte gegevens van de klant. Geeft een lijst { tekst, knop, actie } terug.
function wpBouwAdvies({ pages, templates }) {
  const actief = templates.filter((t) => t.status === 'Actief');
  const tellers = { 'Voorstel': 0, 'Gepland': 0, 'In de maak': 0, 'Ter controle': 0, 'Klaar voor live': 0, 'Live': 0 };
  pages.forEach((p) => { tellers[wpStandPagina(p)] += 1; });
  const fout = pages.filter((p) => p.status === 'Fout' || p.status === 'Afgewezen');
  const advies = [];
  if (!actief.length) {
    advies.push({ soort: 'let-op', tekst: 'Er is nog geen actief sjabloon. Maak eerst een sjabloon, dan kun je daarna pagina\'s maken.', knop: 'Sjabloon maken', actie: 'sjabloon' });
  }
  if (fout.length) {
    advies.push({ soort: 'fout', tekst: fout.length === 1 ? 'Een pagina is mislukt of afgewezen en wacht op jou.' : `${fout.length} pagina's zijn mislukt of afgewezen en wachten op jou.`, knop: 'Bekijk', pagina: fout[0].id });
  }
  if (tellers['Klaar voor live']) {
    const n = tellers['Klaar voor live'];
    advies.push({ soort: 'plan', tekst: n === 1 ? 'Een pagina is schoon door de controle gekomen en staat klaar voor live.' : `${n} pagina's zijn schoon door de controle gekomen en staan klaar voor live.`, knop: n === 1 ? 'Zet live' : 'Zet alle live', actie: 'zet-live-bulk' });
  }
  if (typeof lpState !== 'undefined' && lpState.wpLiveMelding) advies.push({ soort: 'goed', tekst: lpState.wpLiveMelding });
  if (tellers['Ter controle']) {
    const eerste = pages.find((p) => wpStandVan(p.status) === 'Ter controle');
    advies.push({ soort: 'plan', tekst: tellers['Ter controle'] === 1 ? 'Een pagina wacht op jouw controle voordat hij live kan.' : `${tellers['Ter controle']} pagina's wachten op jouw controle voordat ze live kunnen.`, knop: 'Controleren', pagina: eerste && eerste.id });
  }
  if (tellers['Gepland'] && actief.length) {
    advies.push({ soort: 'plan', tekst: tellers['Gepland'] === 1 ? 'Een pagina staat gepland. Je kunt hem nu laten maken.' : `${tellers['Gepland']} pagina's staan gepland. Je kunt ze nu laten maken.`, knop: 'Nieuwe pagina', actie: 'pagina' });
  }
  if (actief.length && !pages.length) {
    advies.push({ soort: 'plan', tekst: 'Er zijn nog geen pagina\'s voor deze klant. Begin met de dienst of plaats die het meest oplevert.', knop: 'Eerste pagina maken', actie: 'pagina' });
  }
  if (tellers['Live'] && !fout.length && !tellers['Ter controle']) {
    advies.push({ soort: 'goed', tekst: `${tellers['Live']} ${tellers['Live'] === 1 ? 'pagina staat' : 'pagina\'s staan'} live. Plan de volgende pagina op basis van wat mensen echt zoeken.`, knop: 'Nieuwe pagina', actie: 'pagina' });
  }
  if (!advies.length) advies.push({ soort: 'goed', tekst: 'Niets dat nu aandacht nodig heeft.' });
  return { advies, tellers, actief };
}

function wpStappen({ tellers, actief, pages }) {
  const live = tellers['Live'];
  const stappen = [
    { nr: 1, titel: 'Sjabloon', sub: actief.length ? `${actief.length} actief` : 'nog geen', klaar: actief.length > 0, tab: 'sjablonen' },
    { nr: 2, titel: 'Pagina\'s maken', sub: pages.length ? `${pages.length} in totaal` : 'nog geen', klaar: pages.length > 0, tab: 'nieuw' },
    { nr: 3, titel: 'Controleren', sub: tellers['Ter controle'] ? `${tellers['Ter controle']} wachten` : 'niets te doen', klaar: pages.length > 0 && !tellers['Ter controle'], tab: 'paginas' },
    { nr: 4, titel: 'Live', sub: live ? `${live} live` : 'nog niet', klaar: live > 0, tab: 'paginas' }
  ];
  return stappen.map((s) => `<button type="button" class="wp-stap ${s.klaar ? 'klaar' : ''}" data-wp-tab="${s.tab}"><span class="wp-stap-nr">${s.klaar ? '&#10003;' : s.nr}</span><span><strong>${s.titel}</strong><small>${s.sub}</small></span></button>`).join('');
}

function wpTeken() {
  const klantId = document.getElementById('wpKlant').value;
  const pages = wpMarkeerVoorstellen(lpState.wpPages || []);
  const templates = lpState.wpTemplates || [];
  const uit = wpBouwAdvies({ pages, templates });

  document.getElementById('wpStappen').innerHTML = wpStappen({ tellers: uit.tellers, actief: uit.actief, pages });
  document.querySelectorAll('#wpStappen .wp-stap').forEach((b) => b.addEventListener('click', () => switchLpTab(b.dataset.wpTab)));

  wpTekenWacht(pages);
  wpTekenBulk();
  wpTekenOnderweg(pages);
  wpTekenLog(pages);
  wpTekenVolgende();
  document.getElementById('wpTellers').innerHTML = WP_STANDEN.map((s) => `<span class="wp-pil ${WP_STAND_KLASSE[s]}"><span class="wp-stip"></span>${s} <b>${uit.tellers[s]}</b></span>`).join('');

  const WP_ZICHTBAAR = 5;
  const alle = Boolean(lpState.wpAllePaginas);
  const zichtbaar = alle ? pages : pages.slice(0, WP_ZICHTBAAR);
  const meer = document.getElementById('wpPaginasMeer');
  meer.classList.toggle('hidden', pages.length <= WP_ZICHTBAAR);
  meer.textContent = alle ? 'Toon minder' : `Toon alle ${pages.length} pagina's`;
  meer.onclick = () => { lpState.wpAllePaginas = !lpState.wpAllePaginas; wpTeken(); };
  document.getElementById('wpPaginas').innerHTML = zichtbaar.map((p) => {
    const stand = wpStandPagina(p);
    return `<tr class="lp-row" data-page-id="${wpEsc(p.id)}"><td class="wp-vinkcel"><label class="wp-vink"><input type="checkbox" data-sel="${wpEsc(p.id)}" aria-label="Selecteer ${wpEsc(p.titel || '')}"></label></td><td><strong>${wpEsc(p.titel || '(zonder titel)')}</strong></td><td><span class="wp-pil ${WP_STAND_KLASSE[stand]}"><span class="wp-stip"></span>${stand}</span></td><td class="wp-muted">${p.laatstGewijzigd ? new Date(p.laatstGewijzigd).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="4" class="wp-muted">Nog geen pagina\'s voor deze klant.</td></tr>';
  document.querySelectorAll('#wpPaginas tr.lp-row').forEach((row) => {
    row.addEventListener('click', (e) => { if (e.target.closest('.wp-vink')) return; lpState.laatsteLijst = 'werkplaats'; openPageDetail(row.dataset.pageId); });
  });
  lpKoppelSelectie('wpPagina', document.getElementById('wpPaginas'));

  document.getElementById('wpSjablonen').innerHTML = templates.length
    ? templates.map((t) => `<div class="wp-sjabloon" data-tpl-id="${wpEsc(t.id)}"><label class="wp-vink"><input type="checkbox" data-sel="${wpEsc(t.id)}" aria-label="Selecteer ${wpEsc(t.naam)}"></label><strong>${wpEsc(t.naam)}</strong><span class="wp-pil ${t.status === 'Actief' ? 'wp-live' : 'wp-gepland'}"><span class="wp-stip"></span>${wpEsc(t.status)}</span></div>`).join('')
    : '<p class="wp-muted">Nog geen sjablonen voor deze klant.</p>';
  document.querySelectorAll('#wpSjablonen .wp-sjabloon').forEach((el) => {
    el.addEventListener('click', (e) => { if (e.target.closest('.wp-vink')) return; switchLpTab('sjablonen'); if (typeof openTemplateDetail === 'function') openTemplateDetail(el.dataset.tplId); });
  });

  lpKoppelSelectie('wpSjab', document.getElementById('wpSjablonen'));

  document.getElementById('wpAdvies').innerHTML = uit.advies.map((a, i) => `<div class="wp-advies-item ${a.soort}"><p>${wpEsc(a.tekst)}</p>${a.knop ? `<button type="button" class="btn btn-plain" data-adv="${i}">${wpEsc(a.knop)}</button>` : ''}</div>`).join('');
  document.querySelectorAll('#wpAdvies [data-adv]').forEach((b) => {
    const a = uit.advies[Number(b.dataset.adv)];
    b.addEventListener('click', () => {
      if (a.pagina) { lpState.laatsteLijst = 'werkplaats'; openPageDetail(a.pagina); return; }
      if (a.actie === 'zet-live-bulk') { wpZetSchoneLive(klantId, b); return; }
      if (a.actie === 'sjabloon') { switchLpTab('sjablonen'); document.getElementById('lpNewTemplateBtn')?.click(); return; }
      if (a.actie === 'pagina') {
        switchLpTab('nieuw');
        const sel = document.getElementById('lpNewKlant');
        if (sel && klantId) { sel.value = klantId; sel.dispatchEvent(new Event('change')); }
      }
    });
  });
}

// Alle schone pagina's van de klant live zetten. Elke pagina wordt vlak voor het live gaat opnieuw gecontroleerd.
async function wpZetSchoneLive(klantId, knop) {
  const n = (lpState.wpPages || []).filter((p) => wpStandVan(p.status) === 'Klaar voor live').length;
  if (!n || !window.confirm(`${n} ${n === 1 ? 'pagina' : "pagina's"} live zetten op de website van de klant?`)) return;
  knop.disabled = true;
  knop.textContent = 'Bezig...';
  try {
    const r = await lpApi(`/clients/${encodeURIComponent(klantId)}/zet-schone-live`, { method: 'POST', body: JSON.stringify({ bevestigd: true }) });
    const delen = [`${r.gelukt.length} live gezet`];
    if (r.overgeslagen.length) delen.push(`${r.overgeslagen.length} terug naar controleren (${r.overgeslagen.map((o) => `${o.titel}: ${o.reden}`).join('; ')})`);
    if (r.fouten.length) delen.push(`${r.fouten.length} mislukt (${r.fouten.map((f) => `${f.titel}: ${f.fout}`).join('; ')})`);
    lpState.wpLiveMelding = delen.join('. ') + '.';
  } catch (err) {
    lpState.wpLiveMelding = `Live zetten is niet gelukt: ${err.message}`;
  }
  await wpLaad();
}

async function wpLaad() {
  const fout = document.getElementById('wpFout');
  fout.classList.add('hidden');
  const klantId = document.getElementById('wpKlant').value;
  if (!klantId) return;
  try {
    const [{ pages }, { templates }] = await Promise.all([
      lpApi('/pages?klant=' + encodeURIComponent(klantId)),
      lpApi('/templates?klant=' + encodeURIComponent(klantId))
    ]);
    if (lpState.wpGeladenKlant !== klantId) { lpState.wpGeladenKlant = klantId; lpState.wpVoorgesteld = null; lpState.wpIdeeen = []; lpState.wpAllePaginas = false; lpState.wpWachtKlaar = false; }
    lpState.wpPages = pages;
    try { window.parent.postMessage({ type: 'pagr-gewijzigd' }, window.location.origin); } catch (e) { /* niet in een frame */ }
    lpState.wpTemplates = (templates || []).filter((t) => t.status !== 'Gearchiveerd');
    wpTeken();
    wpLaadExtra();
  } catch (err) {
    fout.textContent = err.message;
    fout.classList.remove('hidden');
  }
}

async function wpStart() {
  const sel = document.getElementById('wpKlant');
  sel.innerHTML = lpState.clients.map((c) => `<option value="${wpEsc(c.id)}">${wpEsc(c.naam)}</option>`).join('');
  sel.addEventListener('change', wpLaad);
  document.getElementById('wpNieuwePagina').addEventListener('click', () => {
    switchLpTab('nieuw');
    const k = document.getElementById('lpNewKlant');
    if (k) { k.value = sel.value; k.dispatchEvent(new Event('change')); }
  });
  document.getElementById('wpTerug').addEventListener('click', () => switchLpTab('overzicht'));
  document.getElementById('wpNaarKlantgegevens').addEventListener('click', () => {
    switchLpTab('klantgegevens');
    const k = document.getElementById('kgKlant');
    if (k) { k.value = sel.value; k.dispatchEvent(new Event('change')); }
  });
  document.getElementById('wpNieuwSjabloon').addEventListener('click', () => {
    switchLpTab('sjablonen');
    document.getElementById('lpNewTemplateBtn')?.click();
  });
  document.getElementById('wpPlanKnop').addEventListener('click', wpPlanVoorstel);
  wpBindVraag();
  document.getElementById('wpKloonKnop').addEventListener('click', () => switchLpTab('kloon'));
  sel.addEventListener('change', () => {
    document.getElementById('wpAantal').value = wpPlanOpslag(sel.value) || 4;
    document.getElementById('wpPlanLijst').innerHTML = '';
    document.getElementById('wpPlanStatus').textContent = '';
  });
  document.getElementById('wpAantal').value = wpPlanOpslag(sel.value) || 4;
  await wpLaad();
}

// ---- Plan (stap 3) ----
function wpPlanOpslag(klant, waarde) {
  try {
    const sleutel = 'pagrAantal:' + klant;
    if (waarde === undefined) return localStorage.getItem(sleutel);
    localStorage.setItem(sleutel, String(waarde));
  } catch (e) { /* zonder opslag werkt het ook */ }
  return null;
}

function wpTekenPlan(uit) {
  const lijst = document.getElementById('wpPlanLijst');
  const actief = (lpState.wpTemplates || []).filter((t) => t.status === 'Actief');
  if (!uit.voorstellen.length) {
    lijst.innerHTML = '<p class="wp-muted">De AI vond geen nieuwe pagina\'s om voor te stellen. Probeer een wens of een ander aantal.</p>';
    return;
  }
  const volumeTekst = (v) => (typeof v.volume === 'number' ? `<span class="wp-pil wp-live">${v.volume.toLocaleString('nl-NL')} zoekopdrachten per maand</span>` : '');
  const signaal = (n) => (n == null ? '<span class="wp-muted">geen zoeksignaal</span>' : n > 0 ? `<span class="wp-pil wp-live">${n} Google suggesties</span>` : '<span class="wp-pil wp-controle">geen Google suggesties</span>');
  lijst.innerHTML = `<div class="wp-plan-items">${uit.voorstellen.map((v, i) => `
    <label class="wp-plan-item"><input type="checkbox" checked data-i="${i}">
      <span class="wp-plan-tekst"><input type="text" class="wp-plan-titel" data-titel="${i}" value="${wpEsc(v.titel)}" aria-label="Titel van de pagina"><small>${wpEsc(v.reden)}</small><span class="wp-plan-meta">${wpEsc(v.soort)} ${volumeTekst(v)} ${signaal(v.signaal)}</span></span>
    </label>`).join('')}</div>
    ${uit.dubbel.length ? `<p class="wp-muted">${uit.dubbel.length} voorstel${uit.dubbel.length === 1 ? '' : 'len'} weggelaten omdat de pagina al bestaat of dubbel was.</p>` : ''}
    <div class="wp-plan-actie">
      ${actief.length > 1 ? `<select id="wpPlanSjabloon">${actief.map((t) => `<option value="${wpEsc(t.blueprintId)}">${wpEsc(t.naam)}</option>`).join('')}</select>` : ''}
      <button type="button" id="wpPlanKeur" class="btn btn-approve" ${actief.length ? '' : 'disabled'}>Keur geselecteerde goed</button>
      ${actief.length ? '' : '<span class="wp-muted">Maak eerst een actief sjabloon.</span>'}
    </div>`;
  document.getElementById('wpPlanKeur')?.addEventListener('click', async (e) => {
    const knop = e.currentTarget;
    const gekozen = [...lijst.querySelectorAll('input[type=checkbox]:checked')].map((c) => {
      const v = uit.voorstellen[Number(c.dataset.i)];
      const titelVeld = lijst.querySelector(`input[data-titel="${c.dataset.i}"]`);
      return { ...v, titel: (titelVeld && titelVeld.value.trim()) || v.titel };
    });
    if (!gekozen.length) { document.getElementById('wpPlanStatus').textContent = 'Kies minstens een pagina.'; return; }
    const blueprint = (document.getElementById('wpPlanSjabloon') || {}).value || actief[0].blueprintId;
    knop.disabled = true;
    try {
      const r = await lpApi('/plan/goedkeuren', { method: 'POST', body: JSON.stringify({ klant: document.getElementById('wpKlant').value, blueprint, voorstellen: gekozen }) });
      document.getElementById('wpPlanStatus').textContent = `${r.aangemaakt.length} pagina${r.aangemaakt.length === 1 ? '' : '\'s'} gepland.`;
      lijst.innerHTML = '';
      await wpLaad();
    } catch (err) {
      document.getElementById('wpPlanStatus').textContent = err.message;
      knop.disabled = false;
    }
  });
}

async function wpPlanVoorstel() {
  const klant = document.getElementById('wpKlant').value;
  const aantal = Number(document.getElementById('wpAantal').value) || 4;
  const wens = document.getElementById('wpWens').value.trim();
  const status = document.getElementById('wpPlanStatus');
  const knop = document.getElementById('wpPlanKnop');
  wpPlanOpslag(klant, aantal);
  knop.disabled = true;
  status.textContent = 'De AI maakt een voorstel. Dit duurt even.';
  document.getElementById('wpPlanLijst').innerHTML = '';
  try {
    const uit = await lpApi('/plan/voorstel', { method: 'POST', body: JSON.stringify({ klant, aantal, wens }) });
    const meting = lpState.wpInst && lpState.wpInst.paginameting;
    const volumeTip = uit.volumeBeschikbaar ? '' : (meting ? ' Zonder zoekvolume: de volume koppeling staat nog niet aan (zie het bouwstanddocument).' : ' Zonder zoekvolume: de Paginameting staat uit voor deze klant.');
    status.textContent = `${uit.voorstellen.length} voorstel${uit.voorstellen.length === 1 ? '' : 'len'}. Pas een titel aan, haal weg wat je niet wilt en keur de rest goed.${volumeTip}`;
    wpTekenPlan(uit);
  } catch (err) {
    status.textContent = err.message;
  } finally {
    knop.disabled = false;
  }
}

// Bulk: de server maakt na elkaar de tekst voor alle geplande pagina's. Een optie, geen standaard.
// De voortgang blijft staan als je het tabblad sluit: bij terugkomst start je de knop opnieuw en zie je dezelfde taak.
function wpTekenBulk() {
  const el = document.getElementById('wpBulk');
  const gepland = wpMarkeerVoorstellen(lpState.wpPages || []).filter((p) => wpStandPagina(p) === 'Gepland');
  if (!gepland.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.classList.remove('hidden');
  el.innerHTML = `<span>${gepland.length} gepland. Je kunt ze een voor een openen, of alle tekst in een keer laten maken.</span><button type="button" id="wpBulkKnop" class="btn btn-plain">Alles in bulk laten maken</button><span id="wpBulkStatus" class="wp-muted">${wpEsc(lpState.wpBulkMelding || '')}</span>`;
  document.getElementById('wpBulkKnop').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    const st = document.getElementById('wpBulkStatus');
    try {
      let { taak } = await lpApi('/plan/bulk', { method: 'POST', body: JSON.stringify({ klant: document.getElementById('wpKlant').value }) });
      while (taak.status === 'bezig') {
        st.textContent = `Bezig: ${taak.klaar} van ${taak.totaal} klaar${taak.huidige ? `, nu ${taak.huidige}` : ''}.`;
        await new Promise((r) => setTimeout(r, 4000));
        taak = (await lpApi(`/plan/bulk/${taak.id}`)).taak;
      }
      lpState.wpBulkMelding = `${taak.klaar} van ${taak.totaal} gemaakt.${taak.fouten.length ? ` Mislukt: ${taak.fouten.map((f) => f.titel).join(', ')}.` : ' Ze staan nu bij Ter controle.'}`;
      st.textContent = lpState.wpBulkMelding;
    } catch (err) {
      lpState.wpBulkMelding = err.message;
      st.textContent = err.message;
    }
    await wpLaad();
  });
}

// ---- Klantideeen, bijhouden en adviseur (stap 6) ----
async function wpLaadExtra() {
  const klant = document.getElementById('wpKlant').value;
  const [inst, ideeen, bijhouden] = await Promise.all([
    lpApi('/plan/instellingen?klant=' + encodeURIComponent(klant)).catch(() => ({})),
    lpApi('/plan/ideeen?klant=' + encodeURIComponent(klant)).catch(() => ({ ideeen: [] })),
    lpApi('/plan/bijhouden?klant=' + encodeURIComponent(klant)).catch(() => ({ voorstellen: [], googleBeschikbaar: false, aiBeschikbaar: false }))
  ]);
  lpState.wpInst = inst;
  wpTekenModule(inst);
  wpTekenMaand(lpState.wpPages || [], inst);
  if (inst.automatisering) wpSyncLive(klant);
  if (inst.paginasPerMaand && !wpPlanOpslag(klant)) document.getElementById('wpAantal').value = inst.paginasPerMaand;
  wpTekenIdeeen(ideeen.ideeen || []);
  wpLaadVerwijderd(klant);
  wpTekenPlanKaart(inst);
  await wpLaadMaandplan(klant, Boolean(inst.plan));
  lpState.wpWachtKlaar = true;
  wpTeken();
  wpTekenBijhouden(bijhouden);
  wpTekenAdvies();
}

// Bovenaan: alles wat op jou wacht, een rij per punt met een knop. Belangrijkste eerst: mislukt, controleren, plan, ideeen.
function wpTekenWacht(pages) {
  const el = document.getElementById('wpWacht');
  if (!el) return;
  const items = [];
  const klaarLijst = (pages || []).filter((p) => wpStandVan(p.status) === 'Klaar voor live');
  if (klaarLijst.length) {
    const n = klaarLijst.length;
    items.push({ soort: 'Live zetten', klasse: 'plan', titel: n === 1 ? klaarLijst[0].titel || '1 pagina' : `${n} pagina's staan klaar voor live`, tekst: n === 1 ? 'Deze pagina is door de controle gekomen. Zet hem live op de website.' : klaarLijst.map((p) => p.titel).join(', ') + '. Ze zijn door de controle gekomen. Elke pagina wordt vlak voor het live gaat nog eens gecontroleerd.', knoppen: [{ label: n === 1 ? 'Zet live' : 'Zet alle live', hoofd: true, actie: (b) => wpZetSchoneLive(document.getElementById('wpKlant').value, b) }] });
  }
  if (lpState.wpLiveMelding) items.push({ soort: 'Resultaat', klasse: 'goed', titel: 'Live zetten', tekst: lpState.wpLiveMelding, knoppen: [{ label: 'Sluiten', actie: () => { lpState.wpLiveMelding = ''; wpTekenWacht(lpState.wpPages); } }] });
  (pages || []).forEach((p) => {
    if (p.status === 'Fout' || p.status === 'Afgewezen') items.push({ soort: 'Mislukt', klasse: 'fout', titel: p.titel || '(zonder titel)', tekst: p.status === 'Fout' ? 'Er ging iets mis bij het schrijven.' : 'Deze pagina is afgewezen.', knoppen: [{ label: 'Bekijk', hoofd: true, actie: () => wpOpenPagina(p.id) }] });
  });
  (pages || []).forEach((p) => {
    if (wpStandVan(p.status) !== 'Ter controle') return;
    const concept = p.status === 'Ter review';
    items.push({ soort: 'Controleren', titel: p.titel || '(zonder titel)', tekst: concept ? 'Staat als concept in WordPress, klaar om live te zetten.' : 'De tekst is klaar. Bekijk het voorbeeld en de controle.', knoppen: [{ label: 'Controleren', hoofd: true, actie: () => wpOpenPagina(p.id) }] });
  });
  const voorgesteld = (lpState.wpVoorgesteld && lpState.wpVoorgesteld.voorstellen) || [];
  if (voorgesteld.length) {
    items.push({ soort: 'Plan ' + (lpState.wpVoorgesteld.maand || ''), klasse: 'plan', titel: `${voorgesteld.length} voorstel${voorgesteld.length === 1 ? '' : 'len'} ${voorgesteld.length === 1 ? 'staat' : 'staan'} klaar`, tekst: 'De AI heeft een plan klaargezet. Na akkoord schrijft het systeem de pagina\'s en controleert ze. Live zetten doe jij, tenzij automatisch live aan staat.', knoppen: [{ label: `Keur ${voorgesteld.length === 1 ? 'het' : 'alle'} ${voorgesteld.length === 1 ? 'voorstel' : voorgesteld.length + ' voorstellen'} goed`, hoofd: true, actie: (b) => wpKeurAlleVoorstellen(b) }, { label: 'Bekijk het plan', actie: () => { const k = document.getElementById('wpMaandplanKaart'); if (k) k.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }] });
  }
  (lpState.wpIdeeen || []).forEach((i) => {
    items.push({ soort: 'Idee van de klant', klasse: 'idee', titel: i.titel, tekst: i.toelichting || 'De klant stelde deze pagina voor.', knoppen: [
      { label: 'Goedkeuren', hoofd: true, actie: (b) => wpBeoordeelIdee(i.id, 'goedkeuren', b) },
      { label: 'Afwijzen', actie: (b) => wpBeoordeelIdee(i.id, 'afwijzen', b) }
    ] });
  });
  const teller = document.getElementById('wpWachtTitel');
  if (teller) teller.innerHTML = 'Wacht op jou' + (items.length ? `<span class="wp-teller">${items.length}</span>` : '');
  if (!items.length && !lpState.wpWachtKlaar) { el.innerHTML = '<p class="wp-muted">Wacht op jou wordt geladen.</p>'; return; }
  if (!items.length) { el.innerHTML = '<p class="wp-muted">Niets wacht op jou. Nieuwe pagina\'s verschijnen hier zodra de tekst klaar is.</p>'; return; }
  el.innerHTML = items.map((it, i) => `<div class="wp-wrij"><span class="wp-wsoort ${it.klasse || ''}">${wpEsc(it.soort)}</span><div class="wp-wtekst"><b>${wpEsc(it.titel)}</b><span class="wp-muted">${wpEsc(it.tekst)}</span></div><div class="wp-idee-knoppen">${it.knoppen.map((k, j) => `<button type="button" class="btn ${k.hoofd ? 'btn-approve' : 'btn-plain'}" data-w="${i}" data-k="${j}">${wpEsc(k.label)}</button>`).join('')}</div></div>`).join('');
  el.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => items[Number(b.dataset.w)].knoppen[Number(b.dataset.k)].actie(b)));
}

// Alle voorstellen in een keer goedkeuren vanuit Wacht op jou. Voor kiezen per voorstel blijft de plankaart.
async function wpKeurAlleVoorstellen(knop) {
  const klant = document.getElementById('wpKlant').value;
  const ids = ((lpState.wpVoorgesteld || {}).voorstellen || []).map((v) => v.id);
  if (!ids.length) return;
  knop.disabled = true;
  try {
    await lpApi('/plan/voorgesteld/keur', { method: 'POST', body: JSON.stringify({ klant, goedkeuren: ids, afwijzen: [] }) });
    await wpLaad();
  } catch (err) {
    const f = document.getElementById('wpFout');
    f.textContent = err.message;
    f.classList.remove('hidden');
    knop.disabled = false;
  }
}

function wpOpenPagina(id) { lpState.laatsteLijst = 'werkplaats'; openPageDetail(id); }

async function wpBeoordeelIdee(id, besluit, knop) {
  if (besluit === 'afwijzen' && !confirm('Dit idee afwijzen? De pagina gaat naar de prullenbak van Notion.')) return;
  knop.disabled = true;
  try {
    await lpApi(`/plan/ideeen/${id}/beoordeel`, { method: 'POST', body: JSON.stringify({ besluit }) });
    await wpLaad();
  } catch (err) {
    const f = document.getElementById('wpFout');
    f.textContent = err.message;
    f.classList.remove('hidden');
    knop.disabled = false;
  }
}

// De maand: hoeveel pagina's zijn er deze maand gemaakt, en waar staan ze. Doel is Pagina's per maand van de klant.
function wpTekenMaand(pages, inst) {
  const nu = new Date();
  // Voorstellen die nog niet zijn goedgekeurd (stand Idee) tellen niet mee voor het aantal van deze maand.
  const dezeMaand = (pages || []).filter((p) => p.aangemaakt && p.status !== 'Idee' && new Date(p.aangemaakt).getFullYear() === nu.getFullYear() && new Date(p.aangemaakt).getMonth() === nu.getMonth());
  const tel = { live: 0, controle: 0, maak: 0, gepland: 0 };
  dezeMaand.forEach((p) => {
    const st = wpStandVan(p.status);
    if (st === 'Live') tel.live += 1; else if (st === 'Ter controle') tel.controle += 1; else if (st === 'In de maak') tel.maak += 1; else tel.gepland += 1;
  });
  const doel = (inst && Number(inst.paginasPerMaand)) || 0;
  const maand = nu.toLocaleDateString('nl-NL', { month: 'long' });
  const naam = maand.charAt(0).toUpperCase() + maand.slice(1);
  const totaal = dezeMaand.length;
  const noemer = Math.max(doel, totaal, 1);
  document.getElementById('wpMaandTitel').textContent = naam;
  const afgerond = doel > 0 && tel.live >= doel;
  document.getElementById('wpMaandSub').innerHTML = `<span class="wp-pil ${afgerond ? 'wp-live' : 'wp-maak'}"><span class="wp-stip"></span>${afgerond ? 'Afgerond' : 'Bezig'}</span> ${doel ? `${tel.live} van ${doel} live` : `${tel.live} live`}`;
  const deel = (n) => (n / noemer * 100).toFixed(1) + '%';
  document.getElementById('wpMaandBalk').innerHTML = `<span class="wp-maand-live" style="width:${deel(tel.live)}"></span><span class="wp-maand-controle" style="width:${deel(tel.controle)}"></span><span class="wp-maand-maak" style="width:${deel(tel.maak + tel.gepland)}"></span>`;
  document.getElementById('wpMaandBalk').setAttribute('aria-label', `${tel.live} live, ${tel.controle} ter controle, ${tel.maak + tel.gepland} in de maak of gepland`);
  const mislukt = (pages || []).filter((p) => p.status === 'Fout').length;
  document.getElementById('wpMaandTel').innerHTML = `<span><b>${tel.live}</b> live</span><span><b>${tel.controle}</b> wachten op jouw controle</span><span><b>${tel.maak + tel.gepland}</b> wordt geschreven of is gepland</span><span class="wp-muted">${mislukt} mislukt</span>`;
}

// Volgende maand naast Deze maand: wat staat er al klaar voor de maand erna?
function wpTekenVolgende() {
  const el = document.getElementById('wpVolgende');
  if (!el) return;
  const info = wpVolgendeInfo(((lpState.wpVoorgesteld || {}).voorstellen) || [], new Date());
  const inst = lpState.wpInst || {};
  const naam = info.naam.charAt(0).toUpperCase() + info.naam.slice(1);
  document.getElementById('wpVolgendeTitel').textContent = naam;
  document.getElementById('wpVolgendeSub').innerHTML = info.voorstellen.length ? '<span class="wp-pil wp-voorstel"><span class="wp-stip"></span>Plan wacht op akkoord</span>' : (inst.paginasPerMaand ? `Doel ${inst.paginasPerMaand} pagina's` : '');
  if (!info.voorstellen.length) {
    el.innerHTML = inst.plan ? `<p class="wp-muted">Nog geen voorstel. Het systeem zet het plan voor ${wpEsc(info.naam)} zelf klaar. Je ziet het hier en bij Wacht op jou.</p>` : '<p class="wp-muted">Deze klant heeft geen plan.</p>';
    return;
  }
  el.innerHTML = `<p><b>${info.voorstellen.length}</b> ${info.voorstellen.length === 1 ? 'voorstel' : 'voorstellen'}. Na jouw akkoord schrijft het systeem de tekst en controleert hem. Daarna zie je ze bij Klaar voor live.</p><ul class="wp-volgende-lijst">${info.voorstellen.map((v) => `<li>${wpEsc(v.titel)}</li>`).join('')}</ul><p class="wp-muted wp-kleinkop"><b>Wat gebeurt er na akkoord?</b></p><ol class="wp-stappenlijst wp-muted">${wpNaAkkoordStappen(inst, ((lpState.wpPages || []).filter((p) => p.status === 'Gepubliceerd')).length).map((t) => `<li>${wpEsc(t)}</li>`).join('')}</ol>`;
}

// Onderweg: de vijf kolommen. Een klik opent de pagina.
function wpTekenOnderweg(pages) {
  const el = document.getElementById('wpOnderweg');
  if (!el) return;
  const kolommen = wpOnderwegKolommen(pages, 5);
  el.innerHTML = kolommen.map((k, i) => `<div class="wp-kolom"><div class="wp-kolom-kop"><span class="wp-pil ${k.klasse}"><span class="wp-stip"></span>${wpEsc(k.naam)} <b>${k.paginas.length + (k.meer || 0)}</b></span></div>${k.paginas.map((p, j) => `<button type="button" class="wp-kolom-item${p.fout ? ' fout' : ''}" data-kol="${i}" data-pag="${j}">${wpEsc(p.titel)}${p.fout ? ' (mislukt)' : ''}${p.voorstel ? '<small>wacht op akkoord</small>' : ''}${i === 4 && (p.liveDatum || p.bijgewerkt) ? `<small>sinds ${new Date(p.liveDatum || p.bijgewerkt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</small>` : ''}</button>`).join('') || `<span class="wp-muted wp-kolom-leeg">${wpEsc(k.leeg)}</span>`}${k.meer ? `<span class="wp-muted wp-kolom-leeg">en nog ${k.meer}</span>` : ''}</div>`).join('');
  el.querySelectorAll('[data-kol]').forEach((b) => b.addEventListener('click', () => wpOpenPagina(kolommen[Number(b.dataset.kol)].paginas[Number(b.dataset.pag)].id)));
}

function wpTekenLog(pages) {
  const el = document.getElementById('wpLog');
  if (!el) return;
  const lijst = wpActiviteit(pages, 8);
  el.innerHTML = lijst.length ? lijst.map((a) => `<div class="wp-wrij"><div class="wp-wtekst"><b>${wpEsc(a.titel)}</b><span class="${a.fout ? '' : 'wp-muted'}">${wpEsc(a.tekst)}</span></div><span class="wp-muted">${new Date(a.op).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span></div>`).join('') : '<p class="wp-muted">Nog geen activiteit.</p>';
}

// Live pagina's met wat ze opleveren: sjabloon, live sinds, Google, AI en advies. Zonder meting staat er waarom nog niets.
function wpTekenResultaten(live, voorstellen) {
  const el = document.getElementById('wpResultaten');
  if (!el) return;
  const lijst = live || [];
  const klantNaam = (document.getElementById('wpKlant').selectedOptions[0] || {}).textContent || 'deze klant';
  const sub = document.getElementById('wpResultSub');
  if (sub) sub.textContent = `Alle pagina's van ${klantNaam}`;
  if (!lijst.length) { el.innerHTML = '<p class="wp-muted">Nog geen live pagina\'s.</p>'; return; }
  const paginaVan = new Map((lpState.wpPages || []).map((p) => [p.id, p]));
  const sjabloonNaam = new Map((lpState.wpTemplates || []).map((t) => [t.blueprintId, t.naam]));
  const adviesVan = (id) => (voorstellen || []).filter((v) => v.paginaId === id).map((v) => v.reden).join(' ');
  el.innerHTML = `<div class="wp-tabel-wrap"><table class="lp-table wp-tabel"><thead><tr><th>Pagina</th><th>Sjabloon</th><th>Live sinds</th><th>Google, 28 dagen</th><th>Genoemd door AI</th><th>Advies</th></tr></thead><tbody>${lijst.map((p) => {
    const r = wpResultaatTekst(p);
    const pg = paginaVan.get(p.id) || {};
    const url = String(pg.wpUrl || '').replace(/^https?:\/\//, '');
    const sinds = p.liveDatum ? new Date(p.liveDatum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '';
    return `<tr class="lp-row" data-pagina="${wpEsc(p.id)}"><td><strong>${wpEsc(p.titel)}</strong>${url ? `<small class="wp-muted wp-blok">${wpEsc(url)}</small>` : ''}</td><td class="wp-muted">${wpEsc(sjabloonNaam.get(pg.blueprint) || '')}</td><td class="wp-muted">${sinds}</td><td class="wp-muted">${wpEsc(r.google)}</td><td class="wp-muted">${wpEsc(r.ai || 'Nog geen AI meting')}</td><td class="wp-muted">${wpEsc(adviesVan(p.id) || 'Nog niets')}</td></tr>`;
  }).join('')}</tbody></table></div>`;
  el.querySelectorAll('[data-pagina]').forEach((tr) => tr.addEventListener('click', () => wpOpenPagina(tr.dataset.pagina)));
}

// Onlangs verwijderde pagina's, met een knop om ze terug te zetten.
async function wpLaadVerwijderd(klant) {
  const kaart = document.getElementById('wpVerwijderdKaart');
  if (!kaart) return;
  let lijst = [];
  try { lijst = (await lpApi('/pages-verwijderd?klant=' + encodeURIComponent(klant))).pages || []; } catch (e) { lijst = []; }
  kaart.classList.toggle('hidden', !lijst.length);
  document.getElementById('wpVerwijderd').innerHTML = lijst.map((p) => `<div class="wp-wrij"><div class="wp-wtekst"><b>${wpEsc(p.titel || '(zonder titel)')}</b><span class="wp-muted">Verwijderd op ${new Date(p.op).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div><button type="button" class="btn btn-plain" data-herstel="${wpEsc(p.id)}">Terugzetten</button></div>`).join('');
  document.querySelectorAll('#wpVerwijderd [data-herstel]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      const r = await lpApi('/pages-herstel', { method: 'POST', body: JSON.stringify({ ids: [b.dataset.herstel] }) });
      if (r.fouten.length) throw new Error(r.fouten[0].fout);
      await wpLaad();
    } catch (err) { b.textContent = err.message; b.disabled = false; }
  }));
}

// Het plan hoort bij Pagr. Zonder Pagr. staat hier alleen uitleg en kan niets worden gestart.
function wpTekenPlanKaart(inst) {
  const aan = Boolean(inst && inst.plan);
  const uit = document.getElementById('wpPlanUit');
  document.getElementById('wpPlanAan').classList.toggle('hidden', !aan);
  uit.classList.toggle('hidden', aan);
  if (!aan) {
    uit.innerHTML = (inst && inst.intern)
      ? '<strong>Het plan staat uit.</strong> Deze klant heeft Pagr. niet, alleen interne automatisering. De AI schrijft wel de tekst van pagina\'s die jij zelf maakt via Nieuwe pagina.'
      : '<strong>Het plan staat uit.</strong> Het plan met voorstellen hoort bij Pagr. Pagina\'s maak je zelf via Nieuwe pagina. Zet Pagr. aan bij Instellingen in de admin om voorstellen te krijgen.';
  }
}

// Het plan dat de server op de 1e klaarzette. Aanvinken, goedkeuren, de rest gaat weg.
async function wpLaadMaandplan(klant, pagr) {
  const kaart = document.getElementById('wpMaandplanKaart');
  const nu = document.getElementById('wpMaandplanNu');
  if (nu) {
    nu.classList.toggle('hidden', !pagr);
    nu.onclick = async () => {
      nu.disabled = true;
      document.getElementById('wpPlanStatus').textContent = 'Het maandplan wordt klaargezet. Dit duurt even.';
      try {
        const r = await lpApi('/plan/maandplan/nu', { method: 'POST', body: JSON.stringify({ klant }) });
        document.getElementById('wpPlanStatus').textContent = r.overgeslagen ? (r.reden || 'Er is niets klaargezet.') : `${r.aantal} voorstellen klaargezet. Je ziet ze bij Wacht op jou.`;
        await wpLaadMaandplan(klant, pagr);
      } catch (err) { document.getElementById('wpPlanStatus').textContent = err.message; }
      nu.disabled = false;
    };
  }
  if (!kaart) return;
  let data = { voorstellen: [] };
  if (pagr) { try { data = await lpApi('/plan/voorgesteld?klant=' + encodeURIComponent(klant)); } catch (e) { /* kaart blijft dicht */ } }
  lpState.wpVoorgesteld = data;
  const v = data.voorstellen || [];
  kaart.classList.toggle('hidden', !v.length);
  wpTekenWacht(lpState.wpPages || []);
  if (!v.length) return;
  document.getElementById('wpMaandplanTitel').textContent = 'Plan voor ' + (data.maand || 'deze maand');
  document.getElementById('wpMaandplan').innerHTML = `<div class="wp-plan-items">${v.map((x) => `<label class="wp-plan-item"><input type="checkbox" checked data-id="${wpEsc(x.id)}"><span class="wp-plan-tekst"><strong>${wpEsc(x.titel)}</strong><small>${wpEsc(x.reden)}</small>${(data.sjablonen || []).length > 1 ? `<select class="wp-plan-sjabloon" data-sjab="${wpEsc(x.id)}" aria-label="Sjabloon voor ${wpEsc(x.titel)}">${data.sjablonen.map((t) => `<option value="${wpEsc(t.id)}"${t.id === x.blueprint ? ' selected' : ''}>Sjabloon: ${wpEsc(t.naam)}</option>`).join('')}</select>` : `<small class="wp-muted">Sjabloon: ${wpEsc(x.sjabloonNaam)}</small>`}${typeof x.volume === 'number' ? `<span class="wp-plan-meta"><span class="wp-pil wp-live">${x.volume.toLocaleString('nl-NL')} zoekopdrachten per maand</span></span>` : ''}</span></label>`).join('')}</div>`;
  const keur = document.getElementById('wpMaandplanKeur');
  keur.onclick = async () => {
    const vinkjes = [...document.querySelectorAll('#wpMaandplan input[type=checkbox]')];
    const goed = vinkjes.filter((c) => c.checked).map((c) => c.dataset.id);
    const weg = vinkjes.filter((c) => !c.checked).map((c) => c.dataset.id);
    if (weg.length && !confirm(`${weg.length} voorstel${weg.length === 1 ? '' : 'len'} zonder vinkje worden weggehaald. Doorgaan?`)) return;
    keur.disabled = true;
    try {
      const r = await lpApi('/plan/voorgesteld/keur', { method: 'POST', body: JSON.stringify({ klant, goedkeuren: goed, afwijzen: weg, sjablonen: Object.fromEntries([...document.querySelectorAll('#wpMaandplan select[data-sjab]')].map((sel) => [sel.dataset.sjab, sel.value])) }) });
      document.getElementById('wpMaandplanStatus').textContent = `${r.goedgekeurd} goedgekeurd, ${r.weggehaald} weggehaald.`;
      await wpLaad();
    } catch (err) { document.getElementById('wpMaandplanStatus').textContent = err.message; }
    keur.disabled = false;
  };
}

// Laat zien of de klant de Pagr. module heeft. Zonder module draait er geen automatisering.
function wpTekenModule(inst) {
  const el = document.getElementById('wpModule');
  if (!el) return;
  const pillen = document.getElementById('wpPillen');
  if (pillen) pillen.innerHTML = wpKopPillen(inst, lpState.wpPages).map((x) => `<span class="wp-pil ${x.klasse}"><span class="wp-stip"></span>${wpEsc(x.tekst)}</span>`).join('');
  const aan = Boolean(inst && inst.automatisering);
  const intern = Boolean(inst && inst.intern && !inst.pagr);
  el.className = 'wp-module ' + (aan ? 'aan hidden' : 'uit');
  el.innerHTML = aan
    ? (intern
      ? '<strong>Automatisering aan voor eigen werk</strong><span>De AI schrijft de tekst vanzelf en de rest van de automatisering draait. De klant heeft Pagr. niet en ziet het niet in zijn portaal.</span>'
      : '<strong>Pagr. aan</strong><span>De AI schrijft de tekst vanzelf en de rest van de automatisering draait.</span>')
    : '<strong>Pagr. uit</strong><span>Je maakt pagina\'s zelf met knoppen. Zet Pagr. of Automatisering intern aan bij Instellingen in de admin voor automatisch schrijven en controleren.</span><span><button type="button" class="btn btn-plain" id="wpLiveKnop">Haal live status op</button> <span id="wpLiveMelding"></span></span>';
  const knop = document.getElementById('wpLiveKnop');
  if (knop) knop.addEventListener('click', () => wpSyncLive(document.getElementById('wpKlant').value, true));
}

// Haalt de echte WordPress status op en zet pagina's op Live als ze daar gepubliceerd zijn.
async function wpSyncLive(klant, handmatig) {
  try {
    const r = await lpApi('/plan/live-sync', { method: 'POST', body: JSON.stringify({ klant }) });
    if (r.nieuwLive && r.nieuwLive.length && document.getElementById('wpKlant').value === klant) {
      const { pages } = await lpApi('/pages?klant=' + encodeURIComponent(klant));
      lpState.wpPages = pages;
      wpTeken();
    }
    if (handmatig) {
      const el = document.getElementById('wpLiveMelding');
      if (el) el.textContent = r.nieuwLive.length ? `${r.nieuwLive.length} pagina('s) staan nu op Live.` : 'Er is niets nieuws live gegaan.';
    }
  } catch (err) {
    const el = document.getElementById('wpLiveMelding');
    if (el) el.textContent = err.message;
  }
}

function wpTekenIdeeen(ideeen) {
  // De ideeen van de klant staan als rijen bij Wacht op jou. Een aparte kaart is er niet meer.
  lpState.wpIdeeen = ideeen || [];
  document.getElementById('wpIdeeenKaart').classList.add('hidden');
  wpTekenWacht(lpState.wpPages || []);
}

function wpTekenBijhouden(data) {
  lpState.wpBijhouden = data;
  wpTekenResultaten(data.live || [], data.voorstellen || []);
  const el = document.getElementById('wpBijhouden');
  const meld = [];
  if (data.metingUit) {
    meld.push('De Paginameting staat uit voor deze klant. Zet hem aan bij Instellingen in de admin om Google en AI cijfers te zien.');
  } else {
    if (!data.googleBeschikbaar) meld.push('Nog geen Google cijfers per pagina. De wekelijkse meting heeft nog niet gedraaid of de Search Console site ontbreekt.');
    if (!data.aiBeschikbaar) meld.push('Geen AI meting voor deze klant.');
  }
  el.innerHTML = (data.voorstellen || []).length
    ? data.voorstellen.map((v) => `<div class="wp-advies-item ${v.prioriteit === 1 ? 'fout' : 'plan'}"><p><strong>${wpEsc(v.titel)}</strong><br>${wpEsc(v.reden)} ${wpEsc(v.actie)}</p><button type="button" class="btn btn-plain" data-pagina="${wpEsc(v.paginaId)}">Pagina openen</button></div>`).join('')
    : `<p class="wp-muted">${meld.length ? wpEsc(meld.join(' ')) : 'Geen pagina heeft nu een update nodig.'}</p>`;
  el.querySelectorAll('[data-pagina]').forEach((b) => b.addEventListener('click', () => { lpState.laatsteLijst = 'werkplaats'; openPageDetail(b.dataset.pagina); }));
}

function wpTekenAdvies() {
  // Het advies (regels) houdt rekening met het aantal pagina's per maand van de klant.
  const aantal = lpState.wpInst && lpState.wpInst.paginasPerMaand;
  if (!aantal) return;
  const pages = lpState.wpPages || [];
  const open = pages.filter((p) => wpStandVan(p.status) !== 'Live').length;
  if (open < aantal) {
    const el = document.getElementById('wpAdvies');
    el.insertAdjacentHTML('afterbegin', `<div class="wp-advies-item plan"><p>Voor deze klant horen ${aantal} pagina's per maand. Er staan er ${open} klaar of in de maak. Maak een plan voor de rest.</p></div>`);
  }
}

function wpBindVraag() {
  const knop = document.getElementById('wpVraagKnop');
  knop.addEventListener('click', async () => {
    const veld = document.getElementById('wpVraag');
    const uit = document.getElementById('wpVraagAntwoord');
    const vraag = veld.value.trim();
    if (!vraag) return;
    knop.disabled = true;
    uit.textContent = 'Even denken...';
    try {
      const r = await lpApi('/plan/vraag', { method: 'POST', body: JSON.stringify({ klant: document.getElementById('wpKlant').value, vraag }) });
      uit.textContent = r.antwoord || 'Geen antwoord.';
    } catch (err) {
      uit.textContent = err.message;
    } finally {
      knop.disabled = false;
    }
  });
}

if (typeof module !== 'undefined') module.exports = { wpStandVan, wpStandPagina, wpBouwAdvies, WP_STAND, WP_STANDEN, wpVolgendeInfo, wpOnderwegKolommen, wpActiviteit, wpResultaatTekst, wpKopPillen, wpNaAkkoordStappen, wpMaandSleutel, wpVolgendeMaand };
