let state = {
  clientId: null,
  reviewEnabled: false,
  statusValues: {},
  items: [],
  filter: 'alle',
  selectedId: null
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
  await loadItems();
}

async function loadItems() {
  const data = await api(`/${state.clientId}/items`);
  state.reviewEnabled = data.reviewEnabled;
  state.statusValues = data.statusValues;
  state.items = data.items;
  if (!state.selectedId && state.items.length) {
    const deepLinked = deepLinkItemId && state.items.find((i) => i.id === deepLinkItemId);
    state.selectedId = deepLinked ? deepLinked.id : state.items[0].id;
    deepLinkItemId = null;
  }
  updateUrlForSelection();
  renderFilters();
  renderList();
  renderDetail();
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
  if (state.filter === 'alle') return state.items;
  return state.items.filter((i) => i.status === state.filter);
}

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

document.getElementById('annotationPopoverCancel').addEventListener('click', hideAnnotationPopover);
document.getElementById('annotationPopoverSave').addEventListener('click', saveAnnotation);

init();
