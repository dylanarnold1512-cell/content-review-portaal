// LP Fabriek frontend — vanilla JS, zelfde patroon als admin.js. Alles praat
// met /api/lp/*, die achter requireLpInternal zit (los wachtwoord, zie
// besluiten.md "Portaal: een app, twee zones").
//
// Sinds bouwvolgorde-stap 3 (koerswijziging naar vrije templates) bestaan er
// twee sjabloonformaten naast elkaar: het OUDE blokken-formaat (bv. "Roots
// Event", blijft ongewijzigd werken) en het NIEUWE slot-formaat (bespoke
// HTML/CSS met genoemde slots). lpState.currentPageBlueprint / het geopende
// sjabloon zelf bepalen welk formaat van toepassing is; de UI schakelt daar
// stilzwijgend tussen (zie renderContentJson, openTemplateDetail).

let lpState = {
  clients: [],
  pages: [],
  currentPage: null,
  currentPageBlueprint: null,
  feitenById: new Map(),
  templates: [],
  currentTemplate: null,
  onderdelenOpties: [],
  imageSwapSlotKey: null,
  imageSwapSearch: { search: '', page: 1, totalPages: 1 },
  textEditPath: null
};

const ONDERDEEL_LABELS = {
  usps: "USP's",
  stappen: 'Stappenplan',
  aanbod: 'Aanbod/kaarten',
  praktisch: 'Praktische info',
  reviews: 'Reviews',
  faq: 'FAQ',
  doelgroep: 'Doelgroeptekst'
};

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

function emptySlotBlueprintSkeleton() {
  return {
    templateFormat: 'slots',
    htmlTemplate: '',
    cssTemplate: '',
    slots: [],
    invoerVelden: [],
    uniciteitsbudget: {},
    linkRegels: {},
    ctaRegel: {},
    seoRegels: {}
  };
}

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

function formatApiError(err) {
  if (err.data && Array.isArray(err.data.structuurFouten) && err.data.structuurFouten.length) {
    return `${err.message}: ${err.data.structuurFouten.join('; ')}`;
  }
  return err.message;
}

// Voorkomt dubbel indienen bij knoppen die iets aanmaken/opslaan: schakelt de
// knop meteen uit en toont een laadcirkeltje + eigen tekst, tot de actie klaar
// is (ook bij een fout). Zonder dit kon herhaald klikken tijdens een trage
// aanroep (bv. een Notion-aanroep die lang duurt) meerdere keren hetzelfde
// aanmaken.
function setBtnLoading(btn, isLoading, loadingLabel) {
  if (isLoading) {
    if (btn.dataset.lpOrigLabel === undefined) btn.dataset.lpOrigLabel = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spinner"></span>${loadingLabel || 'Bezig...'}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.lpOrigLabel !== undefined) {
      btn.innerHTML = btn.dataset.lpOrigLabel;
      delete btn.dataset.lpOrigLabel;
    }
  }
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
  document.getElementById('lpIntakeTab').classList.toggle('hidden', tab !== 'intake');
  document.getElementById('lpDetailSection').classList.add('hidden');
  document.getElementById('lpTemplateNewSection').classList.add('hidden');
  document.getElementById('lpTemplateDetailSection').classList.add('hidden');
  if (tab === 'sjablonen') loadTemplates();
  if (tab === 'intake') loadIntakes();
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

  try {
    const { opties } = await lpApi('/templates/onderdelen-opties');
    lpState.onderdelenOpties = opties;
    document.getElementById('lpTplOnderdelenChecklist').innerHTML = opties.map((key) => `
      <label><input type="checkbox" value="${key}" data-onderdeel="${key}"> ${ONDERDEEL_LABELS[key] || key}</label>
    `).join('');
  } catch (err) {
    // Niet blokkerend — het formulier werkt ook zonder deze checklist.
  }

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

  let blueprint = null;
  try {
    const res = await lpApi(`/clients/${page.klant}/blueprints/${page.blueprint}`);
    blueprint = res.blueprint;
  } catch (err) {
    // Wordt hieronder per subtab getoond als foutmelding waar relevant.
  }
  lpState.currentPageBlueprint = blueprint;

  const invoer = page.invoer || {};
  document.getElementById('lpInvoerOnderwerp').value = invoer._watGaatDezePaginaOver || '';
  document.getElementById('lpInvoerCtaOverride').value = invoer._ctaOverride || '';

  renderInvoerFields(page, blueprint);
  await renderFeitenList(page);
  renderContentJson(page, blueprint);
  document.getElementById('lpPreviewFrame').srcdoc = '';
  document.getElementById('lpValidationResult').innerHTML = '';
  document.getElementById('lpPublishResult').innerHTML = '';
  document.getElementById('lpGenerateContentStatus').textContent = '';
}

document.getElementById('lpStatusSelect').addEventListener('change', async (e) => {
  const page = lpState.currentPage;
  if (!page) return;
  await lpApi(`/pages/${page.id}/status`, { method: 'PUT', body: JSON.stringify({ status: e.target.value }) });
  document.getElementById('lpDetailStatusBadge').textContent = e.target.value;
  await loadPages();
});

document.getElementById('lpPageDeleteBtn').addEventListener('click', async () => {
  const page = lpState.currentPage;
  if (!page) return;
  const btn = document.getElementById('lpPageDeleteBtn');
  if (btn.disabled) return;
  const errorEl = document.getElementById('lpPageDeleteError');
  errorEl.classList.add('hidden');
  const wpMelding = page.wpPaginaId
    ? ' Dit verwijdert de pagina ook echt uit WordPress (naar de WordPress-prullenbak, dus daar nog terug te halen als het toch niet de bedoeling was).'
    : ' Deze pagina staat nog niet in WordPress, dus alleen de pagina hier in het portaal verdwijnt.';
  const zeker = confirm(`Weet je zeker dat je de pagina "${page.titel}" wilt verwijderen?${wpMelding}`);
  if (!zeker) return;
  setBtnLoading(btn, true, 'Bezig met verwijderen...');
  try {
    await lpApi(`/pages/${page.id}`, { method: 'DELETE' });
    document.getElementById('lpDetailSection').classList.add('hidden');
    document.getElementById('lpPaginasTab').classList.remove('hidden');
    lpState.currentPage = null;
    await loadPages();
  } catch (err) {
    errorEl.textContent = formatApiError(err);
    errorEl.classList.remove('hidden');
  } finally {
    setBtnLoading(btn, false);
  }
});

// -- Invoer --
function renderInvoerFields(page, blueprint) {
  const container = document.getElementById('lpInvoerFields');
  if (!blueprint) {
    container.innerHTML = '<p class="admin-error">Blueprint kon niet geladen worden.</p>';
    return;
  }
  const invoer = page.invoer || {};
  container.innerHTML = (blueprint.invoerVelden || []).map((veld) => `
    <div class="lp-field-row">
      <label for="lpInvoerVeld_${veld.key}">${veld.label}${veld.verplicht ? ' *' : ''}</label>
      <input type="text" id="lpInvoerVeld_${veld.key}" data-veld-key="${veld.key}" value="${(invoer[veld.key] || '').toString().replace(/"/g, '&quot;')}">
    </div>`).join('');
}

document.getElementById('lpSaveInvoerBtn').addEventListener('click', async () => {
  const page = lpState.currentPage;
  const invoer = {};
  document.querySelectorAll('#lpInvoerFields [data-veld-key]').forEach((input) => {
    invoer[input.dataset.veldKey] = input.value;
  });
  invoer._watGaatDezePaginaOver = document.getElementById('lpInvoerOnderwerp').value;
  invoer._ctaOverride = document.getElementById('lpInvoerCtaOverride').value;
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
function renderContentJson(page, blueprint) {
  const isSlot = Boolean(blueprint && blueprint.templateFormat === 'slots');
  const content = page.content || { meta: { metaTitle: '', metaDescription: '' } };
  document.getElementById('lpMetaTitle').value = content.meta?.metaTitle || '';
  document.getElementById('lpMetaDescription').value = content.meta?.metaDescription || '';
  document.getElementById('lpContentAiSection').classList.toggle('hidden', !isSlot);
  document.getElementById('lpContentBlockHelper').classList.toggle('hidden', isSlot);
  document.getElementById('lpInsertBlockBtn').classList.toggle('hidden', isSlot);
  document.getElementById('lpContentJsonLabel').textContent = isSlot ? 'Content JSON (slotData object)' : 'Content JSON (blocks array)';
  const value = isSlot ? (content.slotData || {}) : (content.blocks || []);
  document.getElementById('lpContentJson').value = JSON.stringify(value, null, 2);

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

document.getElementById('lpGenerateContentBtn').addEventListener('click', async () => {
  const page = lpState.currentPage;
  const btn = document.getElementById('lpGenerateContentBtn');
  const statusEl = document.getElementById('lpGenerateContentStatus');
  btn.disabled = true;
  statusEl.textContent = 'Bezig met genereren... (dit kan 10-30 seconden duren)';
  try {
    const watGaatDezePaginaOver = document.getElementById('lpInvoerOnderwerp').value;
    const ctaOverride = document.getElementById('lpInvoerCtaOverride').value;
    const { slotData, imageWarning, linkWarning } = await lpApi(`/pages/${page.id}/generate-content`, {
      method: 'POST',
      body: JSON.stringify({ watGaatDezePaginaOver, ctaOverride })
    });
    document.getElementById('lpContentJson').value = JSON.stringify(slotData, null, 2);
    // Het sjabloon definieert metaTitle/metaDescription als gewone slots (zo
    // kan de AI ze meteen goed genereren), maar opgeslagen/gevalideerd wordt
    // vanuit de aparte Meta title/Meta description velden hierboven. Zonder
    // deze twee regels bleven die velden leeg na genereren, en zag de
    // validator "Meta title ontbreekt" terwijl er wel degelijk een goede
    // titel was gegenereerd (hij stond alleen nog niet op de juiste plek).
    if (slotData.metaTitle) document.getElementById('lpMetaTitle').value = slotData.metaTitle;
    if (slotData.metaDescription) document.getElementById('lpMetaDescription').value = slotData.metaDescription;
    const waarschuwingen = [imageWarning, linkWarning].filter(Boolean).join(' ');
    statusEl.textContent = waarschuwingen
      ? `Voorstel gegenereerd — ${waarschuwingen} Controleer en klik daarna op "Content JSON opslaan".`
      : `Voorstel gegenereerd (tekst, meta, afbeeldingen en interne links) — controleer en pas aan waar nodig (klik in het voorbeeldscherm op een afbeelding om te wisselen), klik daarna op "Content JSON opslaan".`;
  } catch (err) {
    statusEl.textContent = '';
    alert(formatApiError(err));
  } finally {
    btn.disabled = false;
  }
});

async function saveContentJson({ silent } = {}) {
  const page = lpState.currentPage;
  const blueprint = lpState.currentPageBlueprint;
  const isSlot = Boolean(blueprint && blueprint.templateFormat === 'slots');
  const parsed = JSON.parse(document.getElementById('lpContentJson').value || (isSlot ? '{}' : '[]'));
  const content = {
    meta: {
      metaTitle: document.getElementById('lpMetaTitle').value,
      metaDescription: document.getElementById('lpMetaDescription').value
    },
    ...(isSlot ? { slotData: parsed } : { blocks: parsed })
  };
  await lpApi(`/pages/${page.id}/content`, { method: 'PUT', body: JSON.stringify({ content }) });
  lpState.currentPage.content = content;
  if (!silent) {
    const savedEl = document.getElementById('lpContentSaved');
    savedEl.textContent = 'Opgeslagen.';
    setTimeout(() => (savedEl.textContent = ''), 2000);
  }
}

document.getElementById('lpSaveContentBtn').addEventListener('click', async () => {
  try {
    await saveContentJson();
  } catch (err) {
    alert('Ongeldige JSON: ' + err.message);
  }
});

// -- Voorbeeld, validatie, publiceren --
async function refreshPreview() {
  const page = lpState.currentPage;
  if (!page) return;
  const { html } = await lpApi(`/pages/${page.id}/preview`);
  document.getElementById('lpPreviewFrame').srcdoc = html;
}

document.getElementById('lpPreviewBtn').addEventListener('click', refreshPreview);

// Elke keer dat de iframe opnieuw laadt (dus ook na refreshPreview hierboven), afbeeldingen met
// een data-lp-slot-attribuut klikbaar maken om ze te wisselen. srcdoc-iframes hebben hetzelfde
// origin als deze pagina, dus contentDocument is gewoon rechtstreeks bereikbaar.
document.getElementById('lpPreviewFrame').addEventListener('load', () => {
  const frame = document.getElementById('lpPreviewFrame');
  let doc;
  try {
    doc = frame.contentDocument;
  } catch (err) {
    return;
  }
  if (!doc) return;
  doc.querySelectorAll('[data-lp-slot]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      openImageSwap(el.getAttribute('data-lp-slot'));
    });
  });
  doc.querySelectorAll('[data-lp-text-slot]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      openTextEdit(el.getAttribute('data-lp-text-slot'));
    });
  });
});

// "Volledig scherm" gebruikt gewoon de native browser-fullscreen op de iframe zelf - geen eigen
// modal nodig, en Esc om terug te gaan werkt dan automatisch ook al.
document.getElementById('lpPreviewFullscreenBtn').addEventListener('click', () => {
  const frame = document.getElementById('lpPreviewFrame');
  if (frame.requestFullscreen) {
    frame.requestFullscreen();
  } else if (frame.webkitRequestFullscreen) {
    frame.webkitRequestFullscreen();
  }
});

function openImageSwap(slotKey) {
  const blueprint = lpState.currentPageBlueprint;
  const slotDef = ((blueprint && blueprint.slots) || []).find((s) => s.key === slotKey);
  lpState.imageSwapSlotKey = slotKey;
  lpState.imageSwapSearch = { search: '', page: 1, totalPages: 1 };
  document.getElementById('lpImageSwapTitle').textContent = `Afbeelding wijzigen: ${slotDef ? (slotDef.label || slotKey) : slotKey}`;
  document.getElementById('lpImageSwapSearch').value = '';
  document.getElementById('lpImageSwapUploadInput').value = '';
  document.getElementById('lpImageSwapError').classList.add('hidden');
  document.getElementById('lpImageSwapResults').innerHTML = '';
  document.getElementById('lpImageSwapResultsInfo').classList.add('hidden');
  document.getElementById('lpImageSwapLoadMoreBtn').classList.add('hidden');
  document.getElementById('lpImageSwapOverlay').classList.remove('hidden');
  runImageSwapSearch({ append: false });
}

document.getElementById('lpImageSwapClose').addEventListener('click', () => {
  document.getElementById('lpImageSwapOverlay').classList.add('hidden');
});
document.getElementById('lpImageSwapOverlay').addEventListener('click', (ev) => {
  if (ev.target.id === 'lpImageSwapOverlay') ev.currentTarget.classList.add('hidden');
});

async function runImageSwapSearch({ append }) {
  const page = lpState.currentPage;
  if (!page) return;
  const errorEl = document.getElementById('lpImageSwapError');
  errorEl.classList.add('hidden');
  const nextPage = append ? lpState.imageSwapSearch.page + 1 : 1;
  const search = document.getElementById('lpImageSwapSearch').value.trim();
  const btn = append ? document.getElementById('lpImageSwapLoadMoreBtn') : document.getElementById('lpImageSwapSearchBtn');
  setBtnLoading(btn, true, append ? 'Bezig met laden...' : 'Zoeken...');
  try {
    const qs = new URLSearchParams({ page: String(nextPage) });
    if (search) qs.set('search', search);
    const { media, page: huidigePagina, totalPages, total } = await lpApi(`/clients/${page.klant}/media?${qs.toString()}`);
    lpState.imageSwapSearch = { search, page: huidigePagina, totalPages, total };
    renderImageSwapResults(media, { append });
  } catch (err) {
    errorEl.textContent = formatApiError(err);
    errorEl.classList.remove('hidden');
  } finally {
    setBtnLoading(btn, false);
  }
}

function renderImageSwapResults(items, { append }) {
  const resultsEl = document.getElementById('lpImageSwapResults');
  const infoEl = document.getElementById('lpImageSwapResultsInfo');
  const loadMoreBtn = document.getElementById('lpImageSwapLoadMoreBtn');
  if (!append) resultsEl.innerHTML = '';
  if (!items.length && !append) {
    resultsEl.innerHTML = '<p class="admin-footnote">Niets gevonden.</p>';
  } else {
    items.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'lp-media-item';
      el.innerHTML = `
        <img src="${item.thumbnail}" alt="${item.alt || ''}" loading="lazy">
        <span>${item.titel || '(zonder titel)'}</span>`;
      el.addEventListener('click', () => applyImageSwap(item));
      resultsEl.appendChild(el);
    });
  }
  const { page, totalPages, total } = lpState.imageSwapSearch;
  loadMoreBtn.classList.toggle('hidden', !(page < totalPages));
  if (total) {
    infoEl.textContent = `Pagina ${page} van ${totalPages} (${total} afbeeldingen in totaal).`;
    infoEl.classList.remove('hidden');
  } else {
    infoEl.classList.add('hidden');
  }
}

document.getElementById('lpImageSwapSearchBtn').addEventListener('click', () => runImageSwapSearch({ append: false }));
document.getElementById('lpImageSwapLoadMoreBtn').addEventListener('click', () => runImageSwapSearch({ append: true }));

document.getElementById('lpImageSwapUploadBtn').addEventListener('click', async () => {
  const page = lpState.currentPage;
  if (!page) return;
  const input = document.getElementById('lpImageSwapUploadInput');
  const file = input.files && input.files[0];
  const errorEl = document.getElementById('lpImageSwapError');
  errorEl.classList.add('hidden');
  if (!file) {
    errorEl.textContent = 'Kies eerst een bestand om te uploaden.';
    errorEl.classList.remove('hidden');
    return;
  }
  const btn = document.getElementById('lpImageSwapUploadBtn');
  if (btn.disabled) return;
  setBtnLoading(btn, true, 'Bezig met uploaden...');
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Bestand lezen is mislukt.'));
      reader.readAsDataURL(file);
    });
    const dataBase64 = String(dataUrl).split(',')[1] || '';
    const { media: item } = await lpApi(`/clients/${page.klant}/media/upload`, {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, contentType: file.type, dataBase64 })
    });
    input.value = '';
    await applyImageSwap(item);
  } catch (err) {
    errorEl.textContent = formatApiError(err);
    errorEl.classList.remove('hidden');
  } finally {
    setBtnLoading(btn, false);
  }
});

async function applyImageSwap(item) {
  const slotKey = lpState.imageSwapSlotKey;
  if (!slotKey) return;
  const errorEl = document.getElementById('lpImageSwapError');
  errorEl.classList.add('hidden');
  const textarea = document.getElementById('lpContentJson');
  let slotData;
  try {
    slotData = JSON.parse(textarea.value || '{}');
  } catch (err) {
    errorEl.textContent = 'De huidige Content JSON is ongeldig, fix dat eerst op het Content JSON-tabblad: ' + err.message;
    errorEl.classList.remove('hidden');
    return;
  }
  slotData[slotKey] = item.url;
  const altKey = slotKey.replace(/ImageSrc$/, 'ImageAlt');
  if (altKey !== slotKey) {
    // Altijd een alt-tekst zetten bij het handmatig wisselen, ook als dit veld nog niet in de
    // content JSON stond (bv. omdat de AI 'm eerder afwees) - anders blijft de verplichte alt-slot
    // stil leeg staan, zelfde bug als eerder opgelost voor de automatische AI-keuze (zie
    // besluiten.md). Volgorde: eigen alt-tekst van de mediabibliotheek -> mediatitel -> het label
    // van de alt-slot zelf -> het label van de afbeelding-slot -> de sleutelnaam.
    const blueprint = lpState.currentPageBlueprint;
    const slots = (blueprint && blueprint.slots) || [];
    const altSlotDef = slots.find((s) => s.key === altKey);
    const srcSlotDef = slots.find((s) => s.key === slotKey);
    const fallbackLabel = (altSlotDef && altSlotDef.label) || (srcSlotDef && srcSlotDef.label) || altKey;
    slotData[altKey] = (item.alt && item.alt.trim()) || (item.titel && item.titel.trim()) || fallbackLabel;
  }
  textarea.value = JSON.stringify(slotData, null, 2);
  try {
    await saveContentJson({ silent: true });
    document.getElementById('lpImageSwapOverlay').classList.add('hidden');
    await refreshPreview();
  } catch (err) {
    errorEl.textContent = 'Opslaan is mislukt: ' + formatApiError(err);
    errorEl.classList.remove('hidden');
  }
}

// -- Tekst rechtstreeks in het voorbeeld aanpassen --
// Padnotatie: een los tekst-slot is gewoon de sleutel zelf (bv. "heroTitle"), een veld van een
// list-item is "lijstsleutel.INDEX.veld" (bv. "faqItems.1.answer") - zie tagTextSlotsForPreview in
// slotEngine.js voor waar deze paden vandaan komen.
function getSlotValue(slotData, path) {
  const listMatch = /^([\w.]+)\.(\d+)\.([\w.]+)$/.exec(path);
  if (listMatch) {
    const [, listKey, idx, field] = listMatch;
    const item = Array.isArray(slotData[listKey]) ? slotData[listKey][Number(idx)] : null;
    return item ? item[field] : '';
  }
  return slotData[path];
}

function setSlotValue(slotData, path, value) {
  const listMatch = /^([\w.]+)\.(\d+)\.([\w.]+)$/.exec(path);
  if (listMatch) {
    const [, listKey, idx, field] = listMatch;
    if (!Array.isArray(slotData[listKey])) slotData[listKey] = [];
    if (!slotData[listKey][Number(idx)] || typeof slotData[listKey][Number(idx)] !== 'object') {
      slotData[listKey][Number(idx)] = {};
    }
    slotData[listKey][Number(idx)][field] = value;
    return;
  }
  slotData[path] = value;
}

// Menselijk leesbaar label bij het pad, puur voor de titel/het label boven het tekstvakje.
function labelVoorTextEditPad(path) {
  const blueprint = lpState.currentPageBlueprint;
  const slots = (blueprint && blueprint.slots) || [];
  const listMatch = /^([\w.]+)\.(\d+)\.([\w.]+)$/.exec(path);
  if (listMatch) {
    const [, listKey, idx, field] = listMatch;
    const slotDef = slots.find((s) => s.key === listKey);
    return `${(slotDef && slotDef.label) || listKey} #${Number(idx) + 1} — ${field}`;
  }
  const slotDef = slots.find((s) => s.key === path);
  return (slotDef && slotDef.label) || path;
}

function openTextEdit(path) {
  const textarea = document.getElementById('lpContentJson');
  let slotData;
  try {
    slotData = JSON.parse(textarea.value || '{}');
  } catch (err) {
    alert('De huidige Content JSON is ongeldig, fix dat eerst op het Content JSON-tabblad: ' + err.message);
    return;
  }
  lpState.textEditPath = path;
  document.getElementById('lpTextEditTitle').textContent = `Tekst wijzigen: ${labelVoorTextEditPad(path)}`;
  document.getElementById('lpTextEditLabel').textContent = labelVoorTextEditPad(path);
  document.getElementById('lpTextEditInput').value = getSlotValue(slotData, path) || '';
  document.getElementById('lpTextEditError').classList.add('hidden');
  document.getElementById('lpTextEditOverlay').classList.remove('hidden');
}

document.getElementById('lpTextEditClose').addEventListener('click', () => {
  document.getElementById('lpTextEditOverlay').classList.add('hidden');
});
document.getElementById('lpTextEditOverlay').addEventListener('click', (ev) => {
  if (ev.target.id === 'lpTextEditOverlay') ev.currentTarget.classList.add('hidden');
});

document.getElementById('lpTextEditSaveBtn').addEventListener('click', async () => {
  const path = lpState.textEditPath;
  if (!path) return;
  const errorEl = document.getElementById('lpTextEditError');
  errorEl.classList.add('hidden');
  const textarea = document.getElementById('lpContentJson');
  let slotData;
  try {
    slotData = JSON.parse(textarea.value || '{}');
  } catch (err) {
    errorEl.textContent = 'De huidige Content JSON is ongeldig, fix dat eerst op het Content JSON-tabblad: ' + err.message;
    errorEl.classList.remove('hidden');
    return;
  }
  setSlotValue(slotData, path, document.getElementById('lpTextEditInput').value);
  textarea.value = JSON.stringify(slotData, null, 2);
  const btn = document.getElementById('lpTextEditSaveBtn');
  setBtnLoading(btn, true, 'Bezig met opslaan...');
  try {
    await saveContentJson({ silent: true });
    document.getElementById('lpTextEditOverlay').classList.add('hidden');
    await refreshPreview();
  } catch (err) {
    errorEl.textContent = 'Opslaan is mislukt: ' + formatApiError(err);
    errorEl.classList.remove('hidden');
  } finally {
    setBtnLoading(btn, false);
  }
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

// ---- Sjablonen (bouwstap 6) ----
document.getElementById('lpNewTemplateBtn').addEventListener('click', () => {
  document.getElementById('lpTplNewNaam').value = '';
  document.getElementById('lpTplNewKlant').value = '';
  document.getElementById('lpTplNewReferentieUrl').value = '';
  document.getElementById('lpTplNewPaginatype').value = '';
  document.querySelectorAll('#lpTplOnderdelenChecklist input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
  document.getElementById('lpTplNewVisueleRichting').value = '';
  document.getElementById('lpTplNewConversiedoel').value = '';
  document.getElementById('lpTplNewWens').value = '';
  document.getElementById('lpTplNewStatus').value = 'Concept';
  document.getElementById('lpTplNewBlueprintId').value = '';
  document.getElementById('lpTplNewBlueprintJson').value = JSON.stringify(emptySlotBlueprintSkeleton(), null, 2);
  document.getElementById('lpTplNewVoorbeeldJson').value = '{}';
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
  // Gearchiveerde sjablonen (bv. na opruimen van per ongeluk dubbel aangemaakte
  // sjablonen) blijven in Notion staan maar rommelen deze lijst niet meer op.
  const zichtbaar = lpState.templates.filter((t) => t.status !== 'Gearchiveerd');
  tbody.innerHTML = zichtbaar.map((t) => `
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

function collectVerplichteOnderdelen() {
  return Array.from(document.querySelectorAll('#lpTplOnderdelenChecklist input[type="checkbox"]:checked')).map((cb) => cb.value);
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
  const body = {
    klant,
    naam,
    referentieUrl: document.getElementById('lpTplNewReferentieUrl').value,
    paginatype: document.getElementById('lpTplNewPaginatype').value,
    verplichteOnderdelen: collectVerplichteOnderdelen(),
    visueleRichting: document.getElementById('lpTplNewVisueleRichting').value,
    conversiedoel: document.getElementById('lpTplNewConversiedoel').value,
    overigeWensen: document.getElementById('lpTplNewWens').value
  };
  btn.disabled = true;
  statusEl.textContent = 'Bezig met genereren... (dit kan 10-30 seconden duren)';
  try {
    const { blueprint, voorbeeldSlotData } = await lpApi('/templates/generate', { method: 'POST', body: JSON.stringify(body) });
    document.getElementById('lpTplNewBlueprintJson').value = JSON.stringify(blueprint, null, 2);
    document.getElementById('lpTplNewVoorbeeldJson').value = JSON.stringify(voorbeeldSlotData, null, 2);
    if (!document.getElementById('lpTplNewBlueprintId').value) {
      document.getElementById('lpTplNewBlueprintId').value = naam
        .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    statusEl.textContent = 'Voorstel gegenereerd — bekijk het voorbeeld en pas aan waar nodig.';
    await refreshTemplatePreview();
  } catch (err) {
    statusEl.textContent = '';
    errorEl.textContent = formatApiError(err);
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
});

function buildPreviewBody(klant, blueprint, sample) {
  if (blueprint && blueprint.templateFormat === 'slots') {
    return { klant, blueprint, slotData: sample && !Array.isArray(sample) ? sample : {} };
  }
  return { klant, blocks: Array.isArray(sample) ? sample : [] };
}

async function refreshTemplatePreview() {
  const klant = document.getElementById('lpTplNewKlant').value;
  const frame = document.getElementById('lpTplPreviewFrame');
  if (!klant) {
    frame.srcdoc = '<p style="font-family:sans-serif;padding:2rem;color:#666;">Vul eerst Klant in.</p>';
    return;
  }
  let blueprint;
  let sample;
  try {
    blueprint = JSON.parse(document.getElementById('lpTplNewBlueprintJson').value || '{}');
    sample = JSON.parse(document.getElementById('lpTplNewVoorbeeldJson').value || '{}');
  } catch (err) {
    frame.srcdoc = `<p style="font-family:sans-serif;padding:2rem;color:#b00020;">Ongeldige JSON: ${err.message}</p>`;
    return;
  }
  const { html } = await lpApi('/templates/preview', { method: 'POST', body: JSON.stringify(buildPreviewBody(klant, blueprint, sample)) });
  frame.srcdoc = html;
}

document.getElementById('lpTplPreviewBtn').addEventListener('click', refreshTemplatePreview);

document.getElementById('lpTplPreviewOpenBtn').addEventListener('click', async () => {
  const klant = document.getElementById('lpTplNewKlant').value;
  if (!klant) {
    alert('Vul eerst Klant in.');
    return;
  }
  let blueprint;
  let sample;
  try {
    blueprint = JSON.parse(document.getElementById('lpTplNewBlueprintJson').value || '{}');
    sample = JSON.parse(document.getElementById('lpTplNewVoorbeeldJson').value || '{}');
  } catch (err) {
    alert('Ongeldige JSON in Voorbeeldcontent: ' + err.message);
    return;
  }
  const { html } = await lpApi('/templates/preview', { method: 'POST', body: JSON.stringify(buildPreviewBody(klant, blueprint, sample)) });
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
  let huidigeVoorbeeldSlotData;
  try {
    huidigBlueprint = JSON.parse(document.getElementById('lpTplNewBlueprintJson').value || '{}');
    huidigeVoorbeeldSlotData = JSON.parse(document.getElementById('lpTplNewVoorbeeldJson').value || '{}');
  } catch (err) {
    errorEl.textContent = 'Ongeldige JSON in Blueprint JSON of Voorbeeldcontent: ' + err.message;
    errorEl.classList.remove('hidden');
    return;
  }
  btn.disabled = true;
  statusEl.textContent = 'Bezig met verwerken... (dit kan 10-30 seconden duren)';
  try {
    const { blueprint, voorbeeldSlotData } = await lpApi('/templates/refine', {
      method: 'POST',
      body: JSON.stringify({ klant, naam, huidigBlueprint, huidigeVoorbeeldSlotData, feedback })
    });
    document.getElementById('lpTplNewBlueprintJson').value = JSON.stringify(blueprint, null, 2);
    document.getElementById('lpTplNewVoorbeeldJson').value = JSON.stringify(voorbeeldSlotData, null, 2);
    statusEl.textContent = 'Voorstel aangepast — bekijk het voorbeeld hieronder.';
    document.getElementById('lpTplFeedback').value = '';
    await refreshTemplatePreview();
  } catch (err) {
    statusEl.textContent = '';
    errorEl.textContent = formatApiError(err);
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('lpTplCreateBtn').addEventListener('click', async () => {
  const btn = document.getElementById('lpTplCreateBtn');
  if (btn.disabled) return; // voorkomt dubbel aanmaken bij snel herhaald klikken
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
  const isSlot = blueprint.templateFormat === 'slots';
  const heeftInhoud = isSlot
    ? Boolean(blueprint.htmlTemplate && blueprint.htmlTemplate.trim())
    : Array.isArray(blueprint.verplichteBlokken) && blueprint.verplichteBlokken.length > 0;
  if (!heeftInhoud) {
    const doorgaan = confirm(
      'Deze Blueprint JSON lijkt nog het onaangepaste standaard-skelet (je hebt waarschijnlijk nog niet ' +
      'op "Stap 1: genereer voorstel met AI" geklikt, of het genereren is niet gelukt). Toch zo opslaan?'
    );
    if (!doorgaan) return;
  }
  setBtnLoading(btn, true, 'Bezig met opslaan...');
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
    errorEl.textContent = formatApiError(err);
    errorEl.classList.remove('hidden');
  } finally {
    setBtnLoading(btn, false);
  }
});

async function openTemplateDetail(templateId) {
  const { template } = await lpApi(`/templates/${templateId}`);
  lpState.currentTemplate = template;

  document.getElementById('lpSjablonenTab').classList.add('hidden');
  document.getElementById('lpTemplateDetailSection').classList.remove('hidden');

  const isSlot = Boolean(template.blueprint && template.blueprint.templateFormat === 'slots');
  document.getElementById('lpTplDetailAiSection').classList.toggle('hidden', !isSlot);
  document.getElementById('lpTplDetailLegacyNote').classList.toggle('hidden', isSlot);

  document.getElementById('lpTplDetailNaam').textContent = template.naam;
  document.getElementById('lpTplDetailStatusBadge').textContent = template.status;
  document.getElementById('lpTplStatusSelect').value = template.status;
  document.getElementById('lpTplDetailKlant').value = template.klant || '';
  document.getElementById('lpTplDetailBlueprintId').value = template.blueprintId || '';
  document.getElementById('lpTplDetailBlueprintJson').value = JSON.stringify(template.blueprint || {}, null, 2);
  document.getElementById('lpTplDetailVoorbeeldJson').value = isSlot ? '{}' : '[]';
  document.getElementById('lpTplDetailFeedback').value = '';
  document.getElementById('lpTplDetailRefineStatus').textContent = '';
  document.getElementById('lpTplDetailPreviewFrame').srcdoc = '';
  document.getElementById('lpTemplateDetailError').classList.add('hidden');
  document.getElementById('lpTplSaved').textContent = '';
  document.getElementById('lpTplDeleteError').classList.add('hidden');
}

async function refreshTemplateDetailPreview() {
  const klant = document.getElementById('lpTplDetailKlant').value;
  const frame = document.getElementById('lpTplDetailPreviewFrame');
  if (!klant) {
    frame.srcdoc = '<p style="font-family:sans-serif;padding:2rem;color:#666;">Geen klant bekend voor dit sjabloon.</p>';
    return;
  }
  let blueprint;
  let sample;
  try {
    blueprint = JSON.parse(document.getElementById('lpTplDetailBlueprintJson').value || '{}');
    sample = JSON.parse(document.getElementById('lpTplDetailVoorbeeldJson').value || '{}');
  } catch (err) {
    frame.srcdoc = `<p style="font-family:sans-serif;padding:2rem;color:#b00020;">Ongeldige JSON: ${err.message}</p>`;
    return;
  }
  const { html } = await lpApi('/templates/preview', { method: 'POST', body: JSON.stringify(buildPreviewBody(klant, blueprint, sample)) });
  frame.srcdoc = html;
}

document.getElementById('lpTplDetailPreviewBtn').addEventListener('click', refreshTemplateDetailPreview);

document.getElementById('lpTplDetailPreviewOpenBtn').addEventListener('click', async () => {
  const klant = document.getElementById('lpTplDetailKlant').value;
  if (!klant) {
    alert('Geen klant bekend voor dit sjabloon.');
    return;
  }
  let blueprint;
  let sample;
  try {
    blueprint = JSON.parse(document.getElementById('lpTplDetailBlueprintJson').value || '{}');
    sample = JSON.parse(document.getElementById('lpTplDetailVoorbeeldJson').value || '{}');
  } catch (err) {
    alert('Ongeldige JSON in Voorbeeldcontent: ' + err.message);
    return;
  }
  const { html } = await lpApi('/templates/preview', { method: 'POST', body: JSON.stringify(buildPreviewBody(klant, blueprint, sample)) });
  const blob = new Blob([html], { type: 'text/html' });
  window.open(URL.createObjectURL(blob), '_blank');
});

document.getElementById('lpTplDetailRefineBtn').addEventListener('click', async () => {
  const template = lpState.currentTemplate;
  if (!template) return;
  const btn = document.getElementById('lpTplDetailRefineBtn');
  const statusEl = document.getElementById('lpTplDetailRefineStatus');
  const errorEl = document.getElementById('lpTemplateDetailError');
  errorEl.classList.add('hidden');
  const feedback = document.getElementById('lpTplDetailFeedback').value;
  if (!feedback.trim()) {
    errorEl.textContent = 'Vul feedback in om het voorstel aan te passen.';
    errorEl.classList.remove('hidden');
    return;
  }
  let huidigBlueprint;
  let huidigeVoorbeeldSlotData;
  try {
    huidigBlueprint = JSON.parse(document.getElementById('lpTplDetailBlueprintJson').value || '{}');
    huidigeVoorbeeldSlotData = JSON.parse(document.getElementById('lpTplDetailVoorbeeldJson').value || '{}');
  } catch (err) {
    errorEl.textContent = 'Ongeldige JSON in Blueprint JSON of Voorbeeldcontent: ' + err.message;
    errorEl.classList.remove('hidden');
    return;
  }
  btn.disabled = true;
  statusEl.textContent = 'Bezig met verwerken... (dit kan 10-30 seconden duren)';
  try {
    const { blueprint, voorbeeldSlotData } = await lpApi('/templates/refine', {
      method: 'POST',
      body: JSON.stringify({
        klant: document.getElementById('lpTplDetailKlant').value,
        naam: template.naam,
        huidigBlueprint,
        huidigeVoorbeeldSlotData,
        feedback
      })
    });
    document.getElementById('lpTplDetailBlueprintJson').value = JSON.stringify(blueprint, null, 2);
    document.getElementById('lpTplDetailVoorbeeldJson').value = JSON.stringify(voorbeeldSlotData, null, 2);
    statusEl.textContent = 'Voorstel aangepast — bekijk het voorbeeld en klik op "Blueprint opslaan" als je het wilt bewaren.';
    document.getElementById('lpTplDetailFeedback').value = '';
    await refreshTemplateDetailPreview();
  } catch (err) {
    statusEl.textContent = '';
    errorEl.textContent = formatApiError(err);
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
});

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

document.getElementById('lpTplDeleteBtn').addEventListener('click', async () => {
  const template = lpState.currentTemplate;
  if (!template) return;
  const errorEl = document.getElementById('lpTplDeleteError');
  errorEl.classList.add('hidden');
  const zeker = confirm(
    `Sjabloon "${template.naam}" verwijderen? Dit kan niet ongedaan gemaakt worden vanuit het portaal ` +
    `(de pagina belandt in Notion's prullenbak). Weet je het zeker?`
  );
  if (!zeker) return;
  const btn = document.getElementById('lpTplDeleteBtn');
  btn.disabled = true;
  try {
    await lpApi(`/templates/${template.id}`, { method: 'DELETE' });
    document.getElementById('lpTemplateDetailSection').classList.add('hidden');
    document.getElementById('lpSjablonenTab').classList.remove('hidden');
    lpState.currentTemplate = null;
    await loadTemplates();
  } catch (err) {
    errorEl.textContent = formatApiError(err);
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
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
    const isSlot = Boolean(updated.blueprint && updated.blueprint.templateFormat === 'slots');
    document.getElementById('lpTplDetailAiSection').classList.toggle('hidden', !isSlot);
    document.getElementById('lpTplDetailLegacyNote').classList.toggle('hidden', isSlot);
    const savedEl = document.getElementById('lpTplSaved');
    savedEl.textContent = 'Opgeslagen.';
    setTimeout(() => (savedEl.textContent = ''), 2000);
  } catch (err) {
    errorEl.textContent = formatApiError(err);
    errorEl.classList.remove('hidden');
  }
});

// ---- Klant-intake (nieuwe klant toevoegen) ----
let lpIntakeFeitRowCount = 0;

function addIntakeFeitRow(prefill) {
  const container = document.getElementById('lpIntakeFeitenRows');
  const rowId = 'lpIntakeFeit' + (lpIntakeFeitRowCount++);
  const wrapper = document.createElement('div');
  wrapper.className = 'lp-columns';
  wrapper.dataset.feitRow = rowId;
  wrapper.style.marginBottom = '8px';
  wrapper.innerHTML = `
    <div class="lp-col"><input type="text" class="lp-feit-label" placeholder="Label (bv. Adres receptie)" value="${(prefill && prefill.label) || ''}"></div>
    <div class="lp-col"><input type="text" class="lp-feit-waarde" placeholder="Waarde" value="${(prefill && prefill.waarde) || ''}"></div>
    <div class="lp-col"><input type="text" class="lp-feit-bron" placeholder="Bron" value="${(prefill && prefill.bron) || ''}"></div>
    <button type="button" class="btn-plain lp-feit-remove">Verwijder</button>
  `;
  wrapper.querySelector('.lp-feit-remove').addEventListener('click', () => wrapper.remove());
  container.appendChild(wrapper);
}

document.getElementById('lpIntakeFeitAddBtn').addEventListener('click', () => addIntakeFeitRow());

function collectIntakeFeiten() {
  return Array.from(document.querySelectorAll('#lpIntakeFeitenRows [data-feit-row]'))
    .map((row) => ({
      label: row.querySelector('.lp-feit-label').value.trim(),
      waarde: row.querySelector('.lp-feit-waarde').value.trim(),
      bron: row.querySelector('.lp-feit-bron').value.trim()
    }))
    .filter((f) => f.label && f.waarde && f.bron);
}

const LP_TOKEN_FIELD_IDS = {
  primary: 'lpTokenPrimary', primaryDark: 'lpTokenPrimaryDark', secondary: 'lpTokenSecondary',
  text: 'lpTokenText', textMuted: 'lpTokenTextMuted', bg: 'lpTokenBg', bgAlt: 'lpTokenBgAlt',
  border: 'lpTokenBorder', maxWidth: 'lpTokenMaxWidth', radius: 'lpTokenRadius',
  fontHeading: 'lpTokenFontHeading', fontBody: 'lpTokenFontBody', ctaBg: 'lpTokenCtaBg', ctaText: 'lpTokenCtaText'
};

function fillTokenFields(tokensVoorstel) {
  Object.entries(LP_TOKEN_FIELD_IDS).forEach(([key, id]) => {
    document.getElementById(id).value = (tokensVoorstel && tokensVoorstel[key]) || '';
  });
}

function collectTokenFields() {
  const tokens = {};
  Object.entries(LP_TOKEN_FIELD_IDS).forEach(([key, id]) => {
    tokens[key] = document.getElementById(id).value.trim();
  });
  return tokens;
}

async function loadIntakes() {
  const errorEl = document.getElementById('lpIntakeError');
  errorEl.classList.add('hidden');
  try {
    const { intakes } = await lpApi('/intake');
    const tbody = document.getElementById('lpIntakesTableBody');
    tbody.innerHTML = intakes.map((i) => `
      <tr>
        <td>${i.klantnaam || ''}</td>
        <td>${i.klantId || ''}</td>
        <td><span class="lp-badge">${i.status || ''}</span></td>
        <td>${i.aangemaakt ? new Date(i.aangemaakt).toLocaleString('nl-NL') : ''}</td>
      </tr>`).join('') || '<tr><td colspan="4">Nog geen intakes.</td></tr>';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
}

document.getElementById('lpIntakeAnalyseerBtn').addEventListener('click', async () => {
  const btn = document.getElementById('lpIntakeAnalyseerBtn');
  const statusEl = document.getElementById('lpIntakeAnalyseerStatus');
  const errorEl = document.getElementById('lpIntakeError');
  errorEl.classList.add('hidden');
  const referentieUrl = document.getElementById('lpIntakeReferentieUrl').value;
  if (!referentieUrl.trim()) {
    errorEl.textContent = 'Vul eerst de website van de klant in.';
    errorEl.classList.remove('hidden');
    return;
  }
  btn.disabled = true;
  statusEl.textContent = 'Bezig met analyseren... (kan 10-30 seconden duren)';
  try {
    const { tokensVoorstel, samenvatting, twijfels } = await lpApi('/intake/analyseer-huisstijl', {
      method: 'POST',
      body: JSON.stringify({ referentieUrl })
    });
    fillTokenFields(tokensVoorstel);
    document.getElementById('lpIntakeSamenvatting').textContent = samenvatting || '';
    const twijfelsEl = document.getElementById('lpIntakeTwijfels');
    twijfelsEl.innerHTML = (twijfels || []).map((t) => `<li>${t}</li>`).join('');
    document.getElementById('lpIntakeVoorstelSection').classList.remove('hidden');
    statusEl.textContent = 'Voorstel klaar — controleer de kleuren en het lettertype hieronder.';
  } catch (err) {
    statusEl.textContent = '';
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('lpIntakeSubmitBtn').addEventListener('click', async () => {
  const btn = document.getElementById('lpIntakeSubmitBtn');
  const errorEl = document.getElementById('lpIntakeError');
  errorEl.classList.add('hidden');

  const klantnaam = document.getElementById('lpIntakeKlantnaam').value.trim();
  const klantId = document.getElementById('lpIntakeKlantId').value.trim().toLowerCase();
  if (!klantnaam || !klantId) {
    errorEl.textContent = 'Klantnaam en KlantId zijn verplicht.';
    errorEl.classList.remove('hidden');
    return;
  }
  if (!/^[a-z0-9-]+$/.test(klantId)) {
    errorEl.textContent = 'KlantId mag alleen kleine letters, cijfers en koppeltekens bevatten.';
    errorEl.classList.remove('hidden');
    return;
  }

  const intake = {
    klantnaam,
    taal: document.getElementById('lpIntakeTaal').value,
    wpEnvNamen: {
      urlEnv: document.getElementById('lpIntakeWpUrlEnv').value.trim(),
      usernameEnv: document.getElementById('lpIntakeWpUserEnv').value.trim(),
      appPasswordEnv: document.getElementById('lpIntakeWpPassEnv').value.trim()
    },
    nietToegestaan: document.getElementById('lpIntakeNietToegestaan').value.split('\n').map((r) => r.trim()).filter(Boolean),
    toonNotitie: document.getElementById('lpIntakeToonNotitie').value.trim(),
    referentieUrl: document.getElementById('lpIntakeReferentieUrl').value.trim(),
    huisstijlVoorstel: document.getElementById('lpIntakeVoorstelSection').classList.contains('hidden')
      ? null
      : {
          tokensVoorstel: collectTokenFields(),
          samenvatting: document.getElementById('lpIntakeSamenvatting').textContent
        },
    feiten: collectIntakeFeiten()
  };

  btn.disabled = true;
  try {
    await lpApi('/intake', { method: 'POST', body: JSON.stringify({ klantnaam, klantId, intake }) });
    alert('Intake verzonden. De automatische verwerking pakt hem binnen een uur op.');
    document.getElementById('lpIntakeKlantnaam').value = '';
    document.getElementById('lpIntakeKlantId').value = '';
    document.getElementById('lpIntakeToonNotitie').value = '';
    document.getElementById('lpIntakeNietToegestaan').value = '';
    document.getElementById('lpIntakeWpUrlEnv').value = '';
    document.getElementById('lpIntakeWpUserEnv').value = '';
    document.getElementById('lpIntakeWpPassEnv').value = '';
    document.getElementById('lpIntakeReferentieUrl').value = '';
    document.getElementById('lpIntakeFeitenRows').innerHTML = '';
    document.getElementById('lpIntakeVoorstelSection').classList.add('hidden');
    await loadIntakes();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
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
