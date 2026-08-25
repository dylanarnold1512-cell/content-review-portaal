let state = {
  clientId: null,
  reviewEnabled: false,
  statusValues: {},
  items: [],
  filter: 'alle',
  selectedId: null
};

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
  const slug = decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, ''));
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
  if (!state.selectedId && state.items.length) state.selectedId = state.items[0].id;
  renderFilters();
  renderList();
  renderDetail();
}

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
      renderList();
      renderDetail();
    });
  });
}

async function renderDetail() {
  const detailEl = document.getElementById('detail');
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
        <textarea id="rejectText" placeholder="Wat moet er aangepast worden?"></textarea>
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
  const rejectSend = document.getElementById('rejectSend');
  if (rejectSend) {
    rejectSend.addEventListener('click', async () => {
      const feedback = document.getElementById('rejectText').value.trim();
      if (!feedback) return;
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

init();
