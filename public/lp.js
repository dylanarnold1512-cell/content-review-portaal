// LP Fabriek frontend — vanilla JS, zelfde patroon als admin.js. Alles praat
// met /api/lp/*, die achter requireLpInternal zit (los wachtwoord, zie
// besluiten.md "Portaal: een app, twee zones").

let lpState = { clients: [], pages: [], currentPage: null, feitenById: new Map(), templates: [], currentTemplate: null };

const BLOCK_TEMPLATES = {
  hero: { type: 'hero', data: { title: '', intro: '', cta: { label: '', href: '' } } },
  intro: { type: 'intro', data: { heading: '', text: '' } },
  tekstblok: { type: 'tekstblok', data: { heading: '', text: '' } },
  'usp-grid': { type: 'usp-grid', data: { heading: '', items: [{ title: '', text: '' }] } },
  'aanbod-grid': { type: 'aanbod-grid', data: { heading: '', items: [{ title: '', text: '', href: '' }] } },
  doelgroep: { type: 'doelgroep', data: { heading: '', text: '', items: [] } },
  stappen: { type: 'stappen', data: { heading: '', steps: [{ title: '', text: '' }] } },
  bewijs: { type: 'bewijs', data: { heading: '', items: [{ stat: '', label: '' }] } },
  reviews: { type: 'reviews', data: { heading: '', items: [{ quote: '', author: '', meta: '' }] } },
  praktisch: { type: 'praktisch', data: { heading: 'Praktische informatie', items: [{ label: '', value: '' }] } },
  links: { type: 'links', data: { heading: 'Lees ook', items: [{ label: '', href: '', reason: '', zusterpagina: false }] } },
  faq: { type: 'faq', data: { heading: 'Veelgestelde vragen', items: [{ question: '', answer: '' }] } },
  cta: { type: 'cta', data: { heading: '', text: '', cta: { label: '', href: '' } } }
};

async function lpApi(path, options) {
  const res = await fetch('/api/lp' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Er ging iets mis.');
    err.data = data;
    throw err;
  }
  return data;
}

function showLpApp() {
  document.getElementById('lpLoginScreen').classList.add('hidden');
  document.getElementById('lpApp').classList.remove('hidden');
}
function showLpLogin() {
  document.getElementById('lpApp').classList.add('hidden');
  document.getElementById('lpLoginScreen').classList.remove('hidden');
}

document.getElementById('lpLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('lpPasswordInput').value;
  const errorEl = document.getElementById('lpLoginError');
  errorEl.textContent = '';
  try {
    await lpApi('/login', { method: 'POST', body: JSON.stringify({ password }) });
    showLpApp();
    await bootLpApp();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('lpLogoutBtn').addEventListener('click', async () => {
  await lpApi('/logout', { method: 'POST' });
  showLpLogin();
});

// ---- Tab-navigatie (hoofdtabs) ----
function switchLpTab(tab) {
  document.querySelectorAll('#lpTabNav .tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lpTab === tab);
  });
  document.getElementById('lpPaginasTab').classList.toggle('hidden', tab !== 'paginas');
  document.getElementById('lpNieuwTab').classList.toggle('hidden', tab !== 'nieuw');
  document.getElementById('lpSjablonenTab').classList.toggle('hidden', tab !== 'sjablonen');
  document.getElementById('lpDetailSection').classList.add('hidden');
  document.getElementById('lpTemplateNewSection').classList.add('hidden');
  document.getElementById('lpTemplateDetailSection').classList.add('hidden');
  if (tab === 'sjablonen') loadTemplates();
}
document.querySelectorAll('#lpTabNav .tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchLpTab(btn.dataset.lpTab));
});
document.getElementById('lpBackBtn').addEventListener('click', () => {
  document.getElementById('lpDetailSection').classList.add('hidden');
  document.getElementById('lpPaginasTab').classList.remove('hidden');
});
document.getElementById('lpTemplateNewBackBtn').addEventListener('click', () => {
  document.getElementById('lpTemplateNewSection').classList.add('hidden');
  document.getElementById('lpSjablonenTab').classList.remove('hidden');
});
document.getElementById('lpTemplateBackBtn').addEventListener('click', () => {
  document.getElementById('lpTemplateDetailSection').classList.add('hidden');
  document.getElementById('lpSjablonenTab').classList.remove('hidden');
  loadTemplates();
});

// ---- Subtabs (detailscherm) ----
function switchLpSubtab(tab) {
  document.querySelectorAll('#lpSubtabs .lp-subtab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lpSubtab === tab);
  });
  ['invoer', 'feitensheet', 'content', 'publiceren'].forEach((t) => {
    document.getElementById('lpSub-' + t).classList.toggle('hidden', t !== tab);
  });
}
document.querySelectorAll('#lpSubtabs .lp-subtab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchLpSubtab(btn.dataset.lpSubtab));
});

// ---- Boot: klanten laden, dropdowns vullen, pagina's laden ----
async function bootLpApp() {
  const { clients } = await lpApi('/clients');
  lpState.clients = clients;

  const filterKlant = document.getElementById('lpFilterKlant');
  const newKlant = document.getElementById('lpNewKlant');
  filterKlant.innerHTML = '<option value="">Alle klanten</option>' +
    clients.map((c) => `<option value="${c.id}">${c.naam}</option>`).join('');
  newKlant.innerHTML = clients.map((c) => `<option value="${c.id}">${c.naam}</option>`).join('');

  const blockSelect = document.getElementById('lpBlockTemplateSelect');
  blockSelect.innerHTML = Object.keys(BLOCK_TEMPLATES).map((t) => `<option value="${t}">${t}</option>`).join('');

  fillBlueprintSelect(newKlant.value);
  newKlant.addEventListener('change', () => fillBlueprintSelect(newKlant.value));
  document.getElementById('lpNewBlueprint').addEventListener('change', loadNewFormInvoerFields);

  filterKlant.addEventListener('change', loadPages);
  await loadPages();
}

function fillBlueprintSelect(klantId) {
  const client = lpState.clients.find((c) => c.id === klantId);
  const select = document.getElementById('lpNewBlueprint');
  select.innerHTML = (client ? client.blueprints : []).map((b) => `<option value="${b.id}">${b.naam}</option>`).join('');
  loadNewFormInvoerFields();
}

async function loadNewFormInvoerFields() {
  const klantId = document.getElementById('lpNewKlant').value;
  const blueprintId = document.getElementById('lpNewBlueprint').value;
  const container = document.getElementById('lpNewInvoerFields');
  container.innerHTML = '';
  if (!klantId || !blueprintId) return;
  try {
    const { blueprint } = await lpApi(`/clients/${klantId}/blueprints/${blueprintId}`);
    container.innerHTML = (blueprint.invoerVelden || []).map((veld) => `
      <div class="lp-field-row">
        <label for="lpNewVeld_${veld.key}">${veld.label}${veld.verplicht ? ' *' : ''}</label>
        <input type="text" id="lpNewVeld_${veld.key}" data-veld-key="${veld.key}" ${veld.verplicht ? 'required' : ''}>
      </div>`).join('');
  } catch (err) {
    container.innerHTML = `<p class="admin-error">${err.message}</p>`;
  }
}

document.getElementById('lpNewForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('lpNewError');
  errorEl.classList.add('hidden');
  const klant = document.getElementById('lpNewKlant').value;
  const blueprint = document.getElementById('lpNewBlueprint').value;
  const titel = document.getElementById('lpNewTitel').value;
  const slug = document.getElementById('lpNewSlug').value;
  const invoer = {};
  document.querySelectorAll('#lpNewInvoerFields [data-veld-key]').forEach((input) => {
    invoer[input.dataset.veldKey] = input.value;
  });
  try {
    const { page } = await lpApi('/pages', {
      method: 'POST',
      body: JSON.stringify({ klant, blueprint, titel, slug, invoer })
    });
    document.getElementById('lpNewForm').reset();
    await loadPages();
    switchLpTab('paginas');
    openPageDetail(page.id);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});

// ---- Pagina-lijst ----
async function loadPages() {
  const errorEl = document.getElementById('lpListError');
  errorEl.classList.add('hidden');
  try {
    const klant = document.getElementById('lpFilterKlant').value;
    const { pages } = await lpApi('/pages' + (klant ? `?klant=${encodeURIComponent(klant)}` : ''));
    lpState.pages = pages;
    renderPagesTable();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
}

function renderPagesTable() {
  const tbody = document.getElementById('lpPagesTableBody');
  tbody.innerHTML = lpState.pages.map((p) => `
    <tr class="lp-row" data-page-id="${p.id}">
      <td>${p.titel || '(zonder titel)'}</td>
      <td>${p.klant || ''}</td>
      <td>${p.blueprint || ''}</td>
      <td><span class="lp-badge">${p.status || ''}</span></td>
      <td>${p.laatstGewijzigd ? new Date(p.laatstGewijzigd).toLocaleString('nl-NL') : ''}</td>
    </tr>`).join('') || '<tr><td colspan="5">Nog geen pagina\'s.</td></tr>';
  tbody.querySelectorAll('tr.lp-row').forEach((row) => {
    row.addEventListener('click', () => openPageDetail(row.dataset.pageId));
  });
}

// ---- Detailscherm ----
async function openPageDetail(pageId) {
  const { page } = await lpApi(`/pages/${pageId}`);
  lpState.currentPage = page;

  document.getElementById('lpPaginasTab').classList.add('hidden');
  document.getElementById('lpNieuwTab').classList.add('hidden');
  document.getElementById('lpDetailSection').classList.remove('hidden');

  document.getElementById('lpDetailTitel').textContent = page.titel;
  document.getElementById('lpDetailStatusBadge').textContent = page.status;
  document.getElementById('lpStatusSelect').value = page.status;
  switchLpSubtab('invoer');

  await renderInvoerFields(page);
  await renderFeitenList(page);
  renderContentJson(page);
  document.getElementById('lpPreviewFrame').srcdoc = '';
  document.getElementById('lpValidationResult').innerHTML = '';
  document.getElementById('lpPublishResult').innerHTML = '';
}

document.getElementById('lpStatusSelect').addEventListener('change', async (e) => {
  const page = lpState.currentPage;
  if (!page) return;
  await lpApi(`/pages/${page.id}/status`, { method: 'PUT', body: JSON.stringify({ status: e.target.value }) });
  document.getElementById('lpDetailStatusBadge').textContent = e.target.value;
  await loadPages();
});

// -- Invoer --
async function renderInvoerFields(page) {
  const container = document.getElementById('lpInvoerFields');
  container.innerHTML = 'Laden...';
  try {
    const { blueprint } = await lpApi(`/clients/${page.klant}/blueprints/${page.blueprint}`);
    const invoer = page.invoer || {};
    container.innerHTML = (blueprint.invoerVelden || []).map((veld) => `
      <div class="lp-field-row">
        <label for="lpInvoerVeld_${veld.key}">${veld.label}${veld.verplicht ? ' *' : ''}</label>
        <input type="text" id="lpInvoerVeld_${veld.key}" data-veld-key="${veld.key}" value="${(invoer[veld.key] || '').toString().replace(/"/g, '&quot;')}">
      </div>`).join('');
  } catch (err) {
    container.innerHTML = `<p class="admin-error">${err.message}</p>`;
  }
}

document.getElementById('lpSaveInvoerBtn').addEventListener('click', async () => {
  const page = lpState.currentPage;
  const invoer = {};
  document.querySelectorAll('#lpInvoerFields [data-veld-key]').forEach((input) => {
    invoer[input.dataset.veldKey] = input.value;
  });
  await lpApi(`/pages/${page.id}/invoer`, { method: 'PUT', body: JSON.stringify({ invoer }) });
  page.invoer = invoer;
  const savedEl = document.getElementById('lpInvoerSaved');
  savedEl.textContent = 'Opgeslagen.';
  setTimeout(() => (savedEl.textContent = ''), 2000);
});

// -- Feitensheet --
async function renderFeitenList(page) {
  const container = document.getElementById('lpFeitenList');
  container.innerHTML = 'Laden...';
  const extraListEl = document.getElementById('lpExtraFeitenList');
  const { feiten } = await lpApi(`/clients/${page.klant}/feiten`);
  lpState.feitenById = new Map(feiten.map((f) => [f.id, f]));
  const feitensheet = page.feitensheet || { gebruikt: [], extra: [] };
  const gebruiktSet = new Set(feitensheet.gebruikt || []);

  container.innerHTML = feiten.map((f) => `
    <label class="lp-feit-row">
      <input type="checkbox" data-feit-id="${f.id}" ${gebruiktSet.has(f.id) ? 'checked' : ''}>
      <span><strong>${f.label}:</strong> ${f.waarde}<br><span class="lp-feit-bron">Bron: ${f.bron}</span></span>
    </label>`).join('');

  lpState.extraFeiten = (feitensheet.extra || []).slice();
  renderExtraFeitenList();
}

function renderExtraFeitenList() {
  const el = document.getElementById('lpExtraFeitenList');
  el.innerHTML = (lpState.extraFeiten || []).map((f, i) => `
    <li>${f.label}: ${f.waarde} <span class="lp-feit-bron">(bron: ${f.bron})</span>
      <button type="button" class="btn-plain" data-remove-extra="${i}">verwijder</button>
    </li>`).join('');
  el.querySelectorAll('[data-remove-extra]').forEach((btn) => {
    btn.addEventListener('click', () => {
      lpState.extraFeiten.splice(Number(btn.dataset.removeExtra), 1);
      renderExtraFeitenList();
    });
  });
}

document.getElementById('lpAddExtraFeitBtn').addEventListener('click', () => {
  const label = document.getElementById('lpExtraFeitLabel').value.trim();
  const waarde = document.getElementById('lpExtraFeitWaarde').value.trim();
  const bron = document.getElementById('lpExtraFeitBron').value.trim();
  if (!label || !waarde || !bron) {
    alert('Label, waarde en bron zijn alle drie verplicht (bronprincipe).');
    return;
  }
  lpState.extraFeiten = lpState.extraFeiten || [];
  lpState.extraFeiten.push({ label, waarde, bron });
  document.getElementById('lpExtraFeitLabel').value = '';
  document.getElementById('lpExtraFeitWaarde').value = '';
  document.getElementById('lpExtraFeitBron').value = '';
  renderExtraFeitenList();
});

document.getElementById('lpSaveFeitensheetBtn').addEventListener('click', async () => {
  const page = lpState.currentPage;
  const gebruikt = Array.from(document.querySelectorAll('#lpFeitenList [data-feit-id]:checked')).map((i) => i.dataset.feitId);
  const feitensheet = { gebruikt, extra: lpState.extraFeiten || [] };
  const { page: updated } = await lpApi(`/pages/${page.id}/feitensheet`, { method: 'PUT', body: JSON.stringify({ feitensheet }) });
  lpState.currentPage.feitensheet = feitensheet;
  lpState.currentPage.status = updated.status;
  document.getElementById('lpDetailStatusBadge').textContent = updated.status;
  document.getElementById('lpStatusSelect').value = updated.status;
  const savedEl = document.getElementById('lpFeitensheetSaved');
  savedEl.textContent = 'Opgeslagen — status is gezet op "Content klaar".';
  setTimeout(() => (savedEl.textContent = ''), 4000);
  await loadPages();
});

// -- Content JSON --
function renderContentJson(page) {
  const content = page.content || { meta: { metaTitle: '', metaDescription: '' }, blocks: [] };
  document.getElementById('lpMetaTitle').value = content.meta?.metaTitle || '';
  document.getElementById('lpMetaDescription').value = content.meta?.metaDescription || '';
  document.getElementById('lpContentJson').value = JSON.stringify(content.blocks || [], null, 2);
}

document.getElementById('lpInsertBlockBtn').addEventListener('click', () => {
  const type = document.getElementById('lpBlockTemplateSelect').value;
  const textarea = document.getElementById('lpContentJson');
  let blocks;
  try {
    blocks = JSON.parse(textarea.value || '[]');
  } catch (err) {
    alert('De huidige JSON in het veld is ongeldig, fix dat eerst voordat je een blok toevoegt.');
    return;
  }
  blocks.push(JSON.parse(JSON.stringify(BLOCK_TEMPLATES[type])));
  textarea.value = JSON.stringify(blocks, null, 2);
});

document.getElementById('lpSaveContentBtn').addEventListener('click', async () => {
  const page = lpState.currentPage;
  let blocks;
  try {
    blocks = JSON.parse(document.getElementById('lpContentJson').value || '[]');
  } catch (err) {
    alert('Ongeldige JSON: ' + err.message);
    return;
  }
  const content = {
    meta: {
      metaTitle: document.getElementById('lpMetaTitle').value,
      metaDescription: document.getElementById('lpMetaDescription').value
    },
    blocks
  };
  await lpApi(`/pages/${page.id}/content`, { method: 'PUT', body: JSON.stringify({ content }) });
  lpState.currentPage.content = content;
  const savedEl = document.getElementById('lpContentSaved');
  savedEl.textContent = 'Opgeslagen.';
  setTimeout(() => (savedEl.textContent = ''), 2000);
});

// -- Voorbeeld, validatie, publiceren --
document.getElementById('lpPreviewBtn').addEventListener('click', async () => {
  const page = lpState.currentPage;
  const { html } = await lpApi(`/pages/${page.id}/preview`);
  document.getElementById('lpPreviewFrame').srcdoc = html;
});

function renderValidation(result) {
  const el = document.getElementById('lpValidationResult');
  const errors = result.errors || [];
  const warnings = result.warnings || [];
  el.innerHTML = `
    ${errors.length ? `<p><strong>Fouten (blokkeren publiceren):</strong></p><ul class="lp-msg-list errors">${errors.map((e) => `<li>${e}</li>`).join('')}</ul>` : '<p>Geen fouten.</p>'}
    ${warnings.length ? `<p><strong>Waarschuwingen:</strong></p><ul class="lp-msg-list warnings">${warnings.map((w) => `<li>${w}</li>`).join('')}</ul>` : ''}
  `;
}

document.getElementById('lpValidateBtn').addEventListener('click', async () => {
  const page = lpState.currentPage;
  const result = await lpApi(`/pages/${page.id}/validate`);
  renderValidation(result);
});

document.getElementById('lpPublishBtn').addEventListener('click', async () => {
  const page = lpState.currentPage;
  const resultEl = document.getElementById('lpPublishResult');
  resultEl.innerHTML = 'Bezig...';
  try {
    const { page: updated, validation } = await lpApi(`/pages/${page.id}/publish`, { method: 'POST' });
    renderValidation(validation);
    resultEl.innerHTML = `<p>Concept gezet in WordPress: <a href="${updated.wpUrl}" target="_blank" rel="noopener">${updated.wpUrl}</a><br>
      Status in Notion is gezet op "Ter review". Denk aan de handmatige SWP Builder-klik als dit een nieuwe pagina is (zie besluiten.md).</p>`;
    lpState.currentPage = updated;
    document.getElementById('lpDetailStatusBadge').textContent = updated.status;
    document.getElementById('lpStatusSelect').value = updated.status;
    await loadPages();
  } catch (err) {
    if (err.data && err.data.validation) renderValidation(err.data.validation);
    resultEl.innerHTML = `<p class="admin-error">${err.message}</p>`;
  }
});

// ---- Sjablonen (bouwstap 6). Stap 2 (lijst + handmatig aanmaken/bewerken)
// en stap 3 (AI-voorstel + live voorbeeld + finetunen) — zie besluiten.md.
document.getElementById('lpNewTemplateBtn').addEventListener('click', () => {
  document.getElementById('lpTplNewNaam').value = '';
  document.getElementById('lpTplNewKlant').value = '';
  document.getElementById('lpTplNewPaginatype').value = '';
  document.getElementById('lpTplNewWens').value = '';
  document.getElementById('lpTplNewStatus').value = 'Concept';
  document.getElementById('lpTplNewBlueprintId').value = '';
  document.getElementById('lpTplNewBlueprintJson').value = JSON.stringify({
    invoerVelden: [],
    verplichteBlokken: [],
    optioneleBlokken: [],
    uniciteitsbudget: {},
    linkRegels: {},
    ctaRegel: {},
    seoRegels: {}
  }, null, 2);
  document.getElementById('lpTplNewVoorbeeldJson').value = '[]';
  document.getElementById('lpTplFeedback').value = '';
  document.getElementById('lpTplPreviewFrame').srcdoc = '';
  document.getElementById('lpTplGenerateStatus').textContent = '';
  document.getElementById('lpTplRefineStatus').textContent = '';
  document.getElementById('lpTemplateNewError').classList.add('hidden');
  document.getElementById('lpSjablonenTab').classList.add('hidden');
  document.getElementById('lpTemplateNewSection').classList.remove('hidden');
});

async function loadTemplates() {
  const errorEl = document.getElementById('lpTemplatesError');
  errorEl.classList.add('hidden');
  try {
    const { templates } = await lpApi('/templates');
    lpState.templates = templates;
    renderTemplatesTable();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
}

function renderTemplatesTable() {
  const tbody = document.getElementById('lpTemplatesTableBody');
  tbody.innerHTML = lpState.templates.map((t) => `
    <tr class="lp-row" data-template-id="${t.id}">
      <td>${t.naam || '(zonder naam)'}</td>
      <td>${t.klant || ''}</td>
      <td>${t.blueprintId || ''}</td>
      <td><span class="lp-badge">${t.status || ''}</span></td>
      <td>${t.laatstGewijzigd ? new Date(t.laatstGewijzigd).toLocaleString('nl-NL') : ''}</td>
    </tr>`).join('') || '<tr><td colspan="5">Nog geen sjablonen.</td></tr>';
  tbody.querySelectorAll('tr.lp-row').forEach((row) => {
    row.addEventListener('click', () => openTemplateDetail(row.dataset.templateId));
  });
}

document.getElementById('lpTplGenerateBtn').addEventListener('click', async () => {
  const btn = document.getElementById('lpTplGenerateBtn');
  const statusEl = document.getElementById('lpTplGenerateStatus');
  const errorEl = document.getElementById('lpTemplateNewError');
  errorEl.classList.add('hidden');
  const naam = document.getElementById('lpTplNewNaam').value;
  const klant = document.getElementById('lpTplNewKlant').value;
  if (!naam || !klant) {
    errorEl.textContent = 'Vul eerst Naam en Klant in voordat je een voorstel laat genereren.';
    errorEl.classList.remove('hidden');
    return;
  }
  const paginatype = document.getElementById('lpTplNewPaginatype').value;
  const wens = document.getElementById('lpTplNewWens').value;
  btn.disabled = true;
  statusEl.textContent = 'Bezig met genereren... (dit kan 10-30 seconden duren)';
  try {
    const { blueprint, voorbeeldBlocks } = await lpApi('/templates/generate', {
      method: 'POST',
      body: JSON.stringify({ klant, naam, paginatype, wens })
    });
    document.getElementById('lpTplNewBlueprintJson').value = JSON.stringify(blueprint, null, 2);
    document.getElementById('lpTplNewVoorbeeldJson').value = JSON.stringify(voorbeeldBlocks, null, 2);
    if (!document.getElementById('lpTplNewBlueprintId').value) {
      document.getElementById('lpTplNewBlueprintId').value = naam
        .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    statusEl.textContent = 'Voorstel gegenereerd — bekijk het voorbeeld en pas aan waar nodig.';
    await refreshTemplatePreview();
  } catch (err) {
    statusEl.textContent = '';
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
});

async function refreshTemplatePreview() {
  const klant = document.getElementById('lpTplNewKlant').value;
  const frame = document.getElementById('lpTplPreviewFrame');
  if (!klant) {
    frame.srcdoc = '<p style="font-family:sans-serif;padding:2rem;color:#666;">Vul eerst Klant in.</p>';
    return;
  }
  let blocks;
  try {
    blocks = JSON.parse(document.getElementById('lpTplNewVoorbeeldJson').value || '[]');
  } catch (err) {
    frame.srcdoc = `<p style="font-family:sans-serif;padding:2rem;color:#b00020;">Ongeldige JSON: ${err.message}</p>`;
    return;
  }
  const { html } = await lpApi('/templates/preview', { method: 'POST', body: JSON.stringify({ klant, blocks }) });
  frame.srcdoc = html;
}

document.getElementById('lpTplPreviewBtn').addEventListener('click', refreshTemplatePreview);

document.getElementById('lpTplPreviewOpenBtn').addEventListener('click', async () => {
  const klant = document.getElementById('lpTplNewKlant').value;
  if (!klant) {
    alert('Vul eerst Klant in.');
    return;
  }
  let blocks;
  try {
    blocks = JSON.parse(document.getElementById('lpTplNewVoorbeeldJson').value || '[]');
  } catch (err) {
    alert('Ongeldige JSON in Voorbeeldcontent: ' + err.message);
    return;
  }
  const { html } = await lpApi('/templates/preview', { method: 'POST', body: JSON.stringify({ klant, blocks }) });
  const blob = new Blob([html], { type: 'text/html' });
  window.open(URL.createObjectURL(blob), '_blank');
});

document.getElementById('lpTplRefineBtn').addEventListener('click', async () => {
  const btn = document.getElementById('lpTplRefineBtn');
  const statusEl = document.getElementById('lpTplRefineStatus');
  const errorEl = document.getElementById('lpTemplateNewError');
  errorEl.classList.add('hidden');
  const naam = document.getElementById('lpTplNewNaam').value;
  const klant = document.getElementById('lpTplNewKlant').value;
  const feedback = document.getElementById('lpTplFeedback').value;
  if (!naam || !klant) {
    errorEl.textContent = 'Vul eerst Naam en Klant in.';
    errorEl.classList.remove('hidden');
    return;
  }
  if (!feedback.trim()) {
    errorEl.textContent = 'Vul feedback in om het voorstel aan te passen.';
    errorEl.classList.remove('hidden');
    return;
  }
  let huidigBlueprint;
  let huidigeVoorbeeldBlocks;
  try {
    huidigBlueprint = JSON.parse(document.getElementById('lpTplNewBlueprintJson').value || '{}');
    huidigeVoorbeeldBlocks = JSON.parse(document.getElementById('lpTplNewVoorbeeldJson').value || '[]');
  } catch (err) {
    errorEl.textContent = 'Ongeldige JSON in Blueprint JSON of Voorbeeldcontent: ' + err.message;
    errorEl.classList.remove('hidden');
    return;
  }
  btn.disabled = true;
  statusEl.textContent = 'Bezig met verwerken... (dit kan 10-30 seconden duren)';
  try {
    const { blueprint, voorbeeldBlocks } = await lpApi('/templates/refine', {
      method: 'POST',
      body: JSON.stringify({ klant, naam, huidigBlueprint, huidigeVoorbeeldBlocks, feedback })
    });
    document.getElementById('lpTplNewBlueprintJson').value = JSON.stringify(blueprint, null, 2);
    document.getElementById('lpTplNewVoorbeeldJson').value = JSON.stringify(voorbeeldBlocks, null, 2);
    statusEl.textContent = 'Voorstel aangepast — bekijk het voorbeeld hieronder.';
    document.getElementById('lpTplFeedback').value = '';
    await refreshTemplatePreview();
  } catch (err) {
    statusEl.textContent = '';
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('lpTplCreateBtn').addEventListener('click', async () => {
  const errorEl = document.getElementById('lpTemplateNewError');
  errorEl.classList.add('hidden');
  const naam = document.getElementById('lpTplNewNaam').value;
  const klant = document.getElementById('lpTplNewKlant').value;
  const blueprintId = document.getElementById('lpTplNewBlueprintId').value;
  const status = document.getElementById('lpTplNewStatus').value;
  if (!naam || !klant || !blueprintId) {
    errorEl.textContent = 'Naam, Klant en BlueprintId zijn verplicht.';
    errorEl.classList.remove('hidden');
    return;
  }
  let blueprint;
  try {
    blueprint = JSON.parse(document.getElementById('lpTplNewBlueprintJson').value || '{}');
  } catch (err) {
    errorEl.textContent = 'Ongeldige JSON in de Blueprint JSON: ' + err.message;
    errorEl.classList.remove('hidden');
    return;
  }
  const heeftBlokken = Array.isArray(blueprint.verplichteBlokken) && blueprint.verplichteBlokken.length > 0;
  if (!heeftBlokken) {
    const doorgaan = confirm(
      'Deze Blueprint JSON heeft nog geen verplichteBlokken — dit lijkt het onaangepaste standaard-skelet ' +
      '(je hebt waarschijnlijk nog niet op "Stap 1: genereer voorstel met AI" geklikt, of het genereren ' +
      'is niet gelukt). Toch zo opslaan?'
    );
    if (!doorgaan) return;
  }
  try {
    const { template } = await lpApi('/templates', {
      method: 'POST',
      body: JSON.stringify({ naam, klant, blueprintId, status, blueprint })
    });
    document.getElementById('lpTemplateNewSection').classList.add('hidden');
    document.getElementById('lpSjablonenTab').classList.remove('hidden');
    await loadTemplates();
    openTemplateDetail(template.id);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});

async function openTemplateDetail(templateId) {
  const { template } = await lpApi(`/templates/${templateId}`);
  lpState.currentTemplate = template;

  document.getElementById('lpSjablonenTab').classList.add('hidden');
  document.getElementById('lpTemplateDetailSection').classList.remove('hidden');

  document.getElementById('lpTplDetailNaam').textContent = template.naam;
  document.getElementById('lpTplDetailStatusBadge').textContent = template.status;
  document.getElementById('lpTplStatusSelect').value = template.status;
  document.getElementById('lpTplDetailKlant').value = template.klant || '';
  document.getElementById('lpTplDetailBlueprintId').value = template.blueprintId || '';
  document.getElementById('lpTplDetailBlueprintJson').value = JSON.stringify(template.blueprint || {}, null, 2);
  document.getElementById('lpTemplateDetailError').classList.add('hidden');
  document.getElementById('lpTplSaved').textContent = '';
}

document.getElementById('lpTplStatusSelect').addEventListener('change', async (e) => {
  const template = lpState.currentTemplate;
  if (!template) return;
  const { template: updated } = await lpApi(`/templates/${template.id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status: e.target.value })
  });
  lpState.currentTemplate = updated;
  document.getElementById('lpTplDetailStatusBadge').textContent = updated.status;
});

document.getElementById('lpTplSaveBlueprintBtn').addEventListener('click', async () => {
  const template = lpState.currentTemplate;
  if (!template) return;
  const errorEl = document.getElementById('lpTemplateDetailError');
  errorEl.classList.add('hidden');
  let blueprint;
  try {
    blueprint = JSON.parse(document.getElementById('lpTplDetailBlueprintJson').value || '{}');
  } catch (err) {
    errorEl.textContent = 'Ongeldige JSON: ' + err.message;
    errorEl.classList.remove('hidden');
    return;
  }
  try {
    const { template: updated } = await lpApi(`/templates/${template.id}/blueprint`, {
      method: 'PUT',
      body: JSON.stringify({ blueprint })
    });
    lpState.currentTemplate = updated;
    const savedEl = document.getElementById('lpTplSaved');
    savedEl.textContent = 'Opgeslagen.';
    setTimeout(() => (savedEl.textContent = ''), 2000);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});

// ---- Init ----
(async function init() {
  try {
    const { isLpInternal } = await lpApi('/me');
    if (isLpInternal) {
      showLpApp();
      await bootLpApp();
    } else {
      showLpLogin();
    }
  } catch (err) {
    showLpLogin();
  }
})();
