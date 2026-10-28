let adminState = { clients: [], ideeen: {}, onboarding: {}, onboardingFout: '', faq: { voorstellen: [], toegepast: [] } };

async function adminApi(path, options) {
  const res = await fetch('/api/admin' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Er ging iets mis.');
    err.code = data.code || '';
    throw err;
  }
  return data;
}

function showAdminApp() {
  document.getElementById('adminLoginScreen').classList.add('hidden');
  document.getElementById('adminApp').classList.remove('hidden');
}

function showAdminLogin() {
  document.getElementById('adminApp').classList.add('hidden');
  document.getElementById('adminLoginScreen').classList.remove('hidden');
}

document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('adminPasswordInput').value;
  const errorEl = document.getElementById('adminLoginError');
  errorEl.textContent = '';
  try {
    await adminApi('/login', { method: 'POST', body: JSON.stringify({ password }) });
    showAdminApp();
    await startAdmin();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
  await adminApi('/logout', { method: 'POST' });
  showAdminLogin();
});

// ---- Navigatie: een eigen adres per scherm (#klanten, #nieuw, #ideeen, #klant/<id>/<tabblad>) ----
const KLANT_TABS = [
  { id: 'overzicht', titel: 'Overzicht' },
  { id: 'onboarding', titel: 'Onboarding' },
  { id: 'instellingen', titel: 'Instellingen' },
  { id: 'ideeen', titel: 'Ideeën' },
  { id: 'merkprofiel', titel: 'Merkprofiel opbouwen' }
];
const VIEW_TITELS = { cockpit: 'Cockpit', klanten: 'Alle klanten', nieuw: 'Nieuwe klant', ideeen: 'Ideeën', faq: 'FAQ\'s', pagr: 'Pagr.', klant: 'Klant' };
const PAGR_TABS = ['overzicht', 'werkplaats', 'nieuw', 'sjablonen', 'paginas', 'kloon', 'vervang', 'klantgegevens'];
let huidig = { view: 'cockpit', klantId: '', tab: 'instellingen' };

function leesHash() {
  const delen = String(window.location.hash || '').replace(/^#/, '').split('/').map(decodeURIComponent);
  if (delen[0] === 'klant' && delen[1]) {
    const tab = KLANT_TABS.some((t) => t.id === delen[2]) ? delen[2] : beginTab(delen[1]);
    return { view: 'klant', klantId: delen[1], tab };
  }
  if (delen[0] === 'pagr') return { view: 'pagr', klantId: '', tab: PAGR_TABS.includes(delen[1]) ? delen[1] : 'overzicht' };
  if (['cockpit', 'klanten', 'nieuw', 'ideeen', 'faq'].includes(delen[0])) return { view: delen[0], klantId: '', tab: 'instellingen' };
  return { view: 'cockpit', klantId: '', tab: 'instellingen' };
}

// Een klant in onboarding opent op het tabblad Onboarding, een klant die klaar is op Instellingen.
function beginTab(klantId) {
  const o = adminState.onboarding[klantId];
  return o && !o.samenvatting.gereed ? 'onboarding' : 'overzicht';
}

function gaNaar(view, klantId, tab) {
  const hash = view === 'pagr' ? `#pagr/${tab || 'werkplaats'}` : view === 'klant' ? `#klant/${encodeURIComponent(klantId)}/${tab || beginTab(klantId)}` : `#${view}`;
  if (window.location.hash === hash) toonScherm();
  else window.location.hash = hash;
}

function sluitMenu() {
  document.getElementById('pSide').classList.remove('open');
  document.getElementById('pScrim').classList.remove('open');
  document.getElementById('pMenuknop').setAttribute('aria-expanded', 'false');
}

document.getElementById('pMenuknop').addEventListener('click', () => {
  const open = !document.getElementById('pSide').classList.contains('open');
  document.getElementById('pSide').classList.toggle('open', open);
  document.getElementById('pScrim').classList.toggle('open', open);
  document.getElementById('pMenuknop').setAttribute('aria-expanded', String(open));
});
document.getElementById('pScrim').addEventListener('click', sluitMenu);

document.querySelectorAll('#adminNav [data-view]').forEach((btn) => {
  btn.addEventListener('click', () => gaNaar(btn.dataset.view, '', btn.dataset.pagrTab));
});

// Alle klanten: die uit het portaal, plus klanten die alleen in de onboarding staan (nog niet in clients.js).
function alleKlanten() {
  const lijst = adminState.clients.map((c) => ({ ...c }));
  Object.values(adminState.onboarding).forEach((o) => {
    if (!lijst.some((c) => c.id === o.clientId)) lijst.push({ id: o.clientId, naam: o.klant, alleenOnboarding: true });
  });
  return lijst;
}

function zoekKlant(id) {
  return adminState.clients.find((c) => c.id === id) || alleKlanten().find((c) => c.id === id);
}

function toonScherm() {
  huidig = leesHash();
  sluitMenu();
  const { view, klantId, tab } = huidig;
  const klant = zoekKlant(klantId);
  ['Cockpit', 'Klanten', 'Klant', 'Ideeen', 'Faq', 'Nieuw', 'Pagr'].forEach((naam) => {
    document.getElementById('view' + naam).classList.toggle('hidden', naam.toLowerCase() !== (view === 'klant' ? 'klant' : view));
  });
  document.querySelectorAll('#adminNav [data-view]').forEach((btn) => {
    const actief = view === 'pagr'
      ? btn.dataset.view === 'pagr' && btn.dataset.pagrTab === tab
      : btn.dataset.view === view || (view === 'klant' && btn.dataset.view === 'klanten');
    btn.classList.toggle('active', actief);
    if (actief) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
  });
  document.getElementById('pMobielTab').textContent = view === 'klant' && klant ? klant.naam : (view === 'pagr' ? 'Pagr.' : VIEW_TITELS[view]);
  if (view === 'cockpit') renderCockpit();
  if (view === 'klanten') renderKlanten();
  if (view === 'klant') renderKlant(klant, tab);
  if (view === 'ideeen') renderIdeeenScherm();
  if (view === 'faq') renderFaqScherm();
  if (view === 'nieuw') loadIntakes();
  if (view === 'pagr') {
    // De LP omgeving laadt pas bij het eerste bezoek, daarna blijft hij staan met zijn eigen stand.
    const frame = document.getElementById('pagrFrame');
    if (!frame.getAttribute('src')) frame.setAttribute('src', frame.dataset.src + '#' + tab);
    else if (frame.contentWindow && pagrVanFrame !== tab) frame.contentWindow.postMessage({ type: 'pagr-tab', tab }, window.location.origin);
    pagrVanFrame = null;
  }
  window.scrollTo(0, 0);
}
let pagrVanFrame = null;

// Klantkiezer: dezelfde keuze telt op alle pagina's waar hij staat (Cockpit en Ideeën).
function kiezerHtml(opties) {
  const e = escapeHtmlAdmin;
  const gekozen = opties.find((o) => o.id === adminState.klantKeuze);
  const av = (o) => `<span class="ck-av ck-av-klein" style="background:${avatarKleur(o.naam)}" aria-hidden="true">${e(adminInitialen(o.naam))}</span>`;
  return `
  <div class="ad-kiezer" data-kiezer>
    <button type="button" class="ad-kiezer-knop" aria-haspopup="listbox" aria-expanded="false">
      ${gekozen ? av(gekozen) : '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>'}
      <span>${gekozen ? e(gekozen.naam) : 'Alle klanten'}</span>
      <svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="ad-kiezer-paneel hidden">
      ${opties.length > 6 ? '<input type="search" class="ad-kiezer-zoek" placeholder="Zoek een klant" aria-label="Zoek een klant">' : ''}
      <ul class="ad-kiezer-lijst" role="listbox">
        <li><button type="button" role="option" data-kies="" aria-selected="${!gekozen}"><span class="ck-av ck-av-klein ad-kiezer-alle" aria-hidden="true">A</span>Alle klanten</button></li>
        ${opties.map((o) => `<li data-naam="${e(o.naam.toLowerCase())}"><button type="button" role="option" data-kies="${e(o.id)}" aria-selected="${o.id === adminState.klantKeuze}">${av(o)}${e(o.naam)}</button></li>`).join('')}
      </ul>
    </div>
  </div>`;
}

function bindKiezer(root, naKeuze) {
  const k = root.querySelector('[data-kiezer]');
  if (!k) return;
  const knop = k.querySelector('.ad-kiezer-knop');
  const paneel = k.querySelector('.ad-kiezer-paneel');
  const sluit = () => { paneel.classList.add('hidden'); knop.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', buiten, true); };
  const buiten = (ev) => { if (!k.contains(ev.target)) sluit(); };
  knop.addEventListener('click', () => {
    const open = paneel.classList.contains('hidden');
    if (!open) { sluit(); return; }
    paneel.classList.remove('hidden');
    knop.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', buiten, true);
    const zoek = paneel.querySelector('.ad-kiezer-zoek');
    if (zoek) zoek.focus();
  });
  k.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { sluit(); knop.focus(); } });
  const zoek = paneel.querySelector('.ad-kiezer-zoek');
  if (zoek) zoek.addEventListener('input', () => {
    const q = zoek.value.trim().toLowerCase();
    paneel.querySelectorAll('li[data-naam]').forEach((li) => li.classList.toggle('hidden', !!q && !li.dataset.naam.includes(q)));
  });
  paneel.querySelectorAll('[data-kies]').forEach((b) => b.addEventListener('click', () => {
    adminState.klantKeuze = b.dataset.kies;
    try { sessionStorage.setItem('adKlantKeuze', adminState.klantKeuze); } catch (err) { /* geen opslag, geen probleem */ }
    sluit();
    naKeuze();
  }));
}
try { adminState.klantKeuze = sessionStorage.getItem('adKlantKeuze') || ''; } catch (err) { adminState.klantKeuze = ''; }
window.addEventListener('hashchange', toonScherm);

// De ingebedde Pagr. omgeving meldt zijn hoogte, zodat de pagina als geheel scrolt.
window.addEventListener('message', (e) => {
  if (e.origin !== window.location.origin) return;
  const d = e.data;
  // De Pagr. omgeving wisselde zelf van tab (bijvoorbeeld via een knop in de Werkplaats): het menu links volgt.
  if (d && d.type === 'pagr-tab-actief' && PAGR_TABS.includes(d.tab) && huidig && huidig.view === 'pagr' && huidig.tab !== d.tab) {
    pagrVanFrame = d.tab;
    window.location.hash = `#pagr/${d.tab}`;
  }
  if (d && d.type === 'pagr-gewijzigd') ververWachtTeller();
  if (d && d.type === 'pagr-hoogte' && Number.isFinite(d.hoogte)) {
    const frame = document.getElementById('pagrFrame');
    if (frame) frame.style.height = Math.max(400, d.hoogte + 8) + 'px';
  }
});

function renderError(message) {
  const el = document.getElementById('adminError');
  if (!message) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.textContent = message;
  el.classList.remove('hidden');
}

function toggleSwitch(id, clientId, field, checked, disabled, disabledReason) {
  if (disabled) {
    return `
    <div class="admin-toggle admin-toggle-disabled" title="${disabledReason || ''}">
      <span class="admin-toggle-track"></span>
      <span class="admin-toggle-hint">${disabledReason || 'Niet beschikbaar'}</span>
    </div>`;
  }
  return `
  <label class="admin-toggle">
    <input type="checkbox" data-client="${clientId}" data-field="${field}" ${checked ? 'checked' : ''}>
    <span class="admin-toggle-track"></span>
  </label>`;
}

function escapeHtmlAdmin(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// De modules die een klant in het portaal kan zien, met de uitleg die eerder in de kolomkoppen stond.
const MODULES = [
  { veld: 'reviewEnabled', naam: 'Blogs goedkeuren', kort: 'Review', tip: 'De klant ziet bij elke blog de knoppen Goedkeuren en Afwijzen. Uit: de klant kan de blogs alleen bekijken.' },
  { veld: 'performanceEnabled', naam: 'Prestaties (Google)', kort: 'Google', tip: 'Toont het tabblad Google (Search Console en GA4). Zet aan zodra er minstens één gepubliceerde blog is en de eerste nacht is gedraaid, anders ziet de klant vooral nullen. Kan alleen als de prestatiekoppeling is ingesteld.', alleenAlsKoppeling: true },
  { veld: 'ideaEnrichmentEnabled', naam: 'Ideeën aandragen', kort: 'Ideeën', tip: 'De klant krijgt de knop Idee aandragen. Ideeën worden automatisch aangevuld en komen eerst bij jou ter goedkeuring.' },
  { veld: 'merkprofiel', naam: 'Merkprofiel', kort: 'Merkprofiel', tip: 'Toont het tabblad Merkprofiel. De klant ziet hoe wij het bedrijf hebben vastgesteld en kan feiten bevestigen, aanpassen of uitsluiten. Het tabblad verschijnt alleen als er een vastgesteld profiel is.' },
  { veld: 'merkprofielNaarKennisdocument', naam: 'Merkprofiel naar blogs', kort: '', tip: 'Reacties van de klant op het merkprofiel schrijven het Kennisdocument opnieuw, waar de blogs op schrijven. Let op: dit overschrijft het huidige Kennisdocument. Zet dit pas aan bij de overstap naar het profiel.' },
  { veld: 'aiZichtbaarheid', naam: 'AI zichtbaarheid', kort: 'AI', tip: 'Toont het tabblad AI zichtbaarheid. De klant ziet hoe vaak ChatGPT en Gemini het eigen merk noemen. Concurrenten en bronnen van anderen blijven alleen hier zichtbaar. Zet aan zodra er minstens twee volledige weken meting zijn.' }
];

// Heeft de klant het blogproduct? Bij Pagr. en Geen van beide horen de blogopties niet in beeld.
function heeftBlogr(c) {
  const p = c.producten || 'Blogr.';
  return p === 'Blogr.' || p === 'Beide';
}
const BLOG_MODULES = ['reviewEnabled', 'performanceEnabled', 'ideaEnrichmentEnabled', 'merkprofielNaarKennisdocument'];

function statusVanKlant(c) {
  if (c.klantstatusIngesteld === false) return { tekst: 'Status kiezen', klasse: 'p-pil-let-op' };
  const s = c.klantstatus || 'actief';
  if (s === 'actief') return { tekst: 'Actief', klasse: 'p-pil-goed' };
  if (s === 'gepauzeerd') return { tekst: 'Gepauzeerd', klasse: 'p-pil-let-op' };
  return { tekst: 'Beëindigd', klasse: 'p-pil-neutraal' };
}

function wachtendeIdeeen(klantId) {
  return (adminState.ideeen[klantId] || []).length;
}

function updateIdeeenTeller() {
  const totaal = Object.values(adminState.ideeen).reduce((n, lijst) => n + lijst.length, 0);
  const el = document.getElementById('ideeenTeller');
  el.textContent = totaal > 0 ? String(totaal) : '';
  el.classList.toggle('hidden', totaal === 0);
}

function adminInitialen(naam) {
  const woorden = String(naam || '').trim().split(/\s+/).filter(Boolean);
  if (!woorden.length) return '–';
  if (woorden.length === 1) return woorden[0].slice(0, 2).toUpperCase();
  return (woorden[0][0] + woorden[1][0]).toUpperCase();
}

// ---- Alle klanten ----
function renderKlanten() {
  const lijst = alleKlanten();
  const inOnboarding = lijst.filter((c) => { const o = adminState.onboarding[c.id]; return o && !o.samenvatting.gereed; }).length;
  const wachtOpJou = Object.values(adminState.onboarding).reduce((n, o) => n + o.samenvatting.wachtOpDylan.length, 0);
  const ideeen = Object.values(adminState.ideeen).reduce((n, l) => n + l.length, 0);
  const f = adminState.klantFilter || (adminState.klantFilter = { product: 'alle', zoek: '' });
  const heeftMelding = (c) => {
    const os = adminState.onboarding[c.id] && adminState.onboarding[c.id].samenvatting;
    return !!((os && os.wachtOpDylan.length) || wachtendeIdeeen(c.id) > 0 || c.klantstatusIngesteld === false);
  };
  const productVan = (c) => c.producten || 'Blogr.';
  const zicht = lijst.filter((c) => {
    if (f.zoek && !c.naam.toLowerCase().includes(f.zoek.toLowerCase())) return false;
    if (f.product === 'blogr') return ['Blogr.', 'Beide'].includes(productVan(c));
    if (f.product === 'pagr') return ['Pagr.', 'Beide'].includes(productVan(c));
    if (f.product === 'melding') return heeftMelding(c);
    return true;
  });
  const rijen = zicht.map((c) => {
    const o = adminState.onboarding[c.id];
    const os = o && o.samenvatting;
    const lopend = os && !os.gereed;
    const st = c.alleenOnboarding ? { tekst: 'Onboarding', klasse: 'p-pil-plan' } : statusVanKlant(c);
    const aan = MODULES.filter((m) => m.kort && c[m.veld]);
    const wacht = wachtendeIdeeen(c.id);
    const meldingen = [];
    if (os && os.wachtOpDylan.length) meldingen.push(`Onboarding: ${os.wachtOpDylan.length === 1 ? os.wachtOpDylan[0].titel : os.wachtOpDylan.length + ' punten'} wacht op jou`);
    if (wacht > 0) meldingen.push(`${wacht} ${wacht === 1 ? 'idee wacht' : 'ideeën wachten'} op jou`);
    if (c.klantstatusIngesteld === false) meldingen.push('Kies een status, anders weten de workflows het niet');
    const open = meldingen.length
      ? `<div class="ad-tabel-open wacht">${meldingen.map(escapeHtmlAdmin).join('<br>')}</div>`
      : (lopend && os.volgende ? `<div class="ad-tabel-open">Volgende stap: ${escapeHtmlAdmin(os.volgende.titel)}</div>` : '<div class="ad-tabel-open">Niets dat op jou wacht</div>');
    const modules = aan.length ? aan.map((m) => `<span class="p-pil p-pil-neutraal">${m.kort}</span>`).join('') : `<span class="ad-vaag">${c.alleenOnboarding ? 'Nog niet in het portaal' : 'Geen modules aan'}</span>`;
    const voortgang = os && os.totaal ? `<span>Onboarding ${os.afgerond} van ${os.totaal} stappen</span>` : `<span>${escapeHtmlAdmin(c.id)}</span>`;
    const bekijk = c.alleenOnboarding ? '' : `<button type="button" class="p-knop" data-bekijk="${escapeHtmlAdmin(c.id)}">Bekijk als klant</button>`;
    return `
    <tr>
      <td><div class="ad-tabel-naam"><span class="ck-av" style="background:${avatarKleur(c.naam)}" aria-hidden="true">${escapeHtmlAdmin(adminInitialen(c.naam))}</span><div><b>${escapeHtmlAdmin(c.naam)}</b>${voortgang}</div></div></td>
      <td><div class="ad-tabel-mod">${modules}</div></td>
      <td>${open}</td>
      <td><span class="p-pil ${st.klasse}">${st.tekst}</span></td>
      <td><div class="ad-tabel-acties">${bekijk}<button type="button" class="p-knop" data-klant="${escapeHtmlAdmin(c.id)}">Open</button></div></td>
    </tr>`;
  }).join('');
  document.getElementById('viewKlanten').innerHTML = `
  <div class="p-pagina">
    <div class="p-ov-kop">
      <div><h1>Alle klanten</h1><p>Waar elke klant staat en wat er op jou wacht.</p></div>
      <div class="p-ov-kop-acties"><button type="button" class="p-knop p-knop-hoofd" data-nieuw>+ Nieuwe klant</button></div>
    </div>
    <div class="p-kerncijfers ad-kerncijfers">
      <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Klanten</div><div class="ad-getal">${lijst.length}</div></div>
      <div class="p-kerncijfer"><div class="p-kerncijfer-kop">In onboarding</div><div class="ad-getal">${inOnboarding}</div></div>
      <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Onboarding wacht op jou</div><div class="ad-getal">${wachtOpJou}</div></div>
      <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Ideeën ter beoordeling</div><div class="ad-getal">${ideeen}</div></div>
    </div>
    <section class="ck-kaart" style="margin-top:24px" aria-label="Klantenlijst">
      <div class="ck-kaart-kop">
        <div class="ck-seg" role="group" aria-label="Filter op product">
          ${[['alle', 'Alle'], ['blogr', 'Blogr.'], ['pagr', 'Pagr.'], ['melding', 'Met melding']].map(([id, t]) => `<button type="button" class="${f.product === id ? 'on' : ''}" data-kfilter="${id}" aria-pressed="${f.product === id}">${t}</button>`).join('')}
        </div>
        <label class="ad-top-zoek" style="margin-left:0;width:260px"><svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" id="kZoek" placeholder="Zoek in klanten" aria-label="Zoek in klanten" value="${escapeHtmlAdmin(f.zoek)}"></label>
      </div>
      ${rijen ? `<div class="ad-tabel-wrap"><table class="ad-tabel"><thead><tr><th>Klant</th><th>Producten</th><th>Wacht op jou</th><th>Status</th><th><span class="sr-only">Acties</span></th></tr></thead><tbody>${rijen}</tbody></table></div>` : `<div class="ck-leeg">${lijst.length ? 'Geen klanten met dit filter.' : 'Nog geen klanten.'}</div>`}
    </section>
    ${adminState.onboardingFout ? `<p class="admin-footnote">De onboarding kon niet worden geladen: ${escapeHtmlAdmin(adminState.onboardingFout)}</p>` : ''}
    <p class="admin-footnote">Nieuwe klant nog niet in de lijst met modules? Voeg 'm toe in <code>src/config/clients.js</code>, dan verschijnt hij daar vanzelf. Dit is stap 11 van de onboarding.</p>
  </div>`;
  const root = document.getElementById('viewKlanten');
  root.querySelectorAll('[data-klant]').forEach((k) => k.addEventListener('click', () => gaNaar('klant', k.dataset.klant)));
  root.querySelectorAll('[data-kfilter]').forEach((b) => b.addEventListener('click', () => { f.product = b.dataset.kfilter; renderKlanten(); }));
  const zoekVeld = root.querySelector('#kZoek');
  zoekVeld.addEventListener('input', () => { f.zoek = zoekVeld.value; const pos = zoekVeld.selectionStart; renderKlanten(); const nieuw = root.querySelector('#kZoek'); nieuw.focus(); nieuw.setSelectionRange(pos, pos); });
  root.querySelectorAll('[data-bekijk]').forEach((b) => b.addEventListener('click', () => bekijkAlsKlant(b.dataset.bekijk)));
  root.querySelector('[data-nieuw]').addEventListener('click', () => gaNaar('nieuw'));
}

// ---- Eén klant ----
function renderKlant(c, tab) {
  const root = document.getElementById('viewKlant');
  if (!c) {
    root.innerHTML = '<div class="p-pagina"><p class="admin-footnote">Deze klant is niet gevonden. <button type="button" class="p-link" data-terug>Terug naar alle klanten</button></p></div>';
    root.querySelector('[data-terug]').addEventListener('click', () => gaNaar('klanten'));
    return;
  }
  const st = c.alleenOnboarding ? { tekst: 'Onboarding', klasse: 'p-pil-plan' } : statusVanKlant(c);
  const zichtbareTabs = c.alleenOnboarding ? KLANT_TABS.filter((t) => t.id === 'onboarding') : KLANT_TABS.filter((t) => t.id !== 'ideeen' || heeftBlogr(c));
  if (c.alleenOnboarding && tab !== 'onboarding') tab = 'onboarding';
  if (tab === 'ideeen' && !heeftBlogr(c)) tab = 'overzicht';
  const tabs = zichtbareTabs.map((t) => {
    const teller = t.id === 'ideeen' && wachtendeIdeeen(c.id) ? `<span class="p-teller">${wachtendeIdeeen(c.id)}</span>` : '';
    return `<button type="button" class="ad-tab${t.id === tab ? ' active' : ''}" data-tab="${t.id}">${t.titel}${teller}</button>`;
  }).join('');
  root.innerHTML = `
  <div class="p-pagina">
    <div class="p-ov-kop">
      <div class="ad-kop-klant">
        <span class="ck-av ck-av-groot" style="background:${avatarKleur(c.naam)}" aria-hidden="true">${escapeHtmlAdmin(adminInitialen(c.naam))}</span>
        <div>
          <h1>${escapeHtmlAdmin(c.naam)}</h1>
          <p><span class="p-pil ${st.klasse}">${st.tekst}</span></p>
        </div>
      </div>
      ${c.alleenOnboarding ? '' : `<div class="p-ov-kop-acties"><button type="button" class="p-knop" data-bekijk="${escapeHtmlAdmin(c.id)}">Bekijk als klant</button></div>`}
    </div>
    <div class="ad-tabs" role="tablist">${tabs}</div>
    <div id="klantTabInhoud"></div>
  </div>`;
  root.querySelectorAll('[data-bekijk]').forEach((b) => b.addEventListener('click', () => bekijkAlsKlant(b.dataset.bekijk)));
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => gaNaar('klant', c.id, b.dataset.tab)));
  const inhoud = document.getElementById('klantTabInhoud');
  if (tab === 'overzicht') renderOverzicht(c, inhoud);
  if (tab === 'onboarding') renderOnboarding(c, inhoud);
  if (tab === 'instellingen') renderInstellingen(c, inhoud);
  if (tab === 'ideeen') { inhoud.innerHTML = ideeenHtml([c], true); bindIdeeen(inhoud); }
  if (tab === 'merkprofiel') renderMerkprofielBouw(c, inhoud);
}


// ---- Overzicht van één klant: open meldingen en een samenvatting ----
function renderOverzicht(c, inhoud) {
  const e = escapeHtmlAdmin;
  const st = statusVanKlant(c);
  const aan = MODULES.filter((m) => m.kort && c[m.veld] && (heeftBlogr(c) || !BLOG_MODULES.includes(m.veld)));
  const login = c.laatsteLogin ? new Date(c.laatsteLogin).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Nog niet bekend';
  const regel = (titel, uitleg, waarde) => `<div class="ad-regel"><div class="ad-regel-tekst"><b>${titel}</b><span>${uitleg}</span></div><div>${waarde}</div></div>`;
  inhoud.innerHTML = `
  <div class="ck-kolommen" style="margin-top:0">
    <section class="ck-kaart ck-hoofd" aria-labelledby="ovMKop">
      <div class="ck-kaart-kop"><div><h2 id="ovMKop">Open meldingen</h2><p id="ovMSub">Alleen voor deze klant, uit dezelfde controle als de cockpit</p></div></div>
      <div id="ovMeldingen"><div class="ck-leeg">Meldingen worden geladen. Dit kan een halve minuut duren.</div></div>
    </section>
    <div class="ck-zij">
      <section class="ck-kaart" aria-labelledby="ovSKop">
        <div class="ck-kaart-kop"><div><h2 id="ovSKop">Samenvatting</h2></div><button type="button" class="p-knop" data-naar-instellingen>Instellingen</button></div>
        ${regel('Klantstatus', 'Bepaalt of de klant kan inloggen', `<span class="p-pil ${st.klasse}">${st.tekst}</span>`)}
        ${regel('Product', 'Wat de klant gebruikt', `<span class="p-pil p-pil-neutraal">${e(c.producten || 'Blogr.')}</span>`)}
        ${regel('Modules aan', 'Wat de klant in het portaal ziet', aan.length ? `<div class="ad-tabel-mod">${aan.map((m) => `<span class="p-pil p-pil-neutraal">${m.kort}</span>`).join('')}</div>` : '<span class="ad-vaag">Geen</span>')}
        ${regel('Laatste login', 'In het klantportaal', e(login))}
      </section>
    </div>
  </div>`;
  inhoud.querySelector('[data-naar-instellingen]').addEventListener('click', () => gaNaar('klant', c.id, 'instellingen'));
  const lijstEl = inhoud.querySelector('#ovMeldingen');
  window.cockpitVoorKlant(c.id).then((r) => {
    if (!document.body.contains(lijstEl) || huidig.klantId !== c.id || huidig.tab !== 'overzicht') return;
    if (r.fout) { lijstEl.innerHTML = `<div class="ck-leeg">${e(r.fout)}</div>`; return; }
    if (r.tijd) inhoud.querySelector('#ovMSub').textContent = `Alleen voor deze klant. Laatst gecontroleerd om ${r.tijd}.`;
    if (!r.meldingen.length) { lijstEl.innerHTML = '<div class="ck-leeg">Geen enkele melding. Alles draait.</div>'; return; }
    lijstEl.innerHTML = `<ul class="ck-lijst">${r.meldingen.map((m, i) => window.cockpitMeldingRij(m, i)).join('')}</ul>`;
    lijstEl.querySelectorAll('[data-melding]').forEach((b) => b.addEventListener('click', () => window.openCockpitMelding(r.meldingen[Number(b.dataset.melding)])));
  });
}

// ---- Onboarding ----
const ONB_PIL = {
  'Klaar': 'p-pil-goed',
  'Bezig': 'p-pil-plan',
  'Wacht op Dylan': 'p-pil-let-op',
  'Wacht op klant': 'p-pil-ai',
  'Overgeslagen': 'p-pil-neutraal',
  'Nog niet gestart': 'p-pil-neutraal'
};
const ONB_STATUSSEN = ['Nog niet gestart', 'Bezig', 'Wacht op Dylan', 'Wacht op klant', 'Klaar', 'Overgeslagen'];
const ONB_AAN_ZET = { Dylan: 'Dylan', Claude: 'Claude in de chat', Klant: 'De klant', Knop: 'Knop in het portaal' };
const ONB_FASEN = { A: 'Aanmelden', B: 'Begrijpen', C: 'Inrichten', D: 'Testen', E: 'Live' };

async function loadOnboarding() {
  try {
    const data = await adminApi('/onboarding');
    const kaart = {};
    data.klanten.forEach((k) => { kaart[k.clientId] = k; });
    adminState.onboarding = kaart;
    adminState.onboardingFout = '';
  } catch (err) {
    adminState.onboardingFout = err.message;
  }
}

async function kopieer(tekst) {
  try {
    await navigator.clipboard.writeText(tekst);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = tekst;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove();
    return ok;
  }
}

async function renderOnboarding(c, inhoud) {
  inhoud.innerHTML = '<p class="admin-footnote">Onboarding laden…</p>';
  // Stap 4 volgt het merkprofiel: even de status opvragen, dan werkt de server de stap bij.
  if (adminState.onboarding[c.id]) await adminApi('/profiel/status?klant=' + encodeURIComponent(c.naam)).catch(() => {});
  mpVorige = '';
  mpInline = null;
  let data;
  try {
    data = await adminApi(`/onboarding/${encodeURIComponent(c.id)}`);
  } catch (err) {
    inhoud.innerHTML = `<p class="admin-footnote">De onboarding kon niet worden geladen: ${escapeHtmlAdmin(err.message)}</p>`;
    return;
  }
  if (huidig.klantId !== c.id || huidig.tab !== 'onboarding') return; // intussen weggeklikt
  let websiteVoorKlant = '';
  if (data.rijen.some((r) => r.nr === 4 || r.nr === 103)) {
    try {
      const intakes = (await adminApi('/intake')).intakes || [];
      const i = intakes.find((x) => x.clientId === c.id) || intakes.find((x) => String(x.klant || '').toLowerCase() === String(c.naam || '').toLowerCase());
      websiteVoorKlant = (i && i.website) || '';
    } catch (err) { websiteVoorKlant = ''; }
    if (huidig.klantId !== c.id || huidig.tab !== 'onboarding') return;
  }
  if (!data.rijen.length) {
    inhoud.innerHTML = `
    <section class="p-kaart ad-blok ad-leeg">
      <h2>De onboarding wordt nog niet bijgehouden</h2>
      <p>Er zijn 21 stappen van intake tot de eerste maand. Na het starten zie je per stap wie aan zet is en wat de uitkomst was, en kun je met één zin in de chat verder.</p>
      <button type="button" class="p-knop p-knop-hoofd" id="onbStart">Onboarding starten</button>
      <span class="mp-bouw-status" id="onbStartStatus"></span>
    </section>`;
    document.getElementById('onbStart').addEventListener('click', async (e) => {
      e.target.disabled = true;
      document.getElementById('onbStartStatus').textContent = 'Stappen aanmaken, dit duurt ongeveer 10 seconden…';
      try {
        await adminApi('/onboarding', { method: 'POST', body: JSON.stringify({ klant: c.naam, clientId: c.id }) });
        await loadOnboarding();
        renderOnboarding(c, inhoud);
      } catch (err) {
        document.getElementById('onbStartStatus').textContent = err.message;
        e.target.disabled = false;
      }
    });
    return;
  }
  adminState.onboarding[c.id] = { clientId: c.id, klant: data.klant, samenvatting: data.samenvatting };
  const sm = data.samenvatting;
  const wacht = sm.wachtOpDylan.map((r) => `<li><span>Stap ${r.nr}. ${escapeHtmlAdmin(r.titel)}${r.uitkomst ? ': ' + escapeHtmlAdmin(r.uitkomst) : ''}</span></li>`).join('');
  const fasen = Object.keys(ONB_FASEN).map((code) => {
    const rijen = data.rijen.filter((r) => r.fase === code);
    if (!rijen.length) return '';
    const klaar = rijen.filter((r) => r.status === 'Klaar' || r.status === 'Overgeslagen').length;
    const stappen = rijen.map((r) => `
      <div class="ad-stap" data-page="${r.id}">
        <div class="ad-rond ad-rond-${r.status === 'Klaar' ? 'klaar' : r.status === 'Wacht op Dylan' ? 'dylan' : r.status === 'Wacht op klant' ? 'klant' : r.status === 'Bezig' ? 'bezig' : r.status === 'Overgeslagen' ? 'over' : 'nog'}" aria-hidden="true">${r.status === 'Klaar' ? '&#10003;' : r.nr}</div>
        <div class="ad-stap-tekst">
          <h4>${escapeHtmlAdmin(r.titel)}</h4>
          <p>${escapeHtmlAdmin(r.uitleg)}</p>
          <input type="text" class="ad-uitkomst" value="${escapeHtmlAdmin(r.uitkomst)}" placeholder="Uitkomst of notitie" aria-label="Uitkomst van stap ${r.nr}" maxlength="500">
          ${(r.nr === 4 || r.nr === 103) ? mpInlineHtml(c, websiteVoorKlant) : ''}
        </div>
        <div class="ad-stap-rechts">
          <select class="ad-statusselect ${ONB_PIL[r.status] || ''}" aria-label="Status van stap ${r.nr}">${ONB_STATUSSEN.map((st) => `<option${st === r.status ? ' selected' : ''}>${st}</option>`).join('')}</select>
          <small>Aan zet: ${ONB_AAN_ZET[r.aanZet] || escapeHtmlAdmin(r.aanZet)}</small>
        </div>
      </div>`).join('');
    return `<section class="p-kaart ad-fase"><div class="ad-fase-kop"><h3>Fase ${code}. ${ONB_FASEN[code]}</h3><span>${klaar} van ${rijen.length} klaar</span></div>${stappen}</section>`;
  }).join('');
  inhoud.innerHTML = `
  <div class="p-kerncijfers ad-kerncijfers">
    <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Voortgang</div><div class="ad-getal">${sm.afgerond}<small> van ${sm.totaal} stappen</small></div></div>
    <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Wacht op jou</div><div class="ad-getal">${sm.wachtOpDylan.length}</div></div>
    <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Wacht op klant</div><div class="ad-getal">${sm.wachtOpKlant.length}</div></div>
    <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Fase</div><div class="ad-getal ad-getal-klein">${sm.gereed ? 'Klaar' : (sm.fase + '. ' + (sm.faseNaam || ''))}</div></div>
  </div>
  ${sm.wachtOpDylan.length ? `<section class="p-kaart ad-jij"><h2><span class="p-pil p-pil-let-op">Wacht op jou</span> ${sm.wachtOpDylan.length} ${sm.wachtOpDylan.length === 1 ? 'punt' : 'punten'}</h2><ul>${wacht}</ul></section>` : ''}
  <section class="p-kaart ad-chat">
    <div><b>Verder in de chat</b><span>Plak deze zin in een nieuwe chat in het project. Claude leest de stand en gaat door.</span><code>${escapeHtmlAdmin(data.chatZin)}</code></div>
    <button type="button" class="p-knop p-knop-hoofd" id="onbKopieer">Kopieer zin</button>
  </section>
  ${fasen}`;
  document.getElementById('onbKopieer').addEventListener('click', async (e) => {
    const ok = await kopieer(data.chatZin);
    e.target.textContent = ok ? 'Gekopieerd' : 'Kopiëren lukt niet, selecteer de zin';
    setTimeout(() => { e.target.textContent = 'Kopieer zin'; }, 2000);
  });
  if (ikEl('mpStart')) {
    mpInline = { c, inhoud };
    ikEl('mpStart').addEventListener('click', () => mpStart(false));
    mpToonStatus();
  }
  inhoud.querySelectorAll('.ad-stap').forEach((rij) => {
    const pageId = rij.dataset.page;
    const sla = async (veld) => {
      rij.classList.add('ad-bezig');
      try {
        await adminApi(`/onboarding/stap/${encodeURIComponent(pageId)}`, { method: 'POST', body: JSON.stringify(veld) });
        renderError('');
        await loadOnboarding();
        if (veld.status !== undefined) renderOnboarding(c, inhoud); else rij.classList.remove('ad-bezig');
      } catch (err) {
        renderError(err.message);
        rij.classList.remove('ad-bezig');
      }
    };
    rij.querySelector('select').addEventListener('change', (e) => sla({ status: e.target.value }));
    rij.querySelector('.ad-uitkomst').addEventListener('change', (e) => sla({ uitkomst: e.target.value }));
  });
}

function renderInstellingen(c, inhoud) {
  const ingesteld = c.klantstatusIngesteld !== false;
  const statusTip = 'Actief: alles werkt. Gepauzeerd of beëindigd: de klant kan niet meer inloggen op het portaal en ziet een melding. De workflows in n8n volgen deze status.';
  const regels = MODULES.filter((m) => heeftBlogr(c) || !BLOG_MODULES.includes(m.veld)).map((m) => `
    <div class="ad-regel">
      <div class="ad-regel-tekst"><b>${m.naam}</b><span>${m.tip}</span></div>
      ${toggleSwitch(m.veld + '-' + c.id, c.id, m.veld, c[m.veld], m.alleenAlsKoppeling && !c.heeftPrestaties, 'Geen prestatiekoppeling ingesteld voor deze klant')}
    </div>`).join('');
  inhoud.innerHTML = `
  <section class="p-kaart ad-blok">
    <div class="ad-regel">
      <div class="ad-regel-tekst"><b>Klantstatus</b><span>${statusTip}</span></div>
      <select class="admin-status admin-status-${ingesteld ? (c.klantstatus || 'actief') : 'leeg'}" data-client="${c.id}" data-statusveld="klantstatus" aria-label="Klantstatus van ${escapeHtmlAdmin(c.naam)}">
        ${ingesteld ? '' : '<option value="" selected>kies status</option>'}
        ${['actief', 'gepauzeerd', 'beëindigd'].map((s) => `<option value="${s}"${ingesteld && (c.klantstatus || 'actief') === s ? ' selected' : ''}>${s}</option>`).join('')}
      </select>
    </div>
  </section>
  ${heeftBlogr(c) ? '<div id="wgKaart" class="wg-houder"><section class="p-kaart ad-blok"><div class="ad-regel"><div class="ad-regel-tekst"><b>Gegevens voor de workflows</b><span>Laden…</span></div></div></section></div>' : ''}
  <section class="p-kaart ad-blok">
    <div class="ad-regel">
      <div class="ad-regel-tekst"><b>Product</b><span>Blogr. toont het blogportaal, Pagr. de landingspagina's. Bij Beide staat er een extra onderdeel in het menu van de klant. Geen van beide: de klant heeft geen product, maar je kunt hieronder Automatisering intern aanzetten voor eigen werk.</span></div>
      <select class="admin-status" data-client="${c.id}" data-productveld="producten" aria-label="Product van ${escapeHtmlAdmin(c.naam)}">
        ${['Blogr.', 'Pagr.', 'Beide', 'Geen van beide'].map((p) => `<option value="${p}"${(c.producten || 'Blogr.') === p ? ' selected' : ''}>${p}</option>`).join('')}
      </select>
    </div>
  </section>
  ${(c.producten === 'Pagr.' || c.producten === 'Beide') ? '' : `<section class="p-kaart ad-blok">
    <div class="ad-regel">
      <div class="ad-regel-tekst"><b>Automatisering intern</b><span>Voor een klant die Pagr. niet betaalt maar waarvoor jij wel landingspagina's maakt. De AI schrijft de tekst, controleert en zet het maandplan klaar, zodat jij sneller werkt. De klant ziet Pagr. niet in zijn portaal.</span></div>
      ${toggleSwitch('internAutomatisering-' + c.id, c.id, 'internAutomatisering', c.internAutomatisering, false, '')}
    </div>
  </section>`}
  ${(c.producten === 'Pagr.' || c.producten === 'Beide' || c.internAutomatisering) ? `<section class="p-kaart ad-blok">
    <div class="ad-regel">
      <div class="ad-regel-tekst"><b>Pagina's per maand</b><span>Het plan in de Werkplaats stelt elke maand dit aantal voor. Leeg betekent geen vast aantal.</span></div>
      <input type="number" min="0" max="100" class="admin-status" style="width:90px" data-client="${c.id}" data-aantalveld="paginasPerMaand" value="${c.paginasPerMaand == null ? '' : c.paginasPerMaand}" aria-label="Pagina's per maand van ${escapeHtmlAdmin(c.naam)}">
    </div>
  </section>` : ''}
  ${(c.producten === 'Pagr.' || c.producten === 'Beide') ? `<section class="p-kaart ad-blok">
    <div class="ad-regel">
      <div class="ad-regel-tekst"><b>Paginameting</b><span>Aan: de klant ziet Google en AI cijfers per pagina, de wekelijkse meting draait en het plan haalt zoekvolumes op. Uit: geen cijfers en geen kosten voor volumes. Staat standaard uit.</span></div>
      ${toggleSwitch('paginameting-' + c.id, c.id, 'paginameting', c.paginameting, false, '')}
    </div>
    <div class="ad-regel">
      <div class="ad-regel-tekst"><b>Search Console site</b><span>Nodig voor de meting. Bijvoorbeeld sc-domain:voorbeeld.nl of https://www.voorbeeld.nl/ (precies zoals in Search Console).</span></div>
      <input type="text" class="admin-status" style="width:260px" data-client="${c.id}" data-siteveld="searchConsoleSite" value="${escapeHtmlAdmin(c.searchConsoleSite || '')}" placeholder="sc-domain:voorbeeld.nl" aria-label="Search Console site van ${escapeHtmlAdmin(c.naam)}">
    </div>
  </section>` : ''}
  <section class="p-kaart ad-blok">
    <header class="ad-blok-kop"><h2>Wat de klant ziet</h2><p>Wijzigingen werken direct door, er is geen deploy nodig.</p></header>
    ${regels}
  </section>
  ${c.inNotion ? '' : '<p class="admin-footnote">Deze klant heeft nog geen rij in de Notion database Portaal Instellingen. Die wordt automatisch aangemaakt bij de eerste wijziging.</p>'}`;
  bindInstellingen(inhoud);
  const wgHouder = inhoud.querySelector('#wgKaart');
  if (wgHouder) laadWorkflowGegevens(c, wgHouder);
}

async function laadWorkflowGegevens(c, houder) {
  try {
    const data = await adminApi(`/klantgegevens/${encodeURIComponent(c.id)}`);
    tekenWorkflowGegevens(c, houder, data);
  } catch (err) {
    houder.innerHTML = `<section class="p-kaart ad-blok"><div class="ad-regel"><div class="ad-regel-tekst"><b>Gegevens voor de workflows</b><span>Kon de gegevens niet ophalen: ${escapeHtmlAdmin(err.message)}</span></div></div></section>`;
  }
}

function tekenWorkflowGegevens(c, houder, data) {
  const kritiekOpen = data.controle.filter((r) => !r.ok && r.kritiek).length;
  const adviesOpen = data.controle.filter((r) => !r.ok && !r.kritiek).length;
  const kop = kritiekOpen
    ? `<span class="p-pil p-pil-let-op">${kritiekOpen} ${kritiekOpen === 1 ? 'punt' : 'punten'} open voor livegang</span>`
    : `<span class="p-pil p-pil-goed">Klaar voor livegang</span>`;
  const controle = `<section class="p-kaart ad-blok">
    <header class="ad-blok-kop"><h2>Controle voor livegang ${kop}</h2><p>Dit komt uit de Clients tabel in n8n. Pas hieronder aan wat ontbreekt.${adviesOpen ? ` Er ${adviesOpen === 1 ? 'is' : 'zijn'} ${adviesOpen} ${adviesOpen === 1 ? 'aandachtspunt' : 'aandachtspunten'}.` : ''}</p></header>
    <ul class="wg-controle">${data.controle.map((r) => `<li class="${r.ok ? 'ok' : (r.kritiek ? 'fout' : 'let-op')}"><span aria-hidden="true">${r.ok ? '&#10003;' : '!'}</span>${escapeHtmlAdmin(r.tekst)}</li>`).join('')}</ul>
  </section>`;
  if (!data.gevonden) { houder.innerHTML = controle; return; }
  const groepen = data.groepen.map((g) => {
    const velden = g.velden.map((v) => {
      const w = data.waarden[v.veld];
      const id = `wg-${v.veld}`;
      let invoer;
      if (v.type === 'schakelaar') {
        invoer = toggleSwitch(id, c.id, v.veld, w, false, '').replace('data-client=', 'data-wg="1" data-client=');
      } else if (v.type === 'keuze') {
        invoer = `<select class="wg-invoer" data-wg="${v.veld}" aria-label="${escapeHtmlAdmin(v.label)}">${v.opties.map((o) => `<option value="${o.waarde}"${o.waarde === w ? ' selected' : ''}>${escapeHtmlAdmin(o.label)}</option>`).join('')}</select>`;
      } else if (v.type === 'lang') {
        invoer = `<textarea class="wg-invoer wg-lang" rows="3" data-wg="${v.veld}" aria-label="${escapeHtmlAdmin(v.label)}">${escapeHtmlAdmin(w)}</textarea>`;
      } else if (v.type === 'getal') {
        invoer = `<input type="number" class="wg-invoer wg-kort" data-wg="${v.veld}" value="${w == null ? '' : w}"${v.min !== undefined ? ` min="${v.min}"` : ''}${v.max !== undefined ? ` max="${v.max}"` : ''} aria-label="${escapeHtmlAdmin(v.label)}">`;
      } else {
        invoer = `<input type="text" class="wg-invoer" data-wg="${v.veld}" value="${escapeHtmlAdmin(w)}"${v.placeholder ? ` placeholder="${escapeHtmlAdmin(v.placeholder)}"` : ''} aria-label="${escapeHtmlAdmin(v.label)}">`;
      }
      return `<div class="ad-regel wg-regel"><div class="ad-regel-tekst"><b>${v.label}</b>${v.tip ? `<span>${v.tip}</span>` : ''}</div>${invoer}</div>`;
    }).join('');
    const geheimen = (g.geheimen || []).map((x) => `<div class="ad-regel wg-regel"><div class="ad-regel-tekst"><b>${x.label}</b><span>Wordt om veiligheidsredenen niet getoond en niet via het portaal aangepast.</span></div><span class="p-pil ${data.geheimen[x.veld] ? 'p-pil-goed' : 'p-pil-let-op'}">${data.geheimen[x.veld] ? 'Ingevuld' : 'Ontbreekt'}</span></div>`).join('');
    return `<section class="p-kaart ad-blok"><header class="ad-blok-kop"><h2>${g.titel}</h2></header>${velden}${geheimen}</section>`;
  }).join('');
  houder.innerHTML = controle + groepen;
  const opslaan = async (veld, waarde, terug) => {
    try {
      await adminApi(`/klantgegevens/${encodeURIComponent(c.id)}`, { method: 'POST', body: JSON.stringify({ field: veld, value: waarde }) });
      renderError('');
      await laadWorkflowGegevens(c, houder);
    } catch (err) {
      if (terug) terug();
      renderError(err.message);
    }
  };
  houder.querySelectorAll('input[data-wg], textarea[data-wg], select[data-wg]').forEach((el) => {
    if (el.type === 'checkbox') return;
    const begin = el.value;
    el.addEventListener('change', () => opslaan(el.dataset.wg, el.value, () => { el.value = begin; }));
  });
  houder.querySelectorAll('input[type="checkbox"][data-wg]').forEach((el) => {
    el.addEventListener('change', () => opslaan(el.dataset.field, el.checked, () => { el.checked = !el.checked; }));
  });
}

function bindInstellingen(root) {
  root.querySelectorAll('input[data-aantalveld]').forEach((input) => {
    input.addEventListener('change', async () => {
      const client = input.dataset.client;
      const entry = adminState.clients.find((c) => c.id === client) || {};
      try {
        await adminApi(`/settings/${encodeURIComponent(client)}`, { method: 'POST', body: JSON.stringify({ field: 'paginasPerMaand', value: input.value }) });
        entry.paginasPerMaand = Number(input.value);
        renderError('');
      } catch (err) {
        input.value = entry.paginasPerMaand == null ? '' : entry.paginasPerMaand;
        renderError(err.message);
      }
    });
  });

  root.querySelectorAll('input[data-siteveld]').forEach((input) => {
    input.addEventListener('change', async () => {
      const client = input.dataset.client;
      const entry = adminState.clients.find((c) => c.id === client) || {};
      try {
        await adminApi(`/settings/${encodeURIComponent(client)}`, { method: 'POST', body: JSON.stringify({ field: 'searchConsoleSite', value: input.value }) });
        entry.searchConsoleSite = input.value.trim();
        renderError('');
      } catch (err) {
        input.value = entry.searchConsoleSite || '';
        renderError(err.message);
      }
    });
  });

  root.querySelectorAll('select[data-productveld]').forEach((select) => {
    select.addEventListener('change', async () => {
      const client = select.dataset.client;
      const entry = adminState.clients.find((c) => c.id === client) || {};
      const oud = entry.producten || 'Blogr.';
      select.disabled = true;
      try {
        const antw = await adminApi(`/settings/${encodeURIComponent(client)}`, { method: 'POST', body: JSON.stringify({ field: 'producten', value: select.value }) });
        entry.producten = select.value;
        renderError('');
        if (antw && antw.melding) { await loadOnboarding(); renderError(antw.melding); }
        // Opnieuw tekenen: bij Pagr. of Beide verschijnen Pagina's per maand en Paginameting, bij Blogr. verdwijnen ze.
        if (entry.id) { renderInstellingen(entry, root); return; }
      } catch (err) {
        select.value = oud;
        renderError(err.message);
      } finally {
        select.disabled = false;
      }
    });
  });

  root.querySelectorAll('select[data-statusveld]').forEach((select) => {
    select.addEventListener('change', async () => {
      const client = select.dataset.client;
      const entry = adminState.clients.find((c) => c.id === client) || {};
      const oud = entry.klantstatusIngesteld === false ? '' : (entry.klantstatus || 'actief');
      const nieuw = select.value;
      if (nieuw !== 'actief') {
        const akkoord = window.confirm(
          `${entry.naam || 'Deze klant'} wordt ${nieuw}. De klant kan daarna niet meer inloggen op het portaal. Doorgaan?`
        );
        if (!akkoord) {
          select.value = oud;
          return;
        }
      }
      select.disabled = true;
      try {
        await adminApi(`/settings/${encodeURIComponent(client)}`, {
          method: 'POST',
          body: JSON.stringify({ field: 'klantstatus', value: nieuw })
        });
        entry.klantstatus = nieuw;
        entry.klantstatusIngesteld = true;
        renderError('');
        renderKlant(entry, 'instellingen');
      } catch (err) {
        select.value = oud;
        renderError(err.message);
      } finally {
        select.disabled = false;
      }
    });
  });

  root.querySelectorAll('input[type="checkbox"][data-client]').forEach((input) => {
    input.addEventListener('change', async () => {
      const { client, field } = input.dataset;
      const value = input.checked;
      if (field === 'merkprofielNaarKennisdocument' && value) {
        const naam = (adminState.clients.find((c) => c.id === client) || {}).naam || 'deze klant';
        const akkoord = window.confirm(
          `Dit vervangt het Kennisdocument van ${naam} door het merkprofiel, en de blogs schrijven daarna op basis daarvan. ` +
          'Het huidige Kennisdocument wordt eerst bewaard. Doorgaan?'
        );
        if (!akkoord) {
          input.checked = false;
          return;
        }
      }
      input.disabled = true;
      try {
        const antwoord = await adminApi(`/settings/${encodeURIComponent(client)}`, {
          method: 'POST',
          body: JSON.stringify({ field, value })
        });
        if (antwoord && antwoord.melding) window.alert(antwoord.melding);
        const entry = adminState.clients.find((c) => c.id === client);
        if (entry) entry[field] = value;
        renderError('');
        if (field === 'ideaEnrichmentEnabled') await loadIdeaProposals();
      } catch (err) {
        input.checked = !value; // terugzetten bij een fout
        renderError(err.message);
      } finally {
        input.disabled = false;
      }
    });
  });
}

// ---- Ideeën ter beoordeling ----
function ideeKaart(p, klantId) {
  return `
      <div class="proposal-card" data-page-id="${p.id}" data-client="${escapeHtmlAdmin(klantId)}">
        <div class="proposal-header">
          <div class="proposal-title">${escapeHtmlAdmin(p.titel)}</div>
          <span class="tag">${escapeHtmlAdmin(p.categorie)} / ${escapeHtmlAdmin(p.cluster)}</span>
        </div>
        <div class="proposal-meta">
          <div><span class="seo-label">Hoofdkeyword</span>${escapeHtmlAdmin(p.mainKeyword || '')}</div>
          <div><span class="seo-label">Secundaire keywords</span>${escapeHtmlAdmin(p.secundaireKeywords)}</div>
          <div><span class="seo-label">Zoekintentie</span>${escapeHtmlAdmin(p.zoekintentie)}</div>
          <div><span class="seo-label">SEO titel</span>${escapeHtmlAdmin(p.seoTitle)}</div>
          <div><span class="seo-label">Meta omschrijving</span>${escapeHtmlAdmin(p.seoDescription)}</div>
          <div><span class="seo-label">Voorgestelde publicatiedatum</span>${escapeHtmlAdmin(p.publicatiedatum)}</div>
          ${(p.overlap && p.overlap.length) ? `<div class="proposal-overlap"><span class="seo-label">Mogelijke dubbeling</span>${p.overlap.map((o) => `${escapeHtmlAdmin(o.titel)} (${escapeHtmlAdmin(o.status)}, ${o.reden === 'zelfde' ? 'zelfde hoofdkeyword' : 'overlappend hoofdkeyword'})`).join('<br>')}</div>` : ''}
          ${p.intentie ? `<div><span class="seo-label">Intentie</span>${escapeHtmlAdmin(p.intentie)}</div>` : ''}
          ${p.bestaandeUrl ? `<div><span class="seo-label">Bestaande URL</span>${escapeHtmlAdmin(p.bestaandeUrl)}</div>` : ''}
          ${p.opmerkingenKlant ? `<div><span class="seo-label">Toelichting klant</span>${escapeHtmlAdmin(p.opmerkingenKlant)}</div>` : ''}
        </div>
        <div class="proposal-actions">
          <button type="button" class="btn btn-approve proposal-approve">Goedkeuren</button>
          <button type="button" class="btn btn-reject proposal-reject">Afwijzen</button>
        </div>
      </div>`;
}

function ideeenHtml(klanten, metKop) {
  const metFunctie = klanten.filter((c) => c.ideaEnrichmentEnabled);
  if (!metFunctie.length) {
    return `<p class="admin-footnote">${klanten.length === 1 ? 'Deze klant heeft' : 'Geen enkele klant heeft'} ideeën aandragen niet aanstaan.</p>`;
  }
  return metFunctie.map((c) => {
    const lijst = adminState.ideeen[c.id] || [];
    const kaarten = lijst.length
      ? lijst.map((p) => ideeKaart(p, c.id)).join('')
      : `<p class="admin-footnote">Geen ideeën ter beoordeling${klanten.length === 1 ? '' : ' voor ' + escapeHtmlAdmin(c.naam)}.</p>`;
    return `
    <div class="proposal-client-block">
      ${metFunctie.length > 1 || !metKop ? `<div class="proposal-client-name">${escapeHtmlAdmin(c.naam)}</div>` : ''}
      <div class="proposal-list">${kaarten}</div>
    </div>`;
  }).join('');
}

function bindIdeeen(root) {
  root.querySelectorAll('.proposal-card').forEach((card) => {
    const pageId = card.dataset.pageId;
    const klantId = card.dataset.client;
    const beslis = async (besluit, btn) => {
      btn.disabled = true;
      try {
        await adminApi(`/${encodeURIComponent(klantId)}/idea-proposals/${encodeURIComponent(pageId)}/${besluit}`, { method: 'POST' });
        adminState.ideeen[klantId] = (adminState.ideeen[klantId] || []).filter((p) => p.id !== pageId);
        card.remove();
        updateIdeeenTeller();
        renderError('');
      } catch (err) {
        renderError(err.message);
        btn.disabled = false;
      }
    };
    card.querySelector('.proposal-approve')?.addEventListener('click', (e) => beslis('approve', e.target));
    card.querySelector('.proposal-reject')?.addEventListener('click', (e) => beslis('reject', e.target));
  });
}

// ---- FAQ voorstellen uit AI vragen ----
function updateFaqTeller() {
  const n = (adminState.faq.voorstellen || []).length;
  const el = document.getElementById('faqTeller');
  if (!el) return;
  el.textContent = n > 0 ? String(n) : '';
  el.classList.toggle('hidden', n === 0);
}

function faqKaart(r) {
  const e = escapeHtmlAdmin;
  const soort = r.pagina_type === 'pagr' ? 'Pagr. pagina' : (r.pagina_type === 'post' || r.pagina_type === 'news' ? 'Blog' : 'Pagina');
  const veiligeUrl = /^https?:\/\/[^\s"'<>]+$/i.test(r.pagina_url || '') ? r.pagina_url : '';
  const pagina = veiligeUrl ? `<a href="${e(veiligeUrl)}" target="_blank" rel="noopener noreferrer">${e(r.pagina_titel || veiligeUrl)}</a>` : e(r.pagina_titel || '');
  return `
      <div class="proposal-card" data-faq-id="${e(r.id)}">
        <div class="proposal-header">
          <div class="proposal-title">${e(r.klant)}</div>
          <span class="tag">${e(soort)}</span>
        </div>
        <div class="proposal-meta">
          <div><span class="seo-label">Pagina</span>${pagina}</div>
          <div><span class="seo-label">Vraag</span><input type="text" class="wg-invoer faq-vraag" value="${e(r.vraag)}" aria-label="Vraag"></div>
          <div><span class="seo-label">Antwoord</span><textarea class="wg-invoer wg-lang faq-antwoord" rows="4" aria-label="Antwoord">${e(r.antwoord)}</textarea></div>
          <div><span class="seo-label">Bron van het antwoord</span>${e(r.bron || '')}</div>
          ${r.plek ? `<div><span class="seo-label">Plek op de pagina</span>${e(r.plek)}</div>` : ''}
          ${r.genoemd_voor ? `<div><span class="seo-label">Nulmeting</span>${e(r.genoemd_voor)}</div>` : ''}
          ${r.reden ? `<div class="proposal-overlap"><span class="seo-label">Let op</span>${e(r.reden)}</div>` : ''}
        </div>
        <div class="proposal-actions">
          <button type="button" class="btn btn-approve faq-akkoord">${r.pagina_type === 'pagr' ? 'Goedkeuren en in Pagr. zetten' : 'Goedkeuren'}</button>
          <button type="button" class="btn btn-reject faq-afwijzen">Afwijzen</button>
        </div>
      </div>`;
}

function faqHtml(naam) {
  const e = escapeHtmlAdmin;
  const pas = (r) => !naam || r.klant === naam;
  const voorstellen = (adminState.faq.voorstellen || []).filter(pas);
  const toegepast = (adminState.faq.toegepast || []).filter(pas);
  const groepen = [...new Set(voorstellen.map((r) => r.klant))];
  const kaarten = voorstellen.length
    ? groepen.map((k) => `<div class="proposal-client-block"><div class="proposal-client-name">${e(k)}</div><div class="proposal-list">${voorstellen.filter((r) => r.klant === k).map(faqKaart).join('')}</div></div>`).join('')
    : '<p class="admin-footnote">Geen FAQ voorstellen ter beoordeling.</p>';
  const recent = toegepast.length
    ? `<section class="p-kaart ad-blok"><header class="ad-blok-kop"><h2>Recent toegepast</h2><p>De nulmeting staat erbij. De AI meting laat na 4 en 8 weken zien of het merk vaker wordt genoemd.</p></header>
        ${toegepast.map((r) => `<div class="ad-regel"><div class="ad-regel-tekst"><b>${e(r.vraag)}</b><span>${e(r.klant)}, ${e(r.pagina_titel || '')}${r.toegepast ? `, ${e(String(r.toegepast).slice(0, 10))}` : ''}${r.genoemd_voor ? `, nulmeting: ${e(r.genoemd_voor)}` : ''}</span></div></div>`).join('')}
      </section>`
    : '';
  return kaarten + recent;
}

function bindFaq(root) {
  root.querySelectorAll('.proposal-card[data-faq-id]').forEach((card) => {
    const id = card.dataset.faqId;
    const beslis = async (besluit, btn) => {
      btn.disabled = true;
      try {
        const body = besluit === 'akkoord'
          ? { vraag: card.querySelector('.faq-vraag').value, antwoord: card.querySelector('.faq-antwoord').value }
          : {};
        await adminApi(`/faq/${encodeURIComponent(id)}/${besluit}`, { method: 'POST', body: JSON.stringify(body) });
        renderError('');
        await loadFaq();
      } catch (err) {
        renderError(err.message);
        btn.disabled = false;
      }
    };
    card.querySelector('.faq-akkoord')?.addEventListener('click', (ev) => beslis('akkoord', ev.target));
    card.querySelector('.faq-afwijzen')?.addEventListener('click', (ev) => beslis('afwijzen', ev.target));
  });
}

function renderFaqScherm() {
  const el = document.getElementById('faqVoorstellen');
  const alle = adminState.clients;
  if (adminState.klantKeuze && !alle.some((c) => c.id === adminState.klantKeuze)) adminState.klantKeuze = '';
  const kiezerEl = document.getElementById('faqKiezer');
  kiezerEl.innerHTML = kiezerHtml(alle.map((c) => ({ id: c.id, naam: c.naam })));
  bindKiezer(kiezerEl, renderFaqScherm);
  const gekozen = alle.find((c) => c.id === adminState.klantKeuze);
  el.innerHTML = faqHtml(gekozen ? gekozen.naam : '');
  bindFaq(el);
}

async function loadFaq() {
  try {
    const data = await adminApi('/faq');
    adminState.faq = { voorstellen: data.voorstellen || [], toegepast: data.toegepast || [] };
    updateFaqTeller();
    if (huidig.view === 'faq') renderFaqScherm();
  } catch (err) {
    // De FAQ tabel is een extra onderdeel, een fout hier mag de rest van de admin niet blokkeren.
    adminState.faq = { voorstellen: [], toegepast: [] };
  }
}

function renderIdeeenScherm() {
  const el = document.getElementById('ideaProposals');
  const alle = adminState.clients;
  if (adminState.klantKeuze && !alle.some((c) => c.id === adminState.klantKeuze)) adminState.klantKeuze = '';
  const kiezerEl = document.getElementById('ideeKiezer');
  kiezerEl.innerHTML = kiezerHtml(alle.map((c) => ({ id: c.id, naam: c.naam })));
  bindKiezer(kiezerEl, renderIdeeenScherm);
  el.innerHTML = ideeenHtml(adminState.klantKeuze ? alle.filter((c) => c.id === adminState.klantKeuze) : alle, false);
  bindIdeeen(el);
}

async function loadIdeaProposals() {
  const metFunctie = adminState.clients.filter((c) => c.ideaEnrichmentEnabled);
  const nieuw = {};
  try {
    await Promise.all(
      metFunctie.map(async (c) => {
        const data = await adminApi(`/${encodeURIComponent(c.id)}/idea-proposals`);
        nieuw[c.id] = data.proposals || [];
      })
    );
    adminState.ideeen = nieuw;
    updateIdeeenTeller();
    if (['klanten', 'ideeen'].includes(huidig.view) || (huidig.view === 'klant' && huidig.tab === 'ideeen')) toonScherm();
  } catch (err) {
    renderError(err.message);
  }
}

async function loadSettings() {
  try {
    const data = await adminApi('/settings');
    adminState.clients = data.clients;
    renderError('');
    toonScherm();
  } catch (err) {
    renderError(err.message);
  }
}

// Teller bij Werkplaats in het menu: hoeveel pagina's wachten er op jou (alleen klanten met de Pagr. module).
async function ververWachtTeller() {
  const el = document.getElementById('wachtTeller');
  if (!el) return;
  try {
    const res = await fetch('/api/lp/wacht-op-jou');
    const data = await res.json().catch(() => ({}));
    const n = res.ok ? Number(data.totaal) || 0 : 0;
    el.textContent = String(n);
    el.classList.toggle('hidden', !n);
    el.title = (data.klanten || []).map((k) => {
      const delen = [];
      if (k.controleren && k.controleren.length) delen.push(`${k.controleren.length} te controleren`);
      if (k.fout && k.fout.length) delen.push(`${k.fout.length} mislukt`);
      if (k.voorstellen) delen.push(`${k.voorstellen} ${k.voorstellen === 1 ? 'voorstel' : 'voorstellen'}`);
      if (k.ideeen) delen.push(`${k.ideeen} ${k.ideeen === 1 ? 'idee van de klant' : 'ideeën van de klant'}`);
      return `${k.naam}: ${delen.join(', ') || k.totaal}`;
    }).join('\n');
  } catch (e) { el.classList.add('hidden'); }
}
setInterval(ververWachtTeller, 5 * 60 * 1000);

async function startAdmin() {
  ververWachtTeller();
  laadCockpit();
  await loadOnboarding();
  await loadSettings();
  await loadIdeaProposals();
  await loadFaq();
}

const INTAKE_STATUS_OPTIONS = ['Nieuw', 'In behandeling', 'Afgerond', 'Fout'];

function renderIntakeError(message) {
  const el = document.getElementById('intakeError');
  if (!message) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.textContent = message;
  el.classList.remove('hidden');
}

document.getElementById('intakeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  renderIntakeError('');
  const payload = {
    klant: document.getElementById('intakeKlant').value.trim(),
    clientId: document.getElementById('intakeClientId').value.trim(),
    tier: ikBlogr() ? document.getElementById('intakeTier').value : '',
    website: document.getElementById('intakeWebsite').value.trim(),
    businessOmschrijving: document.getElementById('intakeBusiness').value.trim(),
    toneOfVoice: document.getElementById('intakeTone').value.trim(),
    onderwerpsrichtingen: document.getElementById('intakeTopics').value.trim(),
    producten: ikProduct(),
    blogsPerMaand: ikBlogr() ? document.getElementById('intakeBlogsPerMaand').value : '',
    paginasPerMaand: ikPagr() ? document.getElementById('intakePaginasPerMaand').value : '',
    paginameting: ikPagr() && ikEl('intakeLpMeting').checked,
    lpTelefoon: ikEl('intakeLpTelefoon').value.trim(),
    lpEmail: ikEl('intakeLpEmail').value.trim(),
    lpStraat: ikEl('intakeLpStraat').value.trim(),
    lpPostcode: ikEl('intakeLpPostcode').value.trim(),
    lpPlaats: ikEl('intakeLpPlaats').value.trim(),
    lpWerkgebied: ikEl('intakeLpWerkgebied').value.trim(),
    searchConsoleSite: ikPagr() ? ikEl('intakeLpSite').value.trim() : '',
    driveMapUrl: document.getElementById('intakeDriveUrl').value.trim(),
    notificatieEmails: document.getElementById('intakeNotificatieEmails').value.trim(),
    wordpressVanToepassing: ikBlogr() && document.getElementById('intakeWordpress').checked,
    wordpressUrl: document.getElementById('intakeWordpressUrl').value.trim(),
    wpGebruikersnaam: document.getElementById('intakeWpGebruikersnaam').value.trim(),
    wpAppPassword: document.getElementById('intakeWpAppPassword').value.trim(),
    wpPostType: document.getElementById('intakeWpPostType').value,
    merknaam: document.getElementById('intakeKlant').value.trim(),
    portaalSlug: document.getElementById('intakeClientId').value.trim(),
    searchConsoleUrl: document.getElementById('intakeGsc').value.trim(),
    ga4PropertyId: document.getElementById('intakeGa4').value.trim(),
    leadEvent: document.getElementById('intakeLeadEvent').value.trim(),
    boekingEvent: document.getElementById('intakeBoekingEvent').value.trim(),
    contactPaden: document.getElementById('intakeContactPaden').value.trim(),
    boekPaden: document.getElementById('intakeBoekPaden').value.trim(),
    portalWachtwoord: '',
    reviewEnabled: ikBlogr() && document.getElementById('intakeReview').checked,
    performanceEnabled: ikBlogr() && document.getElementById('intakePerformance').checked,
    ideaEnrichmentEnabled: ikBlogr() && document.getElementById('intakeIdea').checked,
    notities: [document.getElementById('intakeNotes').value.trim(), (ikAdviesData && ikEl('ikAdviesNotitie') && ikEl('ikAdviesNotitie').checked) ? ikAdviesData.notitie : ''].filter(Boolean).join(' ')
  };
  try {
    const intakeAntwoord = await adminApi('/intake', { method: 'POST', body: JSON.stringify(payload) });
    let profiel = { gestart: false, fout: '' };
    if (ikEl('intakeProfiel').checked && payload.website) {
      try {
        await adminApi('/profiel/start', { method: 'POST', body: JSON.stringify({ klant: payload.klant, website: payload.website, force: false }) });
        profiel.gestart = true;
      } catch (err) {
        profiel.fout = err.message;
      }
    }
    document.getElementById('intakeForm').reset();
    ikAdviesData = null; ikEl('ikAdviesUit').classList.add('hidden'); ikEl('ikAdviesUit').innerHTML = '';
    document.getElementById('intakeReview').checked = true;
    ikEl('intakeProducten').value = 'Blogr.';
    clientIdHandmatig = false;
    ikMelding('');
    ikUpdate();
    await loadIntakes();
    await loadOnboarding();
    toonIntakeSucces({ klant: payload.klant, clientId: payload.clientId, onboardingFout: intakeAntwoord.onboardingMelding, klantgegevens: intakeAntwoord.klantgegevensMelding, instellingen: intakeAntwoord.instellingenMelding, producten: payload.producten, profiel });
    window.scrollTo(0, 0);
  } catch (err) {
    renderIntakeError(err.message);
  }
});

// Na het opslaan: bevestiging en de zin die Dylan in een nieuwe chat plakt om de onboarding samen af te lopen.
function toonIntakeSucces({ klant, clientId, onboardingFout, klantgegevens, instellingen, producten, profiel }) {
  const el = ikEl('ikSucces');
  const zin = `Onboarding ${klant}, ga verder.`;
  const regel = (ok, tekst) => `<li class="${ok ? 'ok' : 'let-op'}"><span aria-hidden="true">${ok ? '&#10003;' : '!'}</span>${escapeHtmlAdmin(tekst)}</li>`;
  const regels = [
    regel(true, producten === 'Pagr.' ? 'De intake staat in Notion.' : 'De intake staat in Notion. n8n verwerkt hem binnen een uur.'),
    onboardingFout || !clientId
      ? regel(false, onboardingFout || 'Er is geen Client ID, dus de onboardingstappen zijn niet aangemaakt.')
      : regel(true, 'De onboardingstappen zijn aangemaakt. Stap 1 (websitescan en nieuwe klant) staat op Klaar.'),
    klantgegevens ? regel(!/kon niet/i.test(klantgegevens), klantgegevens) : '',
    instellingen ? regel(false, instellingen) : (producten !== 'Blogr.' ? regel(true, "Product en pagina's per maand staan ingesteld.") : ''),
    profiel.gestart ? regel(true, 'Het merkprofiel wordt opgebouwd, ongeveer 4 minuten.') : '',
    profiel.fout ? regel(false, 'Het merkprofiel kon niet starten: ' + profiel.fout) : ''
  ].join('');
  el.className = 'p-kaart ad-succes';
  el.innerHTML = `
    <h2>Intake gelukt voor ${escapeHtmlAdmin(klant)}</h2>
    <ul class="ad-succes-lijst">${regels}</ul>
    <div class="ad-succes-prompt">
      <b>Ga nu verder in een nieuwe chat</b>
      <span>Plak deze zin in een nieuwe chat in het project SEO Blog Automation. Claude leest de stand en loopt de onboarding met je door.</span>
      <code id="ikPrompt">${escapeHtmlAdmin(zin)}</code>
      <div class="ad-succes-acties">
        <button type="button" class="p-knop p-knop-hoofd" id="ikKopieer">Kopieer zin</button>
        ${clientId && !onboardingFout ? '<button type="button" class="p-knop" id="ikNaarOnboarding">Bekijk de onboarding</button>' : ''}
      </div>
    </div>`;
  ikEl('ikKopieer').addEventListener('click', async (e) => {
    const ok = await kopieer(zin);
    e.target.textContent = ok ? 'Gekopieerd' : 'Kopiëren lukt niet, selecteer de zin';
    setTimeout(() => { e.target.textContent = 'Kopieer zin'; }, 2000);
  });
  const naar = ikEl('ikNaarOnboarding');
  if (naar) naar.addEventListener('click', () => gaNaar('klant', clientId, 'onboarding'));
}


// ---- Intakeformulier: analyse, dynamische secties en checklist ----
let clientIdHandmatig = false;

function ikEl(id) { return document.getElementById(id); }

function ikMelding(tekst) {
  const el = ikEl('ikAnalyse');
  if (!tekst) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.textContent = tekst;
  el.classList.remove('hidden');
}

function ikSlug(tekst) {
  return String(tekst || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function ikProduct() { return ikEl('intakeProducten').value || 'Blogr.'; }
function ikBlogr() { return ikProduct() !== 'Pagr.'; }
function ikPagr() { return ikProduct() !== 'Blogr.'; }

function ikToonSecties() {
  const product = ikProduct();
  // Eerst de secties die bij een ander product horen, dan de schakelaars binnen de zichtbare secties.
  document.querySelectorAll('[data-voor]').forEach((blok) => {
    blok.classList.toggle('hidden', !blok.dataset.voor.split(' ').includes(product));
  });
  document.querySelectorAll('[data-toon-bij]').forEach((blok) => {
    const schakel = ikEl(blok.dataset.toonBij);
    blok.classList.toggle('hidden', !(schakel && schakel.checked));
  });
  // Nummering van de zichtbare kaarten.
  let n = 0;
  document.querySelectorAll('#intakeForm .ik-kaart').forEach((kaart) => {
    if (kaart.classList.contains('hidden')) return;
    const nr = kaart.querySelector('.ik-nr');
    if (nr) nr.textContent = String(++n);
  });
}

// Zijbalk: wat er bij opslaan wordt aangemaakt, afhankelijk van het gekozen product.
function ikWatGebeurt() {
  const regels = ['De intake komt in Notion', 'De onboardingstappen worden aangemaakt'];
  if (ikBlogr()) regels.push('n8n bouwt de blogkant binnen een uur');
  if (ikEl('intakeProfiel').checked) regels.push('Het merkprofiel wordt opgebouwd');
  if (ikPagr()) { regels.push('De klant komt in Pagr. Klantgegevens'); regels.push("Product en pagina's per maand worden ingesteld"); }
  return regels;
}

function ikCheckItems() {
  const waarde = (id) => ikEl(id).value.trim();
  const items = [
    { tekst: 'Website', ok: !!waarde('intakeWebsite'), verplicht: true },
    { tekst: 'Klantnaam', ok: !!waarde('intakeKlant'), verplicht: true },
    { tekst: 'Client ID', ok: !!waarde('intakeClientId'), verplicht: true },
    { tekst: 'Omschrijving van de klant', ok: !!waarde('intakeBusiness'), verplicht: false }
  ];
  if (ikBlogr()) items.push({ tekst: 'Onderwerpsrichtingen', ok: !!waarde('intakeTopics'), verplicht: false });
  if (ikPagr()) {
    items.push({ tekst: "Pagina's per maand", ok: !!waarde('intakePaginasPerMaand'), verplicht: false });
    items.push({ tekst: 'Telefoonnummer', ok: !!waarde('intakeLpTelefoon'), verplicht: false });
    items.push({ tekst: 'Plaats en werkgebied', ok: !!waarde('intakeLpPlaats') && !!waarde('intakeLpWerkgebied'), verplicht: false });
    if (ikEl('intakeLpMeting').checked) items.push({ tekst: 'Search Console site', ok: !!waarde('intakeLpSite'), verplicht: true });
  }
  if (ikBlogr() && ikEl('intakeWordpress').checked) {
    items.push({ tekst: 'WordPress URL', ok: !!waarde('intakeWordpressUrl'), verplicht: true });
    items.push({ tekst: 'WordPress gebruikersnaam en application password', ok: !!waarde('intakeWpGebruikersnaam') && !!waarde('intakeWpAppPassword'), verplicht: true });
  }
  if (ikBlogr() && ikEl('intakePerformance').checked) {
    items.push({ tekst: 'Search Console property', ok: !!waarde('intakeGsc'), verplicht: true });
    items.push({ tekst: 'GA4 property ID', ok: !!waarde('intakeGa4'), verplicht: false });
    items.push({ tekst: 'Lead event', ok: !!waarde('intakeLeadEvent'), verplicht: false });
  }
  return items;
}

function ikUpdate() {
  ikToonSecties();
  const items = ikCheckItems();
  const klaar = items.filter((i) => i.ok).length;
  const verplichtOpen = items.filter((i) => i.verplicht && !i.ok).length;
  ikEl('ikVoortgang').textContent = verplichtOpen
    ? `${verplichtOpen} verplicht nog open, ${klaar} van ${items.length} ingevuld`
    : `Alles verplicht is ingevuld, ${klaar} van ${items.length} ingevuld`;
  ikEl('ikWatGebeurt').innerHTML = ikWatGebeurt().map((t) => `<li>${escapeHtmlAdmin(t)}</li>`).join('');
  ikEl('ikBalk').style.width = `${Math.round((klaar / items.length) * 100)}%`;
  ikEl('ikCheck').innerHTML = items.map((i) =>
    `<li class="${i.ok ? 'ik-ok' : (i.verplicht ? 'ik-open' : 'ik-optioneel')}"><span class="ik-vink">${i.ok ? '✓' : ''}</span>${escapeHtmlAdmin(i.tekst)}${!i.ok && !i.verplicht ? ' <em>(handig)</em>' : ''}</li>`
  ).join('');
}

function ikVulAlsLeeg(id, waarde) {
  const el = ikEl(id);
  if (waarde && !el.value.trim()) { el.value = waarde; return true; }
  return false;
}

async function ikAnalyseer() {
  const knop = ikEl('intakeAnalyseer');
  const website = ikEl('intakeWebsite').value.trim();
  if (!website) { ikMelding('Vul eerst de website in.'); return; }
  knop.disabled = true;
  knop.textContent = 'Bezig...';
  ikMelding('');
  try {
    const r = await adminApi('/intake/analyseer', { method: 'POST', body: JSON.stringify({ website }) });
    const ingevuld = [];
    ikEl('intakeWebsite').value = r.website || website;
    if (ikVulAlsLeeg('intakeKlant', r.naam)) ingevuld.push('klantnaam');
    if (!clientIdHandmatig && ikVulAlsLeeg('intakeClientId', r.clientId)) ingevuld.push('Client ID');
    if (ikVulAlsLeeg('intakeBusiness', r.beschrijving)) ingevuld.push('omschrijving');
    if (r.wordpress) {
      ikEl('intakeWordpress').checked = true;
      ikVulAlsLeeg('intakeWordpressUrl', r.wordpressUrl);
      ingevuld.push('WordPress');
    }
    if (ikEl('intakePerformance').checked) ikVulAlsLeeg('intakeGsc', r.searchConsoleUrl);
    if (ikEl('intakeLpMeting').checked) ikVulAlsLeeg('intakeLpSite', r.searchConsoleUrl);
    ikMelding(ingevuld.length
      ? `Ingevuld: ${ingevuld.join(', ')}. Controleer even of dit klopt, het is afgeleid van de homepage.`
      : 'De website is gelezen, maar er was niets nieuws om in te vullen.');
  } catch (err) {
    ikMelding(err.message);
  } finally {
    knop.disabled = false;
    knop.textContent = 'Analyseer';
    ikUpdate();
  }
}

ikEl('intakeAnalyseer').addEventListener('click', ikAnalyseer);
ikEl('intakeWebsite').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ikAnalyseer(); } });
ikEl('intakeClientId').addEventListener('input', () => { clientIdHandmatig = !!ikEl('intakeClientId').value.trim(); });
ikEl('intakeKlant').addEventListener('input', () => {
  if (!clientIdHandmatig) ikEl('intakeClientId').value = ikSlug(ikEl('intakeKlant').value);
});
document.querySelectorAll('input[name="ikProduct"]').forEach((r) => r.addEventListener('change', () => {
  ikEl('intakeProducten').value = r.value;
  ikUpdate();
}));
ikEl('intakeForm').addEventListener('input', ikUpdate);
ikEl('intakeForm').addEventListener('change', ikUpdate);
ikUpdate();


// ---- AI advies bij de intake ----
let ikAdviesData = null;
const IK_DOELEN = {
  omschrijving: { id: 'intakeBusiness', waarde: (a) => a.omschrijving, label: 'Omschrijving' },
  onderwerpen: { id: 'intakeTopics', waarde: (a) => (a.blogr ? a.blogr.onderwerpsrichtingen.join('\n') : ''), label: 'Onderwerpsrichtingen' },
  tone: { id: 'intakeTone', waarde: (a) => (a.blogr ? a.blogr.toneOfVoice : ''), label: 'Tone of voice' },
  blogs: { id: 'intakeBlogsPerMaand', waarde: (a) => (a.blogr && a.blogr.blogsPerMaand ? String(a.blogr.blogsPerMaand) : ''), label: 'Blogs per maand' },
  werkgebied: { id: 'intakeLpWerkgebied', waarde: (a) => (a.pagr ? a.pagr.werkgebied.join(', ') : ''), label: 'Werkgebied' },
  paginas: { id: 'intakePaginasPerMaand', waarde: (a) => (a.pagr && a.pagr.paginasPerMaand ? String(a.pagr.paginasPerMaand) : ''), label: "Pagina's per maand" }
};

function ikNeem(doel, alleenLeeg) {
  const d = IK_DOELEN[doel];
  const waarde = ikAdviesData && d.waarde(ikAdviesData);
  const el = ikEl(d.id);
  if (!waarde || !el) return false;
  const isSelect = el.tagName === 'SELECT';
  if (alleenLeeg && !isSelect && el.value.trim()) return false;
  el.value = waarde;
  return true;
}

function ikTekenAdvies(a) {
  const lijstHtml = (items) => `<ul class="ika-lijst">${items.map((i) => `<li>${escapeHtmlAdmin(i)}</li>`).join('')}</ul>`;
  const blok = (titel, inhoud, doelen = []) => inhoud ? `<div class="ika-blok"><div class="ika-kop"><b>${titel}</b>${doelen.map((d) => `<button type="button" class="p-knop ika-neem" data-doel="${d}">Overnemen in ${escapeHtmlAdmin(IK_DOELEN[d].label.toLowerCase())}</button>`).join('')}</div>${inhoud}</div>` : '';
  const conc = a.concurrenten.length ? `<ul class="ika-lijst">${a.concurrenten.map((c) => `<li>${c.url ? `<a href="${escapeHtmlAdmin(c.url)}" target="_blank" rel="noopener">${escapeHtmlAdmin(c.naam)}</a>` : escapeHtmlAdmin(c.naam)}${c.opvallend ? ': ' + escapeHtmlAdmin(c.opvallend) : ''}</li>`).join('')}</ul>` : '';
  const html = [
    blok('Zo zie ik de klant', `<p>${escapeHtmlAdmin(a.samenvatting)}</p>`, a.omschrijving ? ['omschrijving'] : []),
    a.blogr ? blok('Blogr. inhoud', `${a.blogr.onderwerpsrichtingen.length ? lijstHtml(a.blogr.onderwerpsrichtingen) : ''}${a.blogr.toneOfVoice ? `<p><em>Schrijfstijl:</em> ${escapeHtmlAdmin(a.blogr.toneOfVoice)}</p>` : ''}${a.blogr.blogsPerMaand ? `<p><em>Advies:</em> ${a.blogr.blogsPerMaand} blogs per maand. ${escapeHtmlAdmin(a.blogr.toelichting)}</p>` : `<p>${escapeHtmlAdmin(a.blogr.toelichting)}</p>`}`, ['onderwerpen', 'tone', ...(a.blogr.blogsPerMaand ? ['blogs'] : [])]) : '',
    a.pagr ? blok("Pagr. landingspagina's", `${a.pagr.diensten.length ? `<p><em>Diensten voor een eigen pagina:</em></p>${lijstHtml(a.pagr.diensten)}` : ''}${a.pagr.werkgebied.length ? `<p><em>Werkgebied:</em> ${escapeHtmlAdmin(a.pagr.werkgebied.join(', '))}</p>` : ''}${a.pagr.toelichting ? `<p>${escapeHtmlAdmin(a.pagr.toelichting)}</p>` : ''}`, [...(a.pagr.werkgebied.length ? ['werkgebied'] : []), ...(a.pagr.paginasPerMaand ? ['paginas'] : [])]) : '',
    blok('Markt en concurrentie', `${a.markt ? `<p>${escapeHtmlAdmin(a.markt)}</p>` : ''}${conc}`),
    blok('Kansen', a.kansen.length ? lijstHtml(a.kansen) : ''),
    blok('Let op en vragen aan de klant', `${a.aandachtspunten.length ? lijstHtml(a.aandachtspunten) : ''}${a.vragenAanKlant.length ? `<p><em>Vraag de klant:</em></p>${lijstHtml(a.vragenAanKlant)}` : ''}`)
  ].join('');
  const bronnen = a.bronnen.length ? `<details class="ika-bronnen"><summary>Bronnen (${a.bronnen.length})</summary>${a.bronnen.map((u) => `<div><a href="${escapeHtmlAdmin(u)}" target="_blank" rel="noopener">${escapeHtmlAdmin(u)}</a></div>`).join('')}</details>` : '';
  const let_op = [!a.websiteGelezen ? 'De website kon niet worden gelezen.' : '', !a.zelfOnderzoek ? 'De AI kon niet op internet zoeken, dit advies is alleen gebaseerd op wat je invulde.' : ''].filter(Boolean).join(' ');
  ikEl('ikAdviesUit').innerHTML = `${let_op ? `<div class="ik-melding">${escapeHtmlAdmin(let_op)}</div>` : ''}${html}
    <div class="ika-onder">
      <button type="button" class="btn btn-approve" id="ikNeemAlles">Alles overnemen in lege velden</button>
      <label class="ik-schakel"><input type="checkbox" id="ikAdviesNotitie" checked><span class="ik-spoor"></span><span>Advies kort bewaren in de notities van de klant</span></label>
    </div>${bronnen}
    <p class="ik-hint">Dit is een voorstel. Jij of de klant weet meer: pas gerust aan, en vul zelf aan.</p>`;
  ikEl('ikAdviesUit').classList.remove('hidden');
  ikEl('ikAdviesUit').querySelectorAll('.ika-neem').forEach((b) => b.addEventListener('click', () => { ikNeem(b.dataset.doel, false); b.textContent = 'Overgenomen'; ikUpdate(); }));
  ikEl('ikNeemAlles').addEventListener('click', (e) => {
    let n = 0;
    Object.keys(IK_DOELEN).forEach((d) => { if (ikNeem(d, true)) n += 1; });
    e.target.textContent = n ? `${n} velden ingevuld` : 'Alles was al ingevuld';
    ikUpdate();
  });
}

async function ikVraagAdvies() {
  const knop = ikEl('intakeAdviesKnop');
  const status = ikEl('ikAdviesStatus');
  if (!ikEl('intakeWebsite').value.trim() && !ikEl('intakeKlant').value.trim()) { status.textContent = 'Vul eerst de website of klantnaam in.'; return; }
  knop.disabled = true;
  knop.textContent = 'De AI onderzoekt...';
  status.textContent = 'Dit duurt ongeveer een minuut.';
  try {
    const r = await adminApi('/intake/advies', { method: 'POST', body: JSON.stringify({
      klant: ikEl('intakeKlant').value.trim(), website: ikEl('intakeWebsite').value.trim(), producten: ikProduct(),
      omschrijving: ikEl('intakeBusiness').value.trim(), extra: ikEl('intakeAdviesExtra').value.trim()
    }) });
    ikAdviesData = r.advies;
    ikTekenAdvies(r.advies);
    status.textContent = '';
    knop.textContent = 'Opnieuw advies vragen';
  } catch (err) {
    status.textContent = err.message;
    knop.textContent = 'Vraag advies';
  } finally {
    knop.disabled = false;
  }
}
ikEl('intakeAdviesKnop').addEventListener('click', ikVraagAdvies);
// Het advies hoort bij het gekozen product: bij een wisseling vragen we het opnieuw.
document.querySelectorAll('input[name="ikProduct"]').forEach((r) => r.addEventListener('change', () => {
  if (ikAdviesData) { ikAdviesData = null; ikEl('ikAdviesUit').classList.add('hidden'); ikEl('ikAdviesStatus').textContent = 'Het product is veranderd, vraag het advies opnieuw.'; }
}));


// ---- Merkprofiel opbouwen ----
let mpTimer = null;
let mpVorige = '';
let mpInline = null; // gevuld als het opbouwen in de onboarding staat (stap 4 of 103)

// Kleine variant van het opbouwen, direct in de onboarding bij de merkprofielstap.
function mpInlineHtml(c, website) {
  return `
          <div class="ad-stap-actie">
            <input type="hidden" id="mpKlant" value="${escapeHtmlAdmin(c.naam)}">
            <input type="text" id="mpWebsite" class="ad-uitkomst" value="${escapeHtmlAdmin(website || '')}" placeholder="Website, bijv. www.bedrijf.nl" aria-label="Website van de klant" autocomplete="off">
            <div class="ad-form-rij">
              <button type="button" id="mpStart" class="p-knop p-knop-hoofd">Merkprofiel opbouwen</button>
              <span id="mpStatus" class="mp-bouw-status"></span>
            </div>
          </div>`;
}

const MP_STATUSTEKST = {
  geen: 'Nog geen profiel gemaakt.',
  bezig: 'Bezig met opbouwen, dit duurt ongeveer 4 minuten.',
  'definitief concept': 'Klaar. Bekijk het profiel en zet Merkprofiel aan voor de klant.',
  bevestigd: 'Bevestigd door de klant.',
  leeg: 'De workflow gaf een leeg profiel. Controleer de website en probeer opnieuw.',
  mislukt: 'Het opbouwen is niet gelukt. Probeer opnieuw.'
};

function renderMerkprofielBouw(c, inhoud) {
  mpInline = null;
  mpVorige = '';
  inhoud.innerHTML = `
  <section class="p-kaart ad-blok">
    <header class="ad-blok-kop">
      <h2>Merkprofiel opbouwen</h2>
      <p>Leest de website van de klant en maakt een concept merkprofiel met de tien vaste kopjes. Dit duurt ongeveer 4 minuten. Het raakt het Kennisdocument niet. Daarna zet je Merkprofiel aan voor de klant, bij Instellingen.</p>
    </header>
    <div class="ad-form">
      <input type="hidden" id="mpKlant" value="${escapeHtmlAdmin(c.naam)}">
      <div><label for="mpWebsite">Website</label><input type="text" id="mpWebsite" placeholder="bijv. www.bedrijf.nl" autocomplete="off"></div>
      <div class="ad-form-rij">
        <button type="button" id="mpStart" class="p-knop p-knop-hoofd">Opbouwen</button>
        <span id="mpStatus" class="mp-bouw-status"></span>
      </div>
    </div>
  </section>`;
  ikEl('mpStart').addEventListener('click', () => mpStart(false));
  clearTimeout(mpTimer);
  mpToonStatus();
}

async function mpToonStatus() {
  if (!ikEl('mpKlant')) return;
  const klant = ikEl('mpKlant').value;
  if (!klant) return;
  try {
    const stand = await adminApi('/profiel/status?klant=' + encodeURIComponent(klant));
    if (!ikEl('mpStatus')) return;
    const vorige = mpVorige;
    mpVorige = stand.status;
    // Klaar of mislukt in de onboarding: de stap is op de server bijgewerkt, dus de lijst opnieuw tonen.
    if (mpInline && vorige === 'bezig' && stand.status !== 'bezig' && huidig && huidig.tab === 'onboarding') {
      clearTimeout(mpTimer);
      renderOnboarding(mpInline.c, mpInline.inhoud);
      return;
    }
    let tekst = MP_STATUSTEKST[stand.status] || '';
    if (stand.aangemaakt && stand.status !== 'geen' && stand.status !== 'bezig') tekst += ' (' + String(stand.aangemaakt).slice(0, 10) + ')';
    if (stand.status === 'mislukt' && stand.verslag) tekst += ' ' + stand.verslag;
    ikEl('mpStatus').textContent = tekst;
    ikEl('mpStart').disabled = stand.status === 'bezig';
    ikEl('mpStart').textContent = stand.status === 'geen' ? 'Opbouwen' : 'Opnieuw opbouwen';
    clearTimeout(mpTimer);
    if (stand.status === 'bezig') mpTimer = setTimeout(mpToonStatus, 15000);
  } catch (err) {
    if (ikEl('mpStatus')) ikEl('mpStatus').textContent = err.message;
  }
}

async function mpStart(force) {
  const klant = ikEl('mpKlant').value;
  const website = ikEl('mpWebsite').value.trim();
  if (!website) { ikEl('mpStatus').textContent = 'Vul eerst de website in.'; return; }
  ikEl('mpStart').disabled = true;
  try {
    await adminApi('/profiel/start', { method: 'POST', body: JSON.stringify({ klant, website, force }) });
    await mpToonStatus();
  } catch (err) {
    if (err.code === 'BEVESTIGING_NODIG' && window.confirm(err.message)) {
      await mpStart(true);
      return;
    }
    ikEl('mpStatus').textContent = err.message;
    ikEl('mpStart').disabled = false;
  }
}


function renderIntakeList(intakes) {
  const listEl = document.getElementById('intakeList');
  if (!intakes.length) {
    listEl.innerHTML = `<p class="admin-footnote">Nog geen intakes ingevuld.</p>`;
    return;
  }
  const veld = (label, waarde) => (waarde ? `<div class="ikl-veld"><span>${label}</span><p>${escapeHtmlAdmin(waarde)}</p></div>` : '');
  const productVan = (i) => (/Producten:\s*(Pagr\.|Beide)/.exec(i.notities || '') || [])[1] || 'Blogr.';
  listEl.innerHTML = '<div class="ikl-lijst">' + intakes
    .map((i) => {
      const datum = i.aangemaaktOp ? new Date(i.aangemaaktOp).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      const statusKlasse = i.status === 'Fout' ? 'ikl-fout' : (i.status === 'Afgerond' ? 'ikl-klaar' : 'ikl-bezig');
      return `
    <details class="ikl-rij" data-page-id="${i.id}">
      <summary>
        <span class="ikl-naam">${escapeHtmlAdmin(i.klant)}</span>
        <span class="ikl-product">${escapeHtmlAdmin(productVan(i))}</span>
        <span class="ikl-status ${statusKlasse}">${escapeHtmlAdmin(i.status || 'Nieuw')}</span>
        <span class="ikl-datum">${escapeHtmlAdmin(datum)}</span>
      </summary>
      <div class="ikl-body">
        ${i.foutreden ? `<div class="admin-error"><b>Foutreden</b> ${escapeHtmlAdmin(i.foutreden)}</div>` : ''}
        <div class="ikl-velden">
          ${veld('Client ID', i.clientId)}${veld('Website', i.website)}${veld('Tier', i.tier)}${veld('Blogs per maand', i.blogsPerMaand)}
          ${veld('Merknaam', i.merknaam)}${veld('WordPress', i.wordpressUrl)}${veld('Post type', i.wpPostType)}
          ${veld('GA4', [i.ga4PropertyId, i.leadEvent && 'lead: ' + i.leadEvent, i.boekingEvent && 'boeking: ' + i.boekingEvent].filter(Boolean).join(' / '))}
          ${veld('Notificatie e-mail', i.notificatieEmails)}${veld('Drive map', i.driveMapUrl)}
        </div>
        ${i.businessOmschrijving ? `<div class="ikl-veld ikl-breed"><span>Omschrijving</span><p>${escapeHtmlAdmin(i.businessOmschrijving)}</p></div>` : ''}
        ${i.onderwerpsrichtingen ? `<div class="ikl-veld ikl-breed"><span>Onderwerpsrichtingen</span><p>${escapeHtmlAdmin(i.onderwerpsrichtingen)}</p></div>` : ''}
        ${i.notities ? `<div class="ikl-veld ikl-breed"><span>Notities</span><p>${escapeHtmlAdmin(i.notities)}</p></div>` : ''}
        <label class="intake-status-label">Status
          <select class="intake-status-select" data-page-id="${i.id}">
            ${INTAKE_STATUS_OPTIONS.map((st) => `<option value="${st}" ${st === i.status ? 'selected' : ''}>${st}</option>`).join('')}
          </select>
        </label>
      </div>
    </details>`;
    })
    .join('') + '</div>';

  listEl.querySelectorAll('.intake-status-select').forEach((select) => {
    select.addEventListener('change', async () => {
      const pageId = select.dataset.pageId;
      select.disabled = true;
      try {
        await adminApi(`/intake/${encodeURIComponent(pageId)}/status`, {
          method: 'POST',
          body: JSON.stringify({ status: select.value })
        });
        renderIntakeError('');
      } catch (err) {
        renderIntakeError(err.message);
      } finally {
        select.disabled = false;
      }
    });
  });
}

async function loadIntakes() {
  try {
    const data = await adminApi('/intake');
    renderIntakeList(data.intakes);
  } catch (err) {
    renderIntakeError(err.message);
  }
}

(async function init() {
  try {
    const me = await adminApi('/me');
    if (me.isAdmin) {
      showAdminApp();
      await startAdmin();
    } else {
      showAdminLogin();
    }
  } catch (err) {
    showAdminLogin();
  }
})();
