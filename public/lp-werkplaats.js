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
  'Afgewezen': 'In de maak',
  'Fout': 'In de maak',
  'Gepubliceerd': 'Live'
};
const WP_STAND_KLASSE = { 'Gepland': 'wp-gepland', 'In de maak': 'wp-maak', 'Ter controle': 'wp-controle', 'Live': 'wp-live' };
const WP_STANDEN = ['Gepland', 'In de maak', 'Ter controle', 'Live'];

function wpStandVan(status) { return WP_STAND[status] || 'In de maak'; }
function wpEsc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Advies uit de echte gegevens van de klant. Geeft een lijst { tekst, knop, actie } terug.
function wpBouwAdvies({ pages, templates }) {
  const actief = templates.filter((t) => t.status === 'Actief');
  const tellers = { 'Gepland': 0, 'In de maak': 0, 'Ter controle': 0, 'Live': 0 };
  pages.forEach((p) => { tellers[wpStandVan(p.status)] += 1; });
  const fout = pages.filter((p) => p.status === 'Fout' || p.status === 'Afgewezen');
  const advies = [];
  if (!actief.length) {
    advies.push({ soort: 'let-op', tekst: 'Er is nog geen actief sjabloon. Maak eerst een sjabloon, dan kun je daarna pagina\'s maken.', knop: 'Sjabloon maken', actie: 'sjabloon' });
  }
  if (fout.length) {
    advies.push({ soort: 'fout', tekst: fout.length === 1 ? 'Een pagina is mislukt of afgewezen en wacht op jou.' : `${fout.length} pagina's zijn mislukt of afgewezen en wachten op jou.`, knop: 'Bekijk', pagina: fout[0].id });
  }
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
  const pages = lpState.wpPages || [];
  const templates = lpState.wpTemplates || [];
  const uit = wpBouwAdvies({ pages, templates });

  document.getElementById('wpStappen').innerHTML = wpStappen({ tellers: uit.tellers, actief: uit.actief, pages });
  document.querySelectorAll('#wpStappen .wp-stap').forEach((b) => b.addEventListener('click', () => switchLpTab(b.dataset.wpTab)));

  wpTekenBulk();
  document.getElementById('wpTellers').innerHTML = WP_STANDEN.map((s) => `<span class="wp-pil ${WP_STAND_KLASSE[s]}"><span class="wp-stip"></span>${s} <b>${uit.tellers[s]}</b></span>`).join('');

  document.getElementById('wpPaginas').innerHTML = pages.map((p) => {
    const stand = wpStandVan(p.status);
    return `<tr class="lp-row" data-page-id="${wpEsc(p.id)}"><td><strong>${wpEsc(p.titel || '(zonder titel)')}</strong></td><td><span class="wp-pil ${WP_STAND_KLASSE[stand]}"><span class="wp-stip"></span>${stand}</span></td><td class="wp-muted">${p.laatstGewijzigd ? new Date(p.laatstGewijzigd).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="3" class="wp-muted">Nog geen pagina\'s voor deze klant.</td></tr>';
  document.querySelectorAll('#wpPaginas tr.lp-row').forEach((row) => {
    row.addEventListener('click', () => { lpState.laatsteLijst = 'werkplaats'; openPageDetail(row.dataset.pageId); });
  });

  document.getElementById('wpSjablonen').innerHTML = templates.length
    ? templates.map((t) => `<div class="wp-sjabloon" data-tpl-id="${wpEsc(t.id)}"><strong>${wpEsc(t.naam)}</strong><span class="wp-pil ${t.status === 'Actief' ? 'wp-live' : 'wp-gepland'}"><span class="wp-stip"></span>${wpEsc(t.status)}</span></div>`).join('')
    : '<p class="wp-muted">Nog geen sjablonen voor deze klant.</p>';
  document.querySelectorAll('#wpSjablonen .wp-sjabloon').forEach((el) => {
    el.addEventListener('click', () => { switchLpTab('sjablonen'); if (typeof openTemplateDetail === 'function') openTemplateDetail(el.dataset.tplId); });
  });

  document.getElementById('wpAdvies').innerHTML = uit.advies.map((a, i) => `<div class="wp-advies-item ${a.soort}"><p>${wpEsc(a.tekst)}</p>${a.knop ? `<button type="button" class="btn btn-plain" data-adv="${i}">${wpEsc(a.knop)}</button>` : ''}</div>`).join('');
  document.querySelectorAll('#wpAdvies [data-adv]').forEach((b) => {
    const a = uit.advies[Number(b.dataset.adv)];
    b.addEventListener('click', () => {
      if (a.pagina) { lpState.laatsteLijst = 'werkplaats'; openPageDetail(a.pagina); return; }
      if (a.actie === 'sjabloon') { switchLpTab('sjablonen'); document.getElementById('lpNewTemplateBtn')?.click(); return; }
      if (a.actie === 'pagina') {
        switchLpTab('nieuw');
        const sel = document.getElementById('lpNewKlant');
        if (sel && klantId) { sel.value = klantId; sel.dispatchEvent(new Event('change')); }
      }
    });
  });
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
    lpState.wpPages = pages;
    lpState.wpTemplates = templates;
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
    status.textContent = `${uit.voorstellen.length} voorstel${uit.voorstellen.length === 1 ? '' : 'len'}. Pas een titel aan, haal weg wat je niet wilt en keur de rest goed.${uit.volumeBeschikbaar ? '' : ' Zonder zoekvolume: zet DATAFORSEO_LOGIN en DATAFORSEO_PASSWORD op Render voor echte aantallen.'}`;
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
  const gepland = (lpState.wpPages || []).filter((p) => wpStandVan(p.status) === 'Gepland');
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
  if (inst.paginasPerMaand && !wpPlanOpslag(klant)) document.getElementById('wpAantal').value = inst.paginasPerMaand;
  wpTekenIdeeen(ideeen.ideeen || []);
  wpTekenBijhouden(bijhouden);
  wpTekenAdvies();
}

function wpTekenIdeeen(ideeen) {
  const kaart = document.getElementById('wpIdeeenKaart');
  if (!ideeen.length) { kaart.classList.add('hidden'); return; }
  kaart.classList.remove('hidden');
  document.getElementById('wpIdeeen').innerHTML = ideeen.map((i) => `<div class="wp-idee" data-id="${wpEsc(i.id)}"><div><strong>${wpEsc(i.titel)}</strong>${i.toelichting ? `<small>${wpEsc(i.toelichting)}</small>` : ''}</div><div class="wp-idee-knoppen"><button type="button" class="btn btn-approve" data-besluit="goedkeuren">Goedkeuren</button><button type="button" class="btn btn-plain" data-besluit="afwijzen">Afwijzen</button></div></div>`).join('');
  document.querySelectorAll('#wpIdeeen [data-besluit]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.closest('.wp-idee').dataset.id;
    if (b.dataset.besluit === 'afwijzen' && !confirm('Dit idee afwijzen? De pagina gaat naar de prullenbak van Notion.')) return;
    b.disabled = true;
    try {
      await lpApi(`/plan/ideeen/${id}/beoordeel`, { method: 'POST', body: JSON.stringify({ besluit: b.dataset.besluit }) });
      await wpLaad();
    } catch (err) {
      document.getElementById('wpFout').textContent = err.message;
      document.getElementById('wpFout').classList.remove('hidden');
      b.disabled = false;
    }
  }));
}

function wpTekenBijhouden(data) {
  lpState.wpBijhouden = data;
  const el = document.getElementById('wpBijhouden');
  const meld = [];
  if (!data.googleBeschikbaar) meld.push('Google meting per pagina staat nog niet aan (zie het bouwstanddocument).');
  if (!data.aiBeschikbaar) meld.push('Geen AI meting voor deze klant.');
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

if (typeof module !== 'undefined') module.exports = { wpStandVan, wpBouwAdvies, WP_STAND };
