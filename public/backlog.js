// Ontwikkeling > Backlog: de punten uit de Notion database "Backlog" voor Blogr. en Pagr.
// Gebruikt adminApi en escapeHtmlAdmin uit admin.js. Het filteren staat in een apart model zodat het te testen is.
(function () {
  const FILTERS = [
    ['status', 'Status'],
    ['prioriteit', 'Prioriteit'],
    ['type', 'Type'],
    ['onderdeel', 'Onderdeel'],
    ['klant', 'Klant']
  ];

  // Filter op de gekozen waarden en zoek in titel, notitie en bron. Standaard verbergen we Klaar.
  function filterPunten(punten, f) {
    const zoek = String(f.zoek || '').trim().toLowerCase();
    return punten.filter((p) => {
      if (!f.toonKlaar && !f.status && p.status === 'Klaar') return false;
      for (const [sleutel] of FILTERS) {
        if (f[sleutel] && p[sleutel] !== f[sleutel]) return false;
      }
      if (zoek && !`${p.titel} ${p.notitie} ${p.bron}`.toLowerCase().includes(zoek)) return false;
      return true;
    });
  }

  function groepeer(punten) {
    const volgorde = ['Nu', 'Binnenkort', 'Later', 'Klaar'];
    const groepen = volgorde.map((naam) => ({ naam, punten: [] }));
    punten.forEach((p) => {
      const naam = p.status === 'Klaar' ? 'Klaar' : (p.prioriteit || 'Later');
      (groepen.find((g) => g.naam === naam) || groepen[2]).punten.push(p);
    });
    return groepen.filter((g) => g.punten.length);
  }

  function telWachtOpDylan(punten) {
    return punten.filter((p) => p.status === 'Wacht op Dylan').length;
  }

  const model = { filterPunten, groepeer, telWachtOpDylan, FILTERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const e = (t) => escapeHtmlAdmin(String(t === undefined || t === null ? '' : t));
  const PILL = { Open: 'p-pil-neutraal', Bezig: 'p-pil-let-op', 'Wacht op Dylan': 'p-pil-fout', Klaar: 'p-pil-goed' };
  const staat = { punten: null, statussen: [], prioriteiten: [], filter: { zoek: '', toonKlaar: false }, melding: '', open: {} };

  function opties(lijst, gekozen, leeg) {
    return `<option value="">${e(leeg)}</option>` + lijst.map((w) => `<option value="${e(w)}" ${w === gekozen ? 'selected' : ''}>${e(w)}</option>`).join('');
  }

  function unieke(sleutel) {
    return [...new Set(staat.punten.map((p) => p[sleutel]).filter(Boolean))].sort();
  }

  function filterHtml() {
    const f = staat.filter;
    const kiezers = FILTERS.map(([sleutel, label]) => {
      const lijst = sleutel === 'status' ? staat.statussen : sleutel === 'prioriteit' ? staat.prioriteiten : unieke(sleutel);
      return `<label class="bl-filter"><span>${e(label)}</span><select data-filter="${sleutel}">${opties(lijst, f[sleutel], 'Alle')}</select></label>`;
    }).join('');
    return `<div class="bl-filters">
      <label class="bl-filter bl-zoek"><span>Zoeken</span><input type="search" id="blZoek" value="${e(f.zoek)}" placeholder="Titel of notitie"></label>
      ${kiezers}
      <label class="bl-filter bl-klaar"><input type="checkbox" id="blKlaar" ${f.toonKlaar ? 'checked' : ''}><span>Toon afgeronde</span></label>
    </div>`;
  }

  function puntHtml(p) {
    const open = staat.open[p.id];
    const meta = [p.onderdeel, p.klant, p.type].filter(Boolean).map((m) => `<span class="bl-tag">${e(m)}</span>`).join('');
    return `<div class="bl-punt ${p.status === 'Klaar' ? 'bl-klaar-punt' : ''}" data-id="${e(p.id)}">
      <div class="bl-kop">
        <button type="button" class="bl-titel" data-open="${e(p.id)}" aria-expanded="${open ? 'true' : 'false'}">${e(p.titel)}</button>
        <div class="bl-acties">
          <select class="bl-status ${PILL[p.status] || ''}" data-zet="status" data-id="${e(p.id)}" aria-label="Status">${opties(staat.statussen, p.status, '')}</select>
          <select class="bl-prio" data-zet="prioriteit" data-id="${e(p.id)}" aria-label="Prioriteit">${opties(staat.prioriteiten, p.prioriteit, '')}</select>
        </div>
      </div>
      <div class="bl-meta">${meta}</div>
      ${open ? `<div class="bl-detail">${p.notitie ? `<p>${e(p.notitie)}</p>` : '<p class="bl-leeg">Geen notitie.</p>'}${p.bron ? `<p class="bl-bron">Bron: ${e(p.bron)}</p>` : ''}${p.url ? `<a class="bl-link" href="${e(p.url)}" target="_blank" rel="noopener">Openen in Notion</a>` : ''}</div>` : ''}
    </div>`;
  }

  function teken() {
    const root = document.getElementById('viewBacklog');
    const gefilterd = filterPunten(staat.punten, staat.filter);
    const groepen = groepeer(gefilterd);
    const wacht = telWachtOpDylan(staat.punten);
    const teller = document.getElementById('backlogTeller');
    if (teller) { teller.textContent = wacht; teller.classList.toggle('hidden', !wacht); }
    root.innerHTML = `<div class="p-pagina">
      <div class="p-ov-kop"><div><h1>Backlog</h1><p>Alles wat open staat voor Blogr. en Pagr.: klantwerk, ontwikkeling van het portaal en besluiten. Dezelfde lijst als in Notion.</p></div></div>
      ${staat.melding ? `<div class="admin-error">${e(staat.melding)}</div>` : ''}
      ${filterHtml()}
      <p class="bl-aantal">${gefilterd.length} van ${staat.punten.length} punten${wacht ? `, ${wacht} wachten op jou` : ''}</p>
      ${groepen.length ? groepen.map((g) => `<div class="admin-section-title">${e(g.naam)} <span class="bl-n">${g.punten.length}</span></div>${g.punten.map(puntHtml).join('')}`).join('') : '<p class="bl-leeg">Geen punten met deze filters.</p>'}
    </div>`;
    bind(root);
  }

  function bind(root) {
    root.querySelectorAll('[data-filter]').forEach((s) => s.addEventListener('change', () => { staat.filter[s.dataset.filter] = s.value; teken(); }));
    const zoek = root.querySelector('#blZoek');
    if (zoek) zoek.addEventListener('input', () => {
      staat.filter.zoek = zoek.value;
      teken();
      const nieuw = document.getElementById('blZoek');
      nieuw.focus();
      nieuw.setSelectionRange(nieuw.value.length, nieuw.value.length);
    });
    root.querySelector('#blKlaar').addEventListener('change', (ev) => { staat.filter.toonKlaar = ev.target.checked; teken(); });
    root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { staat.open[b.dataset.open] = !staat.open[b.dataset.open]; teken(); }));
    root.querySelectorAll('[data-zet]').forEach((s) => s.addEventListener('change', async () => {
      const punt = staat.punten.find((p) => p.id === s.dataset.id);
      const veld = s.dataset.zet;
      const oud = punt[veld];
      s.disabled = true;
      try {
        await adminApi('/backlog/' + encodeURIComponent(punt.id), { method: 'POST', body: JSON.stringify({ [veld]: s.value }) });
        punt[veld] = s.value;
        staat.melding = '';
      } catch (err) {
        punt[veld] = oud;
        staat.melding = err.message;
      }
      teken();
    }));
  }

  window.renderBacklog = async function () {
    const root = document.getElementById('viewBacklog');
    if (!staat.punten) root.innerHTML = '<div class="p-pagina"><p class="bl-leeg">Laden</p></div>';
    try {
      const data = await adminApi('/backlog');
      staat.punten = data.punten;
      staat.statussen = data.statussen;
      staat.prioriteiten = data.prioriteiten;
      staat.melding = '';
    } catch (err) {
      if (!staat.punten) { root.innerHTML = `<div class="p-pagina"><div class="admin-error">${e(err.message)}</div></div>`; return; }
      staat.melding = err.message;
    }
    teken();
  };
})();
