let adminState = { clients: [] };

async function adminApi(path, options) {
  const res = await fetch('/api/admin' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Er ging iets mis.');
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

function renderTable() {
  const rows = adminState.clients.map((c) => `
    <div class="admin-row">
      <div class="admin-row-name">
        ${c.naam}
        ${c.inNotion ? '' : '<span class="admin-row-badge" title="Nog geen rij in de Notion-database — wordt automatisch aangemaakt bij de eerste wijziging.">nieuw</span>'}
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
    </div>
  `).join('');

  document.getElementById('adminTable').innerHTML = `
    <div class="admin-row admin-row-head">
      <div class="admin-row-name">Klant</div>
      <div class="admin-row-setting"><span class="admin-row-label">Review</span></div>
      <div class="admin-row-setting"><span class="admin-row-label">Prestaties</span></div>
      <div class="admin-row-setting"><span class="admin-row-label">Ideeën</span></div>
    </div>
    ${rows}
  `;

  document.querySelectorAll('#adminTable input[type="checkbox"][data-client]').forEach((input) => {
    input.addEventListener('change', async () => {
      const { client, field } = input.dataset;
      const value = input.checked;
      input.disabled = true;
      try {
        await adminApi(`/settings/${encodeURIComponent(client)}`, {
          method: 'POST',
          body: JSON.stringify({ field, value })
        });
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
  } catch (err) {
    renderError(err.message);
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
