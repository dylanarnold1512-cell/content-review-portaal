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
    </div>
  `).join('');

  document.getElementById('adminTable').innerHTML = `
    <div class="admin-row admin-row-head">
      <div class="admin-row-name">Klant</div>
      <div class="admin-row-setting"><span class="admin-row-label">Review</span></div>
      <div class="admin-row-setting"><span class="admin-row-label">Prestaties</span></div>
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
      } catch (err) {
        input.checked = !value; // terugzetten bij een fout
        renderError(err.message);
      } finally {
        input.disabled = false;
      }
    });
  });
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
    } else {
      showAdminLogin();
    }
  } catch (err) {
    showAdminLogin();
  }
})();
