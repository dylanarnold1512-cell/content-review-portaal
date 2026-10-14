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
  await wpLaad();
}

if (typeof module !== 'undefined') module.exports = { wpStandVan, wpBouwAdvies, WP_STAND };
