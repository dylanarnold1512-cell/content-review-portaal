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
  const staat = { punten: null, statussen: [], prioriteiten: [], filter: { zoek: '', toonKlaar: false }, melding: '', open: {}, uitleg: false };

  const UITLEG = `
    <p><b>Wat staat hier?</b> Alles wat nog gedaan, gebouwd, opgelost of besloten moet worden voor Blogr. en Pagr. Dus de ontwikkeling van het portaal, de admin, Pagr. en n8n, fouten en besluiten. Het werk om een nieuwe klant te onboarden staat hier niet. Dat staat per klant onder Onboarding.</p>
    <p><b>Status.</b> Open: nog niet begonnen. Bezig: er wordt aan gewerkt. Wacht op Dylan: er is een actie of besluit van jou nodig, zoals credentials koppelen, publiceren, mergen of kiezen. Klaar: afgerond.</p>
    <p><b>Prioriteit.</b> Nu: eerst doen, blokkeert iets of is urgent. Binnenkort: staat gepland voor de komende tijd. Later: goed idee, maar nog geen haast.</p>
    <p><b>Type.</b> Bouwen: iets nieuws. Bug: iets werkt niet goed. Opruimen: iets netjes maken of weghalen. Besluit nodig: er moet eerst een keuze worden gemaakt. Klantwerk: een klantspecifieke actie die geen onboardingstap is.</p>
    <p><b>Onderdeel en klant.</b> Waar het over gaat (portaal, admin, Pagr., n8n, CMS, meting) en voor welke klant. Alle klanten betekent dat het voor het hele systeem geldt.</p>
    <p><b>Afronden.</b> Zet je een punt op Klaar, dan vraag ik eerst of het echt af is. Daarna verdwijnt het uit de lijst. Met Toon afgeronde zie je het weer. In Notion blijft het bewaard.</p>`;

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
      <div class="p-ov-kop"><div><h1>Backlog</h1><p>Alles wat open staat voor Blogr. en Pagr.: ontwikkeling, fouten en besluiten. Dezelfde lijst als in Notion.</p></div><div class="p-ov-kop-acties"><button type="button" class="bl-info" id="blInfo" aria-expanded="${staat.uitleg ? 'true' : 'false'}" aria-controls="blUitleg" title="Uitleg over het backlog">i</button></div></div>
      <div class="bl-uitleg ${staat.uitleg ? '' : 'hidden'}" id="blUitleg">${UITLEG}</div>
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
    root.querySelector('#blInfo').addEventListener('click', () => { staat.uitleg = !staat.uitleg; teken(); });
    root.querySelector('#blKlaar').addEventListener('change', (ev) => { staat.filter.toonKlaar = ev.target.checked; teken(); });
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
