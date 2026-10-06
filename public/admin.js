let adminState = { clients: [] };

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
    await loadSettings();
    await loadIdeaProposals();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
  await adminApi('/logout', { method: 'POST' });
  showAdminLogin();
});

function switchAdminTab(tab) {
  document.querySelectorAll('#adminTabNav .tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.adminTab === tab);
  });
  document.getElementById('instellingenTab').classList.toggle('hidden', tab !== 'instellingen');
  document.getElementById('intakeTab').classList.toggle('hidden', tab !== 'intake');
  if (tab === 'intake') loadIntakes();
}

document.querySelectorAll('#adminTabNav .tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchAdminTab(btn.dataset.adminTab));
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

// Uitleg bij de kolomkoppen, getoond als popup bij het erover heen gaan.
const HEADER_TIPS = [
  { label: 'Status', tip: 'Actief: alles werkt. Gepauzeerd of beëindigd: de klant kan niet meer inloggen op het portaal en ziet een melding. De workflows in n8n volgen deze status nog niet automatisch.' },
  { label: 'Review', tip: 'De klant ziet bij elke blog de knoppen Goedkeuren en Afwijzen. Uit: de klant kan de blogs alleen bekijken.' },
  { label: 'Prestaties', tip: 'Toont het tabblad Prestaties (Search Console en GA4). Zet aan zodra er ongeveer een maand data is, anders ziet de klant vooral nullen. Kan alleen als de prestatiekoppeling is ingesteld.' },
  { label: 'Ideeën', tip: 'De klant krijgt de knop Idee aandragen. Ideeën worden automatisch aangevuld en komen eerst bij jou ter goedkeuring.' },
  { label: 'Merkprofiel', tip: 'Toont het tabblad Merkprofiel. De klant ziet hoe wij het bedrijf hebben vastgesteld en kan feiten bevestigen, aanpassen of uitsluiten. Het tabblad verschijnt alleen als er een vastgesteld profiel is.' },
  { label: 'Naar blogs', tip: 'Reacties van de klant op het merkprofiel schrijven het Kennisdocument opnieuw, waar de blogs op schrijven. Let op: dit overschrijft het huidige Kennisdocument. Zet dit pas aan bij de overstap naar het profiel.' }
];

function renderTable() {
  const rows = adminState.clients.map((c) => `
  <div class="admin-row">
    <div class="admin-row-name">
      ${c.naam}
      ${c.inNotion ? '' : '<span class="admin-row-badge" title="Nog geen rij in de Notion-database — wordt automatisch aangemaakt bij de eerste wijziging.">nieuw</span>'}
    </div>
    <div class="admin-row-setting">
      <span class="admin-row-label">Status</span>
      <select class="admin-status admin-status-${c.klantstatus || 'actief'}" data-client="${c.id}" data-statusveld="klantstatus" aria-label="Klantstatus van ${c.naam}">
        ${['actief', 'gepauzeerd', 'beëindigd'].map((s) => `<option value="${s}"${(c.klantstatus || 'actief') === s ? ' selected' : ''}>${s}</option>`).join('')}
      </select>
    </div>
    <div class="admin-row-setting">
      <span class="admin-row-label">Review</span>
      ${toggleSwitch('review-' + c.id, c.id, 'reviewEnabled', c.reviewEnabled, false)}
    </div>
    <div class="admin-row-setting">
      <span class="admin-row-label">Prestaties</span>
      ${toggleSwitch(
        'perf-' + c.id,
        c.id,
        'performanceEnabled',
        c.performanceEnabled,
        !c.heeftPrestaties,
        'Geen prestatie-koppeling ingesteld voor deze klant'
      )}
    </div>
    <div class="admin-row-setting">
      <span class="admin-row-label">Ideeën</span>
      ${toggleSwitch('idea-' + c.id, c.id, 'ideaEnrichmentEnabled', c.ideaEnrichmentEnabled, false)}
    </div>
    <div class="admin-row-setting">
      <span class="admin-row-label">Merkprofiel</span>
      ${toggleSwitch('mp-' + c.id, c.id, 'merkprofiel', c.merkprofiel, false)}
    </div>
    <div class="admin-row-setting">
      <span class="admin-row-label">Naar blogs</span>
      ${toggleSwitch('mpk-' + c.id, c.id, 'merkprofielNaarKennisdocument', c.merkprofielNaarKennisdocument, false)}
    </div>
  </div>
  `).join('');

  document.getElementById('adminTable').innerHTML = `
  <div class="admin-row admin-row-head">
    <div class="admin-row-name">Klant</div>
    ${HEADER_TIPS.map((h, i) => `<div class="admin-row-setting"><span class="admin-row-label admin-tip${i >= 4 ? ' admin-tip-rechts' : ''}" tabindex="0" data-tip="${h.tip}">${h.label}</span></div>`).join('')}
  </div>
  ${rows}
  `;

  document.querySelectorAll('#adminTable select[data-statusveld]').forEach((select) => {
    select.addEventListener('change', async () => {
      const client = select.dataset.client;
      const entry = adminState.clients.find((c) => c.id === client) || {};
      const oud = entry.klantstatus || 'actief';
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
        select.className = `admin-status admin-status-${nieuw}`;
        renderError('');
      } catch (err) {
        select.value = oud;
        renderError(err.message);
      } finally {
        select.disabled = false;
      }
    });
  });

  document.querySelectorAll('#adminTable input[type="checkbox"][data-client]').forEach((input) => {
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

function escapeHtmlAdmin(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function renderIdeaProposals(byClient) {
  const container = document.getElementById('ideaProposals');
  const clientsWithFeature = adminState.clients.filter((c) => c.ideaEnrichmentEnabled);

  if (!clientsWithFeature.length) {
    container.innerHTML = `<p class="admin-footnote">Geen enkele klant heeft ideeën-verrijking aanstaan.</p>`;
    return;
  }

  const sections = clientsWithFeature.map((c) => {
    const proposals = byClient[c.id] || [];
    const cards = proposals.length
      ? proposals.map((p) => `
      <div class="proposal-card" data-page-id="${p.id}">
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
          ${p.opmerkingenKlant ? `<div><span class="seo-label">Toelichting klant</span>${escapeHtmlAdmin(p.opmerkingenKlant)}</div>` : ''}
        </div>
        <div class="proposal-actions">
          <button type="button" class="btn btn-approve proposal-approve">Goedkeuren</button>
          <button type="button" class="btn btn-reject proposal-reject">Afwijzen</button>
        </div>
      </div>
      `).join('')
      : `<p class="admin-footnote">Geen ideeën ter beoordeling voor ${escapeHtmlAdmin(c.naam)}.</p>`;

    return `
    <div class="proposal-client-block">
      <div class="proposal-client-name">${escapeHtmlAdmin(c.naam)}</div>
      <div class="proposal-list">${cards}</div>
    </div>
    `;
  }).join('');

  container.innerHTML = sections;

  container.querySelectorAll('.proposal-card').forEach((card) => {
    const pageId = card.dataset.pageId;
    const clientBlock = card.closest('.proposal-client-block');
    const clientName = clientBlock ? clientBlock.querySelector('.proposal-client-name').textContent : '';
    const client = adminState.clients.find((c) => c.naam === clientName);
    if (!client) return;

    const handleDecision = async (decision, btn) => {
      btn.disabled = true;
      try {
        await adminApi(`/${encodeURIComponent(client.id)}/idea-proposals/${encodeURIComponent(pageId)}/${decision}`, {
          method: 'POST'
        });
        card.remove();
      } catch (err) {
        renderError(err.message);
        btn.disabled = false;
      }
    };

    card.querySelector('.proposal-approve')?.addEventListener('click', (e) => handleDecision('approve', e.target));
    card.querySelector('.proposal-reject')?.addEventListener('click', (e) => handleDecision('reject', e.target));
  });
}

async function loadIdeaProposals() {
  const clientsWithFeature = adminState.clients.filter((c) => c.ideaEnrichmentEnabled);
  const byClient = {};
  try {
    await Promise.all(
      clientsWithFeature.map(async (c) => {
        const data = await adminApi(`/${encodeURIComponent(c.id)}/idea-proposals`);
        byClient[c.id] = data.proposals;
      })
    );
    renderIdeaProposals(byClient);
  } catch (err) {
    renderError(err.message);
  }
}

async function loadSettings() {
  try {
    const data = await adminApi('/settings');
    adminState.clients = data.clients;
    renderError('');
    renderTable();
    mpVulKlanten();
  } catch (err) {
    renderError(err.message);
  }
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

function mpVulKlanten() {
  const sel = ikEl('mpKlant');
  if (!sel || sel.options.length) return;
  sel.innerHTML = adminState.clients.map((c) => `<option value="${escapeHtmlAdmin(c.naam)}">${escapeHtmlAdmin(c.naam)}</option>`).join('');
  mpToonStatus();
}

async function mpToonStatus() {
  const klant = ikEl('mpKlant').value;
  if (!klant) return;
  try {
    const stand = await adminApi('/profiel/status?klant=' + encodeURIComponent(klant));
    let tekst = MP_STATUSTEKST[stand.status] || '';
    if (stand.aangemaakt && stand.status !== 'geen' && stand.status !== 'bezig') tekst += ' (' + String(stand.aangemaakt).slice(0, 10) + ')';
    if (stand.status === 'mislukt' && stand.verslag) tekst += ' ' + stand.verslag;
    ikEl('mpStatus').textContent = tekst;
    ikEl('mpStart').disabled = stand.status === 'bezig';
    ikEl('mpStart').textContent = stand.status === 'geen' ? 'Opbouwen' : 'Opnieuw opbouwen';
    clearTimeout(mpTimer);
    if (stand.status === 'bezig') mpTimer = setTimeout(mpToonStatus, 15000);
  } catch (err) {
    ikEl('mpStatus').textContent = err.message;
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

ikEl('mpStart').addEventListener('click', () => mpStart(false));
ikEl('mpKlant').addEventListener('change', mpToonStatus);

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
      await loadSettings();
      await loadIdeaProposals();
    } else {
      showAdminLogin();
    }
  } catch (err) {
    showAdminLogin();
  }
})();
