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

  // Filter op de gekozen waarden en zoek in titel, uitleg, notitie en bron. Standaard verbergen we Klaar.
  function filterPunten(punten, f) {
    const zoek = String(f.zoek || '').trim().toLowerCase();
    return punten.filter((p) => {
      if (!f.toonKlaar && !f.status && p.status === 'Klaar') return false;
      for (const [sleutel] of FILTERS) {
        if (f[sleutel] && p[sleutel] !== f[sleutel]) return false;
      }
      if (zoek && !`${p.titel} ${p.uitleg || ''} ${p.notitie} ${p.bron}`.toLowerCase().includes(zoek)) return false;
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

  // De getallen voor de vier tegels bovenaan: alleen punten die nog niet klaar zijn.
  function telTegels(punten) {
    const open = punten.filter((p) => p.status !== 'Klaar');
    return {
      wacht: open.filter((p) => p.status === 'Wacht op Dylan').length,
      nu: open.filter((p) => p.prioriteit === 'Nu').length,
      binnenkort: open.filter((p) => p.prioriteit === 'Binnenkort').length,
      later: open.filter((p) => p.prioriteit === 'Later' || !p.prioriteit).length,
      totaal: open.length
    };
  }

  const model = { filterPunten, groepeer, telWachtOpDylan, telTegels, FILTERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const e = (t) => escapeHtmlAdmin(String(t === undefined || t === null ? '' : t));
  const PILL = { Open: 'bl-st-open', Bezig: 'bl-st-bezig', 'Wacht op Dylan': 'bl-st-wacht', Klaar: 'bl-st-klaar' };
  const RAIL = { Nu: 'bl-rail-nu', Binnenkort: 'bl-rail-binnenkort', Later: 'bl-rail-later' };
  const staat = { punten: null, statussen: [], prioriteiten: [], filter: { zoek: '', toonKlaar: false }, melding: '', open: {} };

  function opties(lijst, gekozen, leeg) {
    return (leeg ? `<option value="">${e(leeg)}</option>` : '') + lijst.map((w) => `<option value="${e(w)}" ${w === gekozen ? 'selected' : ''}>${e(w)}</option>`).join('');
  }

  function unieke(sleutel) {
    return [...new Set(staat.punten.map((p) => p[sleutel]).filter(Boolean))].sort();
  }

  function tegelsHtml() {
    const t = telTegels(staat.punten);
    const f = staat.filter;
    const tegel = (sleutel, waarde, getal, label, klasse) => {
      const actief = f[sleutel] === waarde;
      return `<button type="button" class="bl-tegel ${klasse} ${actief ? 'actief' : ''}" data-tegel="${sleutel}" data-waarde="${e(waarde)}" aria-pressed="${actief}"><span class="bl-tegel-getal">${getal}</span><span class="bl-tegel-label">${e(label)}</span></button>`;
    };
    return `<div class="bl-tegels">
      ${tegel('status', 'Wacht op Dylan', t.wacht, 'Wacht op jou', 'bl-t-wacht')}
      ${tegel('prioriteit', 'Nu', t.nu, 'Nu doen', 'bl-t-nu')}
      ${tegel('prioriteit', 'Binnenkort', t.binnenkort, 'Binnenkort', 'bl-t-binnenkort')}
      ${tegel('prioriteit', 'Later', t.later, 'Later', 'bl-t-later')}
    </div>`;
  }

  function filterHtml() {
    const f = staat.filter;
    const kiezers = ['type', 'onderdeel', 'klant'].map((sleutel) => {
      const label = FILTERS.find((x) => x[0] === sleutel)[1];
      return `<label class="bl-filter"><span>${e(label)}</span><select data-filter="${sleutel}">${opties(unieke(sleutel), f[sleutel], 'Alle')}</select></label>`;
    }).join('');
    const actief = FILTERS.some(([k]) => f[k]) || f.zoek;
    return `<div class="bl-filters">
      <label class="bl-filter bl-zoek"><span>Zoeken</span><input type="search" id="blZoek" value="${e(f.zoek)}" placeholder="Zoek in titel of uitleg"></label>
      ${kiezers}
      <label class="bl-klaarkeuze"><input type="checkbox" id="blKlaar" ${f.toonKlaar ? 'checked' : ''}><span>Toon afgeronde</span></label>
      ${actief ? '<button type="button" class="bl-wis" id="blWis">Filters wissen</button>' : ''}
    </div>`;
  }

  function puntHtml(p) {
    const open = staat.open[p.id];
    const tags = [
      p.onderdeel ? `<span class="bl-tag bl-tag-onderdeel">${e(p.onderdeel)}</span>` : '',
      p.klant && p.klant !== 'Alle klanten' ? `<span class="bl-tag bl-tag-klant">${e(p.klant)}</span>` : '',
      p.type ? `<span class="bl-tag">${e(p.type)}</span>` : ''
    ].join('');
    const uitleg = p.uitleg || p.notitie || 'Voor dit punt is nog geen uitleg geschreven.';
    const detail = open ? `<div class="bl-uitleg" id="bl-u-${e(p.id)}">
      <div class="bl-uitleg-kop">Wat houdt dit in?</div>
      <p>${e(uitleg)}</p>
      ${p.uitleg && p.notitie ? `<div class="bl-uitleg-kop bl-klein">Technische notitie</div><p class="bl-notitie">${e(p.notitie)}</p>` : ''}
      <div class="bl-uitleg-voet">${p.bron ? `<span>Bron: ${e(p.bron)}</span>` : ''}${p.url ? `<a href="${e(p.url)}" target="_blank" rel="noopener">Openen in Notion</a>` : ''}</div>
    </div>` : '';
    return `<article class="bl-punt ${RAIL[p.prioriteit] || 'bl-rail-later'}" data-id="${e(p.id)}">
      <div class="bl-rij">
        <button type="button" class="bl-i ${open ? 'actief' : ''}" data-open="${e(p.id)}" aria-expanded="${open ? 'true' : 'false'}" aria-controls="bl-u-${e(p.id)}" aria-label="Uitleg bij dit punt" title="Wat houdt dit in?">i</button>
        <div class="bl-tekst">
          <div class="bl-titel">${e(p.titel)}</div>
          <div class="bl-tags">${tags}</div>
        </div>
        <div class="bl-keuzes">
          <select class="bl-select bl-status ${PILL[p.status] || ''}" data-zet="status" data-id="${e(p.id)}" aria-label="Status">${opties(staat.statussen, p.status)}</select>
          <select class="bl-select bl-prio" data-zet="prioriteit" data-id="${e(p.id)}" aria-label="Prioriteit">${opties(staat.prioriteiten, p.prioriteit)}</select>
        </div>
      </div>
      ${detail}
    </article>`;
  }

  function teken() {
    const root = document.getElementById('viewBacklog');
    const gefilterd = filterPunten(staat.punten, staat.filter);
    const groepen = groepeer(gefilterd);
    const wacht = telWachtOpDylan(staat.punten);
    const teller = document.getElementById('backlogTeller');
    if (teller) { teller.textContent = wacht; teller.classList.toggle('hidden', !wacht); }
    root.innerHTML = `<div class="p-pagina bl-pagina">
      <div class="p-ov-kop"><div><h1>Backlog</h1><p>Wat er nog gebouwd, opgelost of besloten moet worden voor Blogr. en Pagr. Klik op de i bij een punt voor uitleg.</p></div></div>
      ${staat.melding ? `<div class="admin-error">${e(staat.melding)}</div>` : ''}
      ${tegelsHtml()}
      ${filterHtml()}
      <p class="bl-aantal">${gefilterd.length} ${gefilterd.length === 1 ? 'punt' : 'punten'} getoond</p>
      ${groepen.length ? groepen.map((g) => `<section class="bl-groep">
        <h2 class="bl-groep-kop"><span class="bl-stip ${RAIL[g.naam] || 'bl-rail-klaar'}"></span>${e(g.naam === 'Klaar' ? 'Afgerond' : g.naam)}<span class="bl-n">${g.punten.length}</span></h2>
        ${g.punten.map(puntHtml).join('')}
      </section>`).join('') : '<p class="bl-leeg">Geen punten met deze filters.</p>'}
    </div>`;
    bind(root);
  }

  function bind(root) {
    root.querySelectorAll('[data-tegel]').forEach((b) => b.addEventListener('click', () => {
      const { tegel, waarde } = b.dataset;
      const nu = staat.filter[tegel] === waarde;
      staat.filter.status = '';
      staat.filter.prioriteit = '';
      if (!nu) staat.filter[tegel] = waarde;
      teken();
    }));
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
    const wis = root.querySelector('#blWis');
    if (wis) wis.addEventListener('click', () => { staat.filter = { zoek: '', toonKlaar: staat.filter.toonKlaar }; teken(); });
    root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { staat.open[b.dataset.open] = !staat.open[b.dataset.open]; teken(); }));
    root.querySelectorAll('[data-zet]').forEach((s) => s.addEventListener('change', async () => {
      const punt = staat.punten.find((p) => p.id === s.dataset.id);
      const veld = s.dataset.zet;
      const oud = punt[veld];
      if (veld === 'status' && s.value === 'Klaar' && !window.confirm(`Echt afgerond?\n\n"${punt.titel}"\n\nIs het gebouwd, getest en werkt het? Zo ja, dan verdwijnt het uit de lijst.`)) {
        s.value = oud;
        return;
      }
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
