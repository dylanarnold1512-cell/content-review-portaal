let adminState = { clients: [], ideeen: {} };

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
  { id: 'instellingen', titel: 'Instellingen' },
  { id: 'ideeen', titel: 'Ideeën' },
  { id: 'merkprofiel', titel: 'Merkprofiel opbouwen' }
];
const VIEW_TITELS = { klanten: 'Alle klanten', nieuw: 'Nieuwe klant', ideeen: 'Ideeën', klant: 'Klant' };
let huidig = { view: 'klanten', klantId: '', tab: 'instellingen' };

function leesHash() {
  const delen = String(window.location.hash || '').replace(/^#/, '').split('/').map(decodeURIComponent);
  if (delen[0] === 'klant' && delen[1]) {
    const tab = KLANT_TABS.some((t) => t.id === delen[2]) ? delen[2] : 'instellingen';
    return { view: 'klant', klantId: delen[1], tab };
  }
  if (['klanten', 'nieuw', 'ideeen'].includes(delen[0])) return { view: delen[0], klantId: '', tab: 'instellingen' };
  return { view: 'klanten', klantId: '', tab: 'instellingen' };
}

function gaNaar(view, klantId, tab) {
  const hash = view === 'klant' ? `#klant/${encodeURIComponent(klantId)}/${tab || 'instellingen'}` : `#${view}`;
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
  btn.addEventListener('click', () => gaNaar(btn.dataset.view));
});

function toonScherm() {
  huidig = leesHash();
  sluitMenu();
  const { view, klantId, tab } = huidig;
  const klant = adminState.clients.find((c) => c.id === klantId);
  ['Klanten', 'Klant', 'Ideeen', 'Nieuw'].forEach((naam) => {
    document.getElementById('view' + naam).classList.toggle('hidden', naam.toLowerCase() !== (view === 'klant' ? 'klant' : view));
  });
  document.querySelectorAll('#adminNav [data-view]').forEach((btn) => {
    const actief = btn.dataset.view === view || (view === 'klant' && btn.dataset.view === 'klanten');
    btn.classList.toggle('active', actief);
    if (actief) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
  });
  document.getElementById('pMobielTab').textContent = view === 'klant' && klant ? klant.naam : VIEW_TITELS[view];
  if (view === 'klanten') renderKlanten();
  if (view === 'klant') renderKlant(klant, tab);
  if (view === 'ideeen') renderIdeeenScherm();
  if (view === 'nieuw') loadIntakes();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', toonScherm);

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
  const lijst = adminState.clients;
  const actief = lijst.filter((c) => c.klantstatusIngesteld !== false && (c.klantstatus || 'actief') === 'actief').length;
  const aandacht = lijst.filter((c) => c.klantstatusIngesteld === false || (c.klantstatus || 'actief') !== 'actief').length;
  const ideeen = Object.values(adminState.ideeen).reduce((n, l) => n + l.length, 0);
  const kaarten = lijst.map((c) => {
    const st = statusVanKlant(c);
    const aan = MODULES.filter((m) => m.kort && c[m.veld]);
    const wacht = wachtendeIdeeen(c.id);
    const open = wacht > 0
      ? `<div class="ad-open">${wacht} ${wacht === 1 ? 'idee wacht' : 'ideeën wachten'} op jou</div>`
      : (c.klantstatusIngesteld === false ? '<div class="ad-open">Kies een status, anders weten de workflows het niet</div>' : '<div class="ad-open ad-open-ok">Niets dat op jou wacht</div>');
    return `
    <button type="button" class="ad-klant" data-klant="${escapeHtmlAdmin(c.id)}">
      <div class="ad-klant-kop">
        <div class="p-klant-av" aria-hidden="true">${escapeHtmlAdmin(adminInitialen(c.naam))}</div>
        <div class="ad-klant-naam"><b>${escapeHtmlAdmin(c.naam)}</b><span>${escapeHtmlAdmin(c.id)}</span></div>
        <span class="p-pil ${st.klasse}">${st.tekst}</span>
      </div>
      <div class="ad-modules">${aan.length ? aan.map((m) => `<span class="p-pil p-pil-neutraal">${m.kort}</span>`).join('') : '<span class="ad-vaag">Nog geen modules aan voor de klant</span>'}</div>
      ${open}
    </button>`;
  }).join('');
  document.getElementById('viewKlanten').innerHTML = `
  <div class="p-pagina">
    <div class="p-ov-kop">
      <div><h1>Alle klanten</h1><p>Waar elke klant staat en wat er op jou wacht.</p></div>
      <div class="p-ov-kop-acties"><button type="button" class="p-knop p-knop-hoofd" data-nieuw>+ Nieuwe klant</button></div>
    </div>
    <div class="p-kerncijfers ad-kerncijfers">
      <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Klanten</div><div class="ad-getal">${lijst.length}</div></div>
      <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Actief</div><div class="ad-getal">${actief}</div></div>
      <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Aandacht nodig</div><div class="ad-getal">${aandacht}</div></div>
      <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Ideeën ter beoordeling</div><div class="ad-getal">${ideeen}</div></div>
    </div>
    <div class="ad-raster">${kaarten || '<p class="admin-footnote">Nog geen klanten.</p>'}</div>
    <p class="admin-footnote">Nieuwe klant nog niet in de lijst? Voeg 'm eerst toe in <code>src/config/clients.js</code>, dan verschijnt hij hier vanzelf.</p>
  </div>`;
  const root = document.getElementById('viewKlanten');
  root.querySelectorAll('[data-klant]').forEach((k) => k.addEventListener('click', () => gaNaar('klant', k.dataset.klant, 'instellingen')));
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
  const st = statusVanKlant(c);
  const tabs = KLANT_TABS.map((t) => {
    const teller = t.id === 'ideeen' && wachtendeIdeeen(c.id) ? `<span class="p-teller">${wachtendeIdeeen(c.id)}</span>` : '';
    return `<button type="button" class="ad-tab${t.id === tab ? ' active' : ''}" data-tab="${t.id}">${t.titel}${teller}</button>`;
  }).join('');
  root.innerHTML = `
  <div class="p-pagina">
    <div class="p-ov-kop">
      <div>
        <button type="button" class="p-link ad-terug" data-terug>&larr; Alle klanten</button>
        <h1>${escapeHtmlAdmin(c.naam)}</h1>
        <p><span class="p-pil ${st.klasse}">${st.tekst}</span></p>
      </div>
    </div>
    <div class="ad-tabs" role="tablist">${tabs}</div>
    <div id="klantTabInhoud"></div>
  </div>`;
  root.querySelector('[data-terug]').addEventListener('click', () => gaNaar('klanten'));
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => gaNaar('klant', c.id, b.dataset.tab)));
  const inhoud = document.getElementById('klantTabInhoud');
  if (tab === 'instellingen') renderInstellingen(c, inhoud);
  if (tab === 'ideeen') { inhoud.innerHTML = ideeenHtml([c], true); bindIdeeen(inhoud); }
  if (tab === 'merkprofiel') renderMerkprofielBouw(c, inhoud);
}

function renderInstellingen(c, inhoud) {
  const ingesteld = c.klantstatusIngesteld !== false;
  const statusTip = 'Actief: alles werkt. Gepauzeerd of beëindigd: de klant kan niet meer inloggen op het portaal en ziet een melding. De workflows in n8n volgen deze status.';
  const regels = MODULES.map((m) => `
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
  <section class="p-kaart ad-blok">
    <header class="ad-blok-kop"><h2>Wat de klant ziet</h2><p>Wijzigingen werken direct door, er is geen deploy nodig.</p></header>
    ${regels}
  </section>
  ${c.inNotion ? '' : '<p class="admin-footnote">Deze klant heeft nog geen rij in de Notion database Portaal Instellingen. Die wordt automatisch aangemaakt bij de eerste wijziging.</p>'}`;
  bindInstellingen(inhoud);
}

function bindInstellingen(root) {
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

function renderIdeeenScherm() {
  const el = document.getElementById('ideaProposals');
  el.innerHTML = ideeenHtml(adminState.clients, false);
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

async function startAdmin() {
  await loadSettings();
  await loadIdeaProposals();
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
    tier: document.getElementById('intakeTier').value,
    website: document.getElementById('intakeWebsite').value.trim(),
    businessOmschrijving: document.getElementById('intakeBusiness').value.trim(),
    toneOfVoice: document.getElementById('intakeTone').value.trim(),
    onderwerpsrichtingen: document.getElementById('intakeTopics').value.trim(),
    blogsPerMaand: document.getElementById('intakeBlogsPerMaand').value,
    driveMapUrl: document.getElementById('intakeDriveUrl').value.trim(),
    notificatieEmails: document.getElementById('intakeNotificatieEmails').value.trim(),
    wordpressVanToepassing: document.getElementById('intakeWordpress').checked,
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
    reviewEnabled: document.getElementById('intakeReview').checked,
    performanceEnabled: document.getElementById('intakePerformance').checked,
    ideaEnrichmentEnabled: document.getElementById('intakeIdea').checked,
    notities: document.getElementById('intakeNotes').value.trim()
  };
  try {
    await adminApi('/intake', { method: 'POST', body: JSON.stringify(payload) });
    let profielMelding = '';
    if (ikEl('intakeProfiel').checked && payload.website) {
      try {
        await adminApi('/profiel/start', { method: 'POST', body: JSON.stringify({ klant: payload.klant, website: payload.website, force: false }) });
        profielMelding = 'Intake opgeslagen. Het merkprofiel wordt opgebouwd (ongeveer 4 minuten).';
      } catch (err) {
        profielMelding = 'Intake opgeslagen, maar het merkprofiel kon niet starten: ' + err.message;
      }
    }
    if (profielMelding) window.alert(profielMelding);
    document.getElementById('intakeForm').reset();
    document.getElementById('intakeReview').checked = true;
    clientIdHandmatig = false;
    ikMelding('');
    ikUpdate();
    await loadIntakes();
  } catch (err) {
    renderIntakeError(err.message);
  }
});


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

function ikToonSecties() {
  document.querySelectorAll('[data-toon-bij]').forEach((blok) => {
    const schakel = ikEl(blok.dataset.toonBij);
    blok.classList.toggle('hidden', !(schakel && schakel.checked));
  });
}

function ikCheckItems() {
  const waarde = (id) => ikEl(id).value.trim();
  const items = [
    { tekst: 'Website', ok: !!waarde('intakeWebsite'), verplicht: true },
    { tekst: 'Klantnaam', ok: !!waarde('intakeKlant'), verplicht: true },
    { tekst: 'Client ID', ok: !!waarde('intakeClientId'), verplicht: true },
    { tekst: 'Omschrijving van de klant', ok: !!waarde('intakeBusiness'), verplicht: false },
    { tekst: 'Onderwerpsrichtingen', ok: !!waarde('intakeTopics'), verplicht: false }
  ];
  if (ikEl('intakeWordpress').checked) {
    items.push({ tekst: 'WordPress URL', ok: !!waarde('intakeWordpressUrl'), verplicht: true });
    items.push({ tekst: 'WordPress gebruikersnaam en application password', ok: !!waarde('intakeWpGebruikersnaam') && !!waarde('intakeWpAppPassword'), verplicht: true });
  }
  if (ikEl('intakePerformance').checked) {
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
ikEl('intakeForm').addEventListener('input', ikUpdate);
ikEl('intakeForm').addEventListener('change', ikUpdate);
ikUpdate();


// ---- Merkprofiel opbouwen ----
let mpTimer = null;

const MP_STATUSTEKST = {
  geen: 'Nog geen profiel gemaakt.',
  bezig: 'Bezig met opbouwen, dit duurt ongeveer 4 minuten.',
  'definitief concept': 'Klaar. Bekijk het profiel en zet Merkprofiel aan voor de klant.',
  bevestigd: 'Bevestigd door de klant.',
  leeg: 'De workflow gaf een leeg profiel. Controleer de website en probeer opnieuw.',
  mislukt: 'Het opbouwen is niet gelukt. Probeer opnieuw.'
};

function renderMerkprofielBouw(c, inhoud) {
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
  listEl.innerHTML = intakes
    .map(
      (i) => `
    <div class="proposal-card" data-page-id="${i.id}">
      <div class="proposal-header">
        <div class="proposal-title">${escapeHtmlAdmin(i.klant)}</div>
        <span class="tag">${escapeHtmlAdmin(i.tier || 'geen tier')}</span>
      </div>
      <div class="proposal-meta">
        ${i.clientId ? `<div><span class="seo-label">Client ID</span>${escapeHtmlAdmin(i.clientId)}</div>` : ''}
        ${i.website ? `<div><span class="seo-label">Website</span>${escapeHtmlAdmin(i.website)}</div>` : ''}
        ${i.businessOmschrijving ? `<div><span class="seo-label">Business</span>${escapeHtmlAdmin(i.businessOmschrijving)}</div>` : ''}
        ${i.onderwerpsrichtingen ? `<div><span class="seo-label">Onderwerpsrichtingen</span>${escapeHtmlAdmin(i.onderwerpsrichtingen)}</div>` : ''}
        ${i.blogsPerMaand ? `<div><span class="seo-label">Blogs per maand</span>${escapeHtmlAdmin(i.blogsPerMaand)}</div>` : ''}
        ${i.driveMapUrl ? `<div><span class="seo-label">Drive-map</span>${escapeHtmlAdmin(i.driveMapUrl)}</div>` : ''}
        ${i.notificatieEmails ? `<div><span class="seo-label">Notificatie e-mail</span>${escapeHtmlAdmin(i.notificatieEmails)}</div>` : ''}
        ${i.wordpressUrl ? `<div><span class="seo-label">WordPress URL</span>${escapeHtmlAdmin(i.wordpressUrl)}</div>` : ''}
        ${i.wpGebruikersnaam ? `<div><span class="seo-label">WP gebruikersnaam</span>${escapeHtmlAdmin(i.wpGebruikersnaam)}</div>` : ''}
        ${i.wpAppPassword ? `<div><span class="seo-label">WP app password</span>••••••••</div>` : ''}
        ${i.wpPostType ? `<div><span class="seo-label">WP post type</span>${escapeHtmlAdmin(i.wpPostType)}</div>` : ''}
        ${i.merknaam ? `<div><span class="seo-label">Merknaam</span>${escapeHtmlAdmin(i.merknaam)}</div>` : ''}
        ${i.portaalSlug ? `<div><span class="seo-label">Portaal slug</span>${escapeHtmlAdmin(i.portaalSlug)}</div>` : ''}
        ${i.ga4PropertyId ? `<div><span class="seo-label">GA4</span>${escapeHtmlAdmin(i.ga4PropertyId)}${i.leadEvent ? ' / lead: ' + escapeHtmlAdmin(i.leadEvent) : ''}${i.boekingEvent ? ' / boeking: ' + escapeHtmlAdmin(i.boekingEvent) : ''}</div>` : ''}
        ${i.foutreden ? `<div class="admin-error"><span class="seo-label">Foutreden</span>${escapeHtmlAdmin(i.foutreden)}</div>` : ''}
        ${i.notities ? `<div><span class="seo-label">Notities</span>${escapeHtmlAdmin(i.notities)}</div>` : ''}
      </div>
      <div class="proposal-actions">
        <label class="intake-status-label">Status
          <select class="intake-status-select" data-page-id="${i.id}">
            ${INTAKE_STATUS_OPTIONS.map((s) => `<option value="${s}" ${s === i.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </label>
      </div>
    </div>
    `
    )
    .join('');

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
