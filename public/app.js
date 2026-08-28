let state = {
  clientId: null,
  reviewEnabled: false,
  statusValues: {},
  items: [],
  filter: 'alle',
  selectedId: null,
  searchQuery: '',
  activeTab: 'blogs'
};

// Tekst-specifieke opmerkingen bij het afwijzen van een blog (los van de
// hoofd-state omdat ze alleen tijdens het bewerken van één item bestaan).
let annotations = [];
let annotationIdCounter = 0;
let pendingRange = null;

// Een link als /basecamp-utrecht/<pagina-id> opent na het inloggen meteen
// die specifieke blog, zodat een e-mail rechtstreeks naar het portaal kan
// verwijzen in plaats van naar Notion.
let deepLinkItemId = null;

const badgeClass = (status) => 'badge-' + (status || '').toLowerCase().replace(/\s+/g, '-');

async function api(path, options) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Er ging iets mis.');
  return data;
}

async function init() {
  const clients = await api('/clients');
  const select = document.getElementById('clientSelect');
  select.innerHTML = clients.map((c) => `<option value="${c.id}">${c.naam}</option>`).join('');

  // Een link als /basecamp-utrecht selecteert die klant automatisch, zodat je
  // per klant een eigen inlogadres kunt versturen zonder los te hoeven kiezen.
  // Een tweede pad-onderdeel (/basecamp-utrecht/<pagina-id>) is een directe
  // link naar één specifieke blog, bijvoorbeeld vanuit een e-mailmelding.
  const pathParts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const slug = pathParts[0] || '';
  if (pathParts[1]) deepLinkItemId = pathParts[1];
  const preset = clients.find((c) => c.id === slug);
  if (preset) {
    select.value = preset.id;
    document.getElementById('clientSelectGroup').classList.add('hidden');
    const badge = document.getElementById('presetClientBadge');
    badge.textContent = preset.naam;
    badge.classList.remove('hidden');
    document.getElementById('passwordInput').focus();
  }

  const me = await api('/me');
  if (me.clientId) {
    await enterApp(me.clientId, clients.find((c) => c.id === me.clientId));
  }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const clientId = document.getElementById('clientSelect').value;
  const password = document.getElementById('passwordInput').value;
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';
  try {
    await api('/login', { method: 'POST', body: JSON.stringify({ clientId, password }) });
    const clients = await api('/clients');
    await enterApp(clientId, clients.find((c) => c.id === clientId));
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' });
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
});

async function enterApp(clientId, clientMeta) {
  state.clientId = clientId;
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('clientName').textContent = clientMeta ? clientMeta.naam : clientId;
  switchTab('blogs');
  await loadItems();
}

// Blogs = de contentplanning zelf (ideeën t/m gepubliceerd, incl. de
// contentstrategie erachter). Prestaties = losstaand, puur de meetbare
// resultaten van wat al live staat — bewust gescheiden zodat het ene niet
// het andere verdringt.
function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.getElementById('blogsTab').classList.toggle('hidden', tab !== 'blogs');
  document.getElementById('prestatiesTab').classList.toggle('hidden', tab !== 'prestaties');
  if (tab === 'prestaties') {
    loadPerformancePanel();
    renderPostPerformanceList();
  }
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

async function loadItems() {
  const data = await api(`/${state.clientId}/items`);
  state.reviewEnabled = data.reviewEnabled;
  state.performanceEnabled = Boolean(data.performanceEnabled);
  state.ideaEnrichmentEnabled = Boolean(data.ideaEnrichmentEnabled);
  state.statusValues = data.statusValues;
  state.items = data.items;
  const newIdeaBtn = document.getElementById('newIdeaBtn');
  if (newIdeaBtn) newIdeaBtn.classList.toggle('hidden', !state.ideaEnrichmentEnabled);
  const prestatiesTabBtn = document.getElementById('prestatiesTabBtn');
  if (prestatiesTabBtn) prestatiesTabBtn.classList.toggle('hidden', !state.performanceEnabled);
  if (!state.performanceEnabled && state.activeTab === 'prestaties') switchTab('blogs');
  if (!state.selectedId && state.items.length) {
    const deepLinked = deepLinkItemId && state.items.find((i) => i.id === deepLinkItemId);
    state.selectedId = deepLinked ? deepLinked.id : state.items[0].id;
    deepLinkItemId = null;
  }
  updateUrlForSelection();
  renderFilters();
  renderList();
  renderDetail();
  if (state.performanceEnabled) {
    loadPerformancePanel();
    renderPostPerformanceList();
  }
}

// Prestaties: totaalbeeld van alle content samen (Search Console + GA4),
// dagelijks bijgewerkt door n8n. Blijft verborgen zolang performanceEnabled
// uit staat voor deze klant (zie clients.js — bewust pas aanzetten zodra er
// genoeg data is).
async function loadPerformancePanel() {
  const panel = document.getElementById('performancePanel');
  if (!panel) return;
  if (!state.performanceEnabled) {
    panel.classList.add('hidden');
    return;
  }
  try {
    const data = await api(`/${state.clientId}/performance`);
    renderPerformancePanel(data.log);
  } catch (err) {
    panel.classList.add('hidden');
  }
}

function formatDatumKort(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

function buildTrendSvg(log) {
  const w = 640;
  const h = 160;
  const padL = 8;
  const padR = 8;
  const padT = 16;
  const padB = 8;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const values = log.map((d) => d.totaalPaginaweergaven);
  const max = Math.max(1, ...values);
  const x = (i) => padL + (log.length === 1 ? innerW / 2 : (i / (log.length - 1)) * innerW);
  const y = (v) => padT + innerH - (v / max) * innerH;

  const points = log.map((d, i) => [x(i), y(d.totaalPaginaweergaven)]);
  const linePath = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1][0]},${padT + innerH} L${points[0][0]},${padT + innerH} Z`;
  const dots = points
    .map(
      (p, i) =>
        `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="var(--accent)"><title>${formatDatumKort(log[i].datum)}: ${log[i].totaalPaginaweergaven} paginaweergaven</title></circle>`
    )
    .join('');

  return `
    <svg viewBox="0 0 ${w} ${h}" class="trend-chart" preserveAspectRatio="none" role="img" aria-label="Trend van totale paginaweergaven over tijd">
      <path d="${areaPath}" fill="var(--accent-soft)" stroke="none"></path>
      <path d="${linePath}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
      ${dots}
    </svg>
    <div class="trend-chart-labels">
      <span>${formatDatumKort(log[0].datum)}</span>
      <span>${formatDatumKort(log[log.length - 1].datum)}</span>
    </div>
  `;
}

function renderPerformancePanel(log) {
  const panel = document.getElementById('performancePanel');
  if (!panel) return;
  if (!log || !log.length) {
    panel.classList.add('hidden');
    return;
  }
  const latest = log[log.length - 1];
  const chartHtml =
    log.length >= 2
      ? buildTrendSvg(log)
      : `<div class="trend-chart-empty">Nog te weinig data voor een grafiek — kom over een paar dagen terug.</div>`;

  panel.innerHTML = `
    <div class="performance-header">
      <div class="performance-title">Prestaties — alle content samen</div>
      <div class="performance-sub">SEO-resultaten bouwen op. De meeste content laat na 2-3 maanden de eerste groei zien — vertoningen in Google komen meestal eerder dan clicks.</div>
    </div>
    <div class="performance-stats">
      <div class="stat-tile">
        <div class="stat-value">${latest.totaalPaginaweergaven}</div>
        <div class="stat-label">Paginaweergaven (30d)</div>
      </div>
      <div class="stat-tile">
        <div class="stat-value">${latest.totaalVertoningen}</div>
        <div class="stat-label">Vertoningen (30d)</div>
      </div>
      <div class="stat-tile">
        <div class="stat-value">${latest.totaalClicks}</div>
        <div class="stat-label">Clicks (30d)</div>
      </div>
      <div class="stat-tile stat-tile-activity">
        <div class="stat-value">${latest.blogsGepubliceerd}</div>
        <div class="stat-label">Blogs gepubliceerd</div>
      </div>
      <div class="stat-tile stat-tile-activity">
        <div class="stat-value">${latest.blogsPipeline}</div>
        <div class="stat-label">Blogs in de planning</div>
      </div>
    </div>
    <div class="trend-chart-wrap">${chartHtml}</div>
  `;
  panel.classList.remove('hidden');
}

// Per-blog cijfers op de Prestaties-tab. Bewust strenger dan "status =
// Gepubliceerd": een blog die vandaag net live is gegaan heeft die status al
// wel, maar zijn vertoningen/clicks pas na de eerstvolgende nachtelijke sync.
// Tot die tijd zou hij hier met een rij nullen staan, wat oogt als "doet het
// slecht" terwijl er simpelweg nog geen meting is geweest — dus pas tonen
// zodra er echt een cijfer binnen is (vertoningen niet null).
// Elke regel in topKeywords30d heeft de vorm "keyword — positie X, Y clicks,
// Z vertoningen" (zo geschreven door de dagelijkse n8n-sync). Splitst 'm in
// een keyword-naam en de bijbehorende cijfers voor een nette rij per zoekwoord.
function renderTopKeywords(raw) {
  if (!raw) return '';
  const lines = raw.split('\n').filter(Boolean);
  if (!lines.length) return '';
  const rows = lines
    .map((line) => {
      const [keyword, meta] = line.split(' — ');
      return `
      <div class="keyword-row">
        <span class="keyword-name">${keyword || line}</span>
        ${meta ? `<span class="keyword-meta">${meta}</span>` : ''}
      </div>`;
    })
    .join('');
  return `
    <div class="post-performance-keywords">
      <div class="keywords-label">Rankt op</div>
      ${rows}
    </div>`;
}

function renderPostPerformanceList() {
  const listEl = document.getElementById('postPerformanceList');
  if (!listEl) return;
  const published = state.items.filter(
    (i) => i.status === state.statusValues.published && i.impressions30d != null
  );
  if (!published.length) {
    listEl.innerHTML = `<div class="empty-state">Nog geen gepubliceerde blog met gemeten data.</div>`;
    return;
  }
  listEl.innerHTML = published
    .map(
      (item) => `
    <div class="post-performance">
      <div class="post-performance-title">${item.titel || '(geen titel)'}</div>
      <div class="post-performance-grid">
        <div class="post-performance-stat"><span class="stat-value-sm">${item.clicks30d ?? '—'}</span><span class="stat-label-sm">Clicks</span></div>
        <div class="post-performance-stat"><span class="stat-value-sm">${item.impressions30d ?? '—'}</span><span class="stat-label-sm">Vertoningen</span></div>
        <div class="post-performance-stat"><span class="stat-value-sm">${item.avgPosition30d != null ? Number(item.avgPosition30d).toFixed(1) : '—'}</span><span class="stat-label-sm">Gem. positie</span></div>
        <div class="post-performance-stat"><span class="stat-value-sm">${item.pageviews30d ?? '—'}</span><span class="stat-label-sm">Paginaweergaven</span></div>
      </div>
      ${renderTopKeywords(item.topKeywords30d)}
      ${item.liveUrl ? `<a href="${item.liveUrl}" target="_blank" rel="noopener" class="post-performance-link">Bekijk live →</a>` : ''}
    </div>
  `
    )
    .join('');
}

// Houdt de adresbalk in sync met de geopende blog, zodat je 'm ook los kunt
// kopiëren/delen, en zodat de vorige/volgende-knoppen van de browser werken.
function updateUrlForSelection() {
  if (!state.clientId || !state.selectedId) return;
  const url = '/' + encodeURIComponent(state.clientId) + '/' + encodeURIComponent(state.selectedId);
  if (location.pathname !== url) {
    history.pushState({ clientId: state.clientId, itemId: state.selectedId }, '', url);
  }
}

window.addEventListener('popstate', () => {
  if (!state.clientId || !state.items.length) return;
  const parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const itemId = parts[1];
  const match = itemId && state.items.find((i) => i.id === itemId);
  if (match) {
    state.selectedId = match.id;
    renderList();
    renderDetail();
  }
});

function renderFilters() {
  const statuses = ['alle', ...Object.values(state.statusValues)];
  const filtersEl = document.getElementById('filters');
  filtersEl.innerHTML = statuses
    .map((s) => `<div class="filter-chip ${state.filter === s ? 'active' : ''}" data-status="${s}">${s === 'alle' ? 'Alle' : s}</div>`)
    .join('');
  filtersEl.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.filter = chip.dataset.status;
      renderFilters();
      renderList();
    });
  });
}

function getFiltered() {
  let items = state.filter === 'alle' ? state.items : state.items.filter((i) => i.status === state.filter);
  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    items = items.filter(
      (i) => (i.titel || '').toLowerCase().includes(q) || (i.categorie || '').toLowerCase().includes(q)
    );
  }
  return items;
}

document.getElementById('searchInput')?.addEventListener('input', (e) => {
  state.searchQuery = e.target.value;
  renderList();
});

function renderList() {
  const listEl = document.getElementById('list');
  const filtered = getFiltered();
  document.getElementById('listTitle').textContent = `Blogs (${filtered.length})`;
  listEl.innerHTML =
    filtered
      .map(
        (item) => `
    <div class="card ${item.id === state.selectedId ? 'selected' : ''}" data-id="${item.id}">
      <div class="card-top">
        <p class="card-title">${item.titel || '(geen titel)'}</p>
        <span class="badge ${badgeClass(item.status)}">${item.status || '—'}</span>
      </div>
      <div class="card-meta">${item.categorie || ''} ${item.publicatiedatum ? '· ' + item.publicatiedatum : ''}</div>
    </div>
  `
      )
      .join('') || `<div class="empty-state">Geen blogs in deze status.</div>`;
  listEl.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => {
      state.selectedId = card.dataset.id;
      updateUrlForSelection();
      renderList();
      renderDetail();
    });
  });
}

async function renderDetail() {
  const detailEl = document.getElementById('detail');
  hideAnnotationPopover();
  annotations = [];
  annotationIdCounter = 0;
  if (!state.selectedId) {
    detailEl.innerHTML = `<div class="empty-state">Selecteer een blog links.</div>`;
    return;
  }
  detailEl.innerHTML = `<div class="empty-state">Laden…</div>`;
  let item;
  try {
    item = await api(`/${state.clientId}/items/${state.selectedId}`);
  } catch (err) {
    detailEl.innerHTML = `<div class="empty-state">${err.message}</div>`;
    return;
  }

  const isReviewStatus = item.status === state.statusValues.review;
  const feedbackBlock = item.opmerkingenKlant
    ? `<div class="feedback-box"><span class="seo-label" style="color:var(--accent);">Opmerkingen klant</span>${item.opmerkingenKlant}</div>`
    : '';

  // Contentstrategie: waarom dit onderwerp, op basis van welk keyword en
  // welke data. Los van de meetbare resultaten (die staan op de Prestaties-
  // tab) — dit blok laat zien hóe het onderwerp tot stand kwam, dus ook
  // relevant vóór publicatie (Idee/Gepland).
  const strategyRows = [
    item.mainKeyword ? `<div><span class="seo-label">Hoofdkeyword</span>${item.mainKeyword}</div>` : '',
    item.secundaireKeywords ? `<div><span class="seo-label">Secundaire keywords</span>${item.secundaireKeywords}</div>` : '',
    item.cluster || item.zoekintentie
      ? `<div><span class="seo-label">Cluster / zoekintentie</span>${[item.cluster, item.zoekintentie].filter(Boolean).join(' · ')}</div>`
      : '',
    item.strategieOnderbouwing ? `<div><span class="seo-label">Onderbouwing</span>${item.strategieOnderbouwing}</div>` : ''
  ].join('');
  const strategyBlock = strategyRows ? `<div class="seo-box strategy-box">${strategyRows}</div>` : '';

  let actionsBlock = '';
  if (!state.reviewEnabled) {
    actionsBlock = `<div class="no-review-note">Voor deze klant staat review uit — dit is een leesweergave.</div>`;
  } else if (isReviewStatus) {
    actionsBlock = `
      <div class="actions">
        <button class="btn btn-approve" id="approveBtn">Goedkeuren</button>
        <button class="btn btn-reject" id="rejectToggle">Afwijzen met feedback</button>
      </div>
      <div class="reject-box" id="rejectBox">
        <p class="reject-hint">Selecteer een stuk tekst hierboven en voeg er een gerichte opmerking aan toe. Algemene opmerkingen kun je hieronder kwijt.</p>
        <div class="annotation-list" id="annotationList"></div>
        <textarea id="rejectText" placeholder="Overige opmerkingen (optioneel)…"></textarea>
        <button class="btn btn-send" id="rejectSend">Feedback versturen</button>
      </div>
    `;
  }

  detailEl.innerHTML = `
    <div class="detail-header">
      <div>
        <h2 class="detail-title">${item.titel}</h2>
        <div class="detail-tags">
          <span class="tag">${item.categorie || ''}</span>
          ${item.publicatiedatum ? `<span class="tag">Publicatiedatum: ${item.publicatiedatum}</span>` : ''}
        </div>
      </div>
      <span class="badge ${badgeClass(item.status)}">${item.status}</span>
    </div>
    <div class="seo-box">
      <div><span class="seo-label">SEO titel</span>${item.seoTitle || '—'}</div>
      <div><span class="seo-label">Meta omschrijving</span>${item.seoDescription || '—'}</div>
      <div><span class="seo-label">CTA</span>${item.cta || '—'}</div>
    </div>
    ${feedbackBlock}
    ${strategyBlock}
    <div class="content-body">${item.contentHtml || '<p><em>Geen inhoud gevonden.</em></p>'}</div>
    ${actionsBlock}
  `;

  const approveBtn = document.getElementById('approveBtn');
  if (approveBtn) {
    approveBtn.addEventListener('click', async () => {
      approveBtn.disabled = true;
      try {
        await api(`/${state.clientId}/items/${item.id}/approve`, { method: 'POST' });
        await loadItems();
      } catch (err) {
        alert(err.message);
        approveBtn.disabled = false;
      }
    });
  }
  const rejectToggle = document.getElementById('rejectToggle');
  if (rejectToggle) {
    rejectToggle.addEventListener('click', () => {
      document.getElementById('rejectBox').classList.toggle('open');
    });
  }
  if (document.getElementById('annotationList')) renderAnnotationList();
  const rejectSend = document.getElementById('rejectSend');
  if (rejectSend) {
    rejectSend.addEventListener('click', async () => {
      const general = document.getElementById('rejectText').value.trim();
      const feedback = buildFeedbackText(general);
      if (!feedback) {
        alert('Voeg minstens één opmerking toe — selecteer tekst hierboven, of typ een algemene opmerking.');
        return;
      }
      rejectSend.disabled = true;
      try {
        await api(`/${state.clientId}/items/${item.id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ feedback })
        });
        await loadItems();
      } catch (err) {
        alert(err.message);
        rejectSend.disabled = false;
      }
    });
  }
}

function buildFeedbackText(general) {
  const parts = annotations.map((a) => `Over "${a.quote}": ${a.comment}`);
  if (general) parts.push(general);
  return parts.join('\n\n');
}

function truncateText(str, max) {
  return str.length > max ? str.slice(0, max).trim() + '…' : str;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderAnnotationList() {
  const el = document.getElementById('annotationList');
  if (!el) return;
  el.innerHTML = annotations
    .map(
      (a) => `
    <div class="annotation-item">
      <div>
        <p class="annotation-quote">${escapeHtml(truncateText(a.quote, 90))}</p>
        <p class="annotation-comment">${escapeHtml(a.comment)}</p>
      </div>
      <button type="button" class="annotation-remove" data-id="${a.id}" title="Verwijderen">×</button>
    </div>
  `
    )
    .join('');
  el.querySelectorAll('.annotation-remove').forEach((btn) => {
    btn.addEventListener('click', () => removeAnnotation(Number(btn.dataset.id)));
  });
}

function removeAnnotation(id) {
  const idx = annotations.findIndex((a) => a.id === id);
  if (idx === -1) return;
  annotations.splice(idx, 1);
  const mark = document.querySelector(`.review-mark[data-ann-id="${id}"]`);
  if (mark) {
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }
  renderAnnotationList();
}

function hideAnnotationPopover() {
  const popover = document.getElementById('annotationPopover');
  if (popover) popover.classList.add('hidden');
  pendingRange = null;
}

function showAnnotationPopover(range) {
  pendingRange = range;
  const popover = document.getElementById('annotationPopover');
  const textEl = document.getElementById('annotationPopoverText');
  textEl.value = '';
  const rect = range.getBoundingClientRect();
  const popW = 260;
  let left = rect.left;
  if (left + popW > window.innerWidth - 12) left = window.innerWidth - popW - 12;
  if (left < 12) left = 12;
  let top = rect.bottom + 8;
  if (top + 150 > window.innerHeight) top = Math.max(12, rect.top - 158);
  popover.style.left = left + 'px';
  popover.style.top = top + 'px';
  popover.classList.remove('hidden');
  textEl.focus();
}

function saveAnnotation() {
  if (!pendingRange) return;
  const comment = document.getElementById('annotationPopoverText').value.trim();
  if (!comment) return;
  const quote = pendingRange.toString().trim();
  const id = ++annotationIdCounter;
  try {
    const mark = document.createElement('mark');
    mark.className = 'review-mark';
    mark.dataset.annId = id;
    mark.title = comment;
    pendingRange.surroundContents(mark);
  } catch (err) {
    // Selectie liep over meerdere elementen heen — opmerking blijft geldig, alleen zonder highlight.
  }
  annotations.push({ id, quote, comment });
  renderAnnotationList();
  hideAnnotationPopover();
  window.getSelection().removeAllRanges();
}

// Eenmalig, globaal: tekstselectie binnen een geopende reject-box toont het
// opmerking-popovertje; klikken buiten het popovertje sluit het weer.
document.addEventListener('mouseup', (e) => {
  const rejectBox = document.getElementById('rejectBox');
  if (!rejectBox || !rejectBox.classList.contains('open')) return;
  const popover = document.getElementById('annotationPopover');
  if (popover.contains(e.target)) return;
  const contentBody = document.querySelector('.content-body');
  if (!contentBody || !contentBody.contains(e.target)) return;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (!contentBody.contains(range.commonAncestorContainer) || range.toString().trim() === '') return;
  showAnnotationPopover(range.cloneRange());
});

document.addEventListener('mousedown', (e) => {
  const popover = document.getElementById('annotationPopover');
  if (popover && !popover.classList.contains('hidden') && !popover.contains(e.target)) {
    hideAnnotationPopover();
  }
});

document.getElementById('annotationPopoverCancel')?.addEventListener('click', hideAnnotationPopover);
document.getElementById('annotationPopoverSave')?.addEventListener('click', saveAnnotation);

// "Idee aandragen": geeft de klant zelf een manier om een onderwerp aan te
// dragen. Komt gewoon als normaal "Idee" in de Notion-planning terecht, dus
// geen aparte flow nodig — het portaal toont het straks vanzelf zodra het
// verder de pijplijn ingaat.
function openIdeaModal() {
  const modal = document.getElementById('ideaModal');
  if (!modal) return;
  document.getElementById('ideaForm').reset();
  document.getElementById('ideaError').textContent = '';
  document.getElementById('ideaSuccess').classList.add('hidden');
  document.getElementById('ideaForm').classList.remove('hidden');
  modal.classList.remove('hidden');
  document.getElementById('ideaTitel').focus();
}

function closeIdeaModal() {
  document.getElementById('ideaModal')?.classList.add('hidden');
}

document.getElementById('newIdeaBtn')?.addEventListener('click', openIdeaModal);
document.getElementById('ideaCancelBtn')?.addEventListener('click', closeIdeaModal);
document.getElementById('ideaModal')?.addEventListener('mousedown', (e) => {
  if (e.target.id === 'ideaModal') closeIdeaModal();
});

document.getElementById('ideaForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const titel = document.getElementById('ideaTitel').value.trim();
  const hoofdkeyword = document.getElementById('ideaKeyword').value.trim();
  const toelichting = document.getElementById('ideaToelichting').value.trim();
  const errorEl = document.getElementById('ideaError');
  const submitBtn = document.getElementById('ideaSubmitBtn');
  errorEl.textContent = '';
  if (!titel) {
    errorEl.textContent = 'Vul een onderwerp of titel in.';
    return;
  }
  submitBtn.disabled = true;
  try {
    await api(`/${state.clientId}/ideas`, {
      method: 'POST',
      body: JSON.stringify({ titel, hoofdkeyword, toelichting })
    });
    document.getElementById('ideaForm').classList.add('hidden');
    document.getElementById('ideaSuccess').classList.remove('hidden');
    await loadItems();
    setTimeout(closeIdeaModal, 1400);
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
  }
});

init();
