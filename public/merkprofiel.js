// Merkprofiel-tabblad: toont het klantprofiel als tien opvouwbare onderdelen met
// de herkomst per feit, en laat de klant per onderdeel bevestigen, een feit
// uitsluiten, aanpassen of een opmerking plaatsen. Standaard staat alles dicht en
// zie je alleen wat nog aandacht nodig heeft. Data en logica staan in
// src/services/merkprofiel.js.
(function () {
  let profiel = null;
  let clientId = '';
  let termenOpen = false;
  let filter = null; // 'todo' | 'bevestigd' | 'alles', wordt bij de eerste keer bepaald
  const open = new Set(); // nummers van uitgeklapte onderdelen

  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function apiMp(pad, opties) {
    const res = await fetch('/api' + pad, { headers: { 'Content-Type': 'application/json' }, ...opties });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Er ging iets mis.');
    return data;
  }

  function datumLang(iso) {
    if (!iso) return '';
    const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function herkomstLabel(h) {
    if (h.pdf && h.website) return '<span class="mp-bron mp-bron-beide">eigen document en website</span>';
    if (h.pdf) return '<span class="mp-bron mp-bron-pdf">eigen document</span>';
    if (h.website) return '<span class="mp-bron mp-bron-web">gevonden op je website</span>';
    return '';
  }

  // Wat er in een onderdeel nog aandacht nodig heeft.
  function sectieStand(s) {
    const aanvullen = s.feiten.filter((f) => f.open && f.status !== 'klopt').length;
    const aangepast = s.feiten.filter((f) => f.status === 'aangepast').length;
    const uitgesloten = s.feiten.filter((f) => f.status === 'niet_gebruiken').length;
    let soort = 'controleren';
    if (s.bevestigd) soort = 'bevestigd';
    else if (aanvullen) soort = 'aanvullen';
    return { soort, aanvullen, aangepast, uitgesloten };
  }

  function chipHtml(stand) {
    if (stand.soort === 'bevestigd') return '<span class="mp-chip mp-chip-ok">Bevestigd</span>';
    if (stand.soort === 'aanvullen') return `<span class="mp-chip mp-chip-aanvullen">Aanvullen (${stand.aanvullen})</span>`;
    return '<span class="mp-chip mp-chip-controleren">Nog te controleren</span>';
  }

  function feitHtml(f) {
    const uitgesloten = f.status === 'niet_gebruiken';
    const bevestigd = f.status === 'klopt';
    const aangepast = f.status === 'aangepast';
    const label = herkomstLabel(f.herkomst);
    const intern = f.intern ? '<span class="mp-bron mp-bron-intern">intern, niet in blogs</span>' : '';
    const openLabel = f.open ? '<span class="mp-bron mp-bron-open">aan te vullen</span>' : '';
    const opmerking = f.opmerking ? `<div class="mp-opmerking">Jouw opmerking: ${esc(f.opmerking)}</div>` : '';
    const was = aangepast && f.origineel ? `<div class="mp-opmerking">Eerder stond hier: ${esc(f.origineel)}</div>` : '';
    return `<li class="mp-feit${uitgesloten ? ' mp-uitgesloten' : ''}${f.open && !aangepast ? ' mp-feit-open' : ''}" data-id="${esc(f.id)}">
      <div class="mp-feit-tekst">${esc(f.tekst)}</div>
      <div class="mp-feit-meta">${label}${intern}${openLabel}${bevestigd ? '<span class="mp-bron mp-bron-ok">door jou bevestigd</span>' : ''}${aangepast ? '<span class="mp-bron mp-bron-ok">door jou aangepast</span>' : ''}${uitgesloten ? '<span class="mp-bron mp-bron-uit">niet gebruiken</span>' : ''}</div>
      ${was}${opmerking}
      <div class="mp-feit-acties">
        ${f.beschermd ? '' : `<button type="button" class="mp-link" data-actie="uitsluiten">${uitgesloten ? 'Toch gebruiken' : 'Niet gebruiken'}</button>`}
        ${f.beschermd ? '' : `<button type="button" class="mp-link" data-actie="aanpassen">${f.open && !aangepast ? 'Invullen' : 'Aanpassen'}</button>`}
        <button type="button" class="mp-link" data-actie="opmerking">Opmerking</button>
      </div>
      <div class="mp-aanpas-form hidden"><textarea class="mp-aanpas-tekst" rows="3" placeholder="${f.open ? 'Vul hier in wat wel klopt.' : 'Schrijf hier de juiste tekst.'}">${f.open ? '' : esc(f.tekst)}</textarea>
        <button type="button" class="btn-save-sm" data-actie="aanpassen-opslaan">Opslaan</button>${aangepast ? '<button type="button" class="mp-link" data-actie="aanpassen-terug">Terug naar origineel</button>' : ''}</div>
      <div class="mp-opm-form hidden"><textarea class="mp-opm-tekst" rows="2" placeholder="Wat klopt er niet, of wat mogen we weten?">${esc(f.opmerking)}</textarea>
        <button type="button" class="btn-save-sm" data-actie="opmerking-opslaan">Opslaan</button></div>
    </li>`;
  }

  function samenvatting(s, stand) {
    const delen = [s.feiten.length === 1 ? "1 punt" : `${s.feiten.length} punten`];
    if (stand.aangepast) delen.push(`${stand.aangepast} aangepast`);
    if (stand.uitgesloten) delen.push(`${stand.uitgesloten} niet gebruiken`);
    return delen.join(' · ');
  }

  function sectieHtml(s) {
    const stand = sectieStand(s);
    const isOpen = open.has(s.nr);
    let huidigeSubkop = null;
    let lijst = '<ul class="mp-feiten">';
    s.feiten.forEach((f) => {
      if (f.subkop && f.subkop !== huidigeSubkop) {
        lijst += `</ul><div class="mp-subkop">${esc(f.subkop)}</div><ul class="mp-feiten">`;
      }
      huidigeSubkop = f.subkop;
      lijst += feitHtml(f);
    });
    lijst += '</ul>';
    const klopt = s.bevestigd
      ? `<span class="mp-sectie-ok">Bevestigd${s.bevestigdOp ? ' op ' + esc(datumLang(s.bevestigdOp)) : ''}</span><button type="button" class="mp-link" data-actie="sectie-terug">Ongedaan maken</button>`
      : '<button type="button" class="btn-save-sm" data-actie="sectie-klopt">Dit klopt allemaal</button>';
    const concurrent = s.nr === 10 ? '<p class="mp-uitleg">Welke bedrijven zie jij als concurrent? Wij stellen er drie tot vijf voor en meten die later in AI antwoorden. Reageer via een opmerking.</p>' : '';
    return `<section class="mp-kaart mp-kaart-${stand.soort}${isOpen ? ' mp-uitgeklapt' : ''}" data-sectie="${s.nr}">
      <button type="button" class="mp-kaart-kop" data-actie="toggle" aria-expanded="${isOpen}">
        <span class="mp-nr">${s.nr}</span>
        <span class="mp-kop-tekst"><span class="mp-kop-titel">${esc(s.titel)}</span><span class="mp-kop-sub">${esc(samenvatting(s, stand))}</span></span>
        ${chipHtml(stand)}
        <span class="mp-pijl" aria-hidden="true"></span>
      </button>
      <div class="mp-kaart-body${isOpen ? '' : ' hidden'}">
        ${concurrent}${lijst}
        <div class="mp-sectie-voet">${klopt}</div>
      </div>
    </section>`;
  }

  function tellingen() {
    const t = { aanvullen: 0, controleren: 0, bevestigd: 0 };
    profiel.secties.forEach((s) => { t[sectieStand(s).soort] += 1; });
    return t;
  }

  function zichtbaar(s) {
    const soort = sectieStand(s).soort;
    if (filter === 'todo') return soort !== 'bevestigd';
    if (filter === 'bevestigd') return soort === 'bevestigd';
    return true;
  }

  function uitgeslotenHtml() {
    const lijst = (profiel && profiel.uitgeslotenZoektermen) || [];
    const naam = esc((profiel && profiel.klantNaam) || '');
    return `<div class="mp-uitgesloten">
      <h3>Zoektermen die we niet als kans tonen</h3>
      <p class="mp-uitleg">Mensen die zoeken op jullie eigen naam, ruimtes, producten of adres kennen jullie al. Daar schrijven we geen blog voor en we tonen het ook niet als kans in Prestaties. Automatisch uitgesloten: de naam ${naam} en de naam van jullie website.${lijst.length ? ' Daarnaast hebben we deze termen uitgesloten:' : ''}</p>
      ${lijst.length ? `<div class="mp-termen">${lijst.map((t) => `<span class="mp-term">${esc(t)}</span>`).join('')}</div>` : '<p class="mp-uitleg">Er zijn nog geen extra termen toegevoegd.</p>'}
      <p class="mp-uitleg">Mis je een term, of staat er iets tussen wat wel een blog verdient? Laat het ons weten via een opmerking of een bericht.</p>
    </div>`;
  }

  function termenBlokHtml(klasse, kop, uitleg, lijst) {
    if (!lijst || !lijst.length) return '';
    const chips = lijst.map((t) => {
      const reden = t.reden ? `<span class="mp-term-reden">${esc(t.reden)}</span>` : '';
      return `<span class="mp-term"${t.reden ? ` title="${esc(t.reden)}"` : ''}>${esc(t.term)}${reden}</span>`;
    }).join('');
    return `<div class="mp-uitgesloten ${klasse}">
      <h3>${kop}</h3>
      <p class="mp-uitleg">${uitleg}</p>
      <div class="mp-termen">${chips}</div>
    </div>`;
  }

  function termKey(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split('\u00df').join('ss').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  }

  function verbodenBlokHtml() {
    const lijst = (profiel && profiel.verbodenTermen) || [];
    const handmatig = new Set(((profiel && profiel.verbodenHandmatig) || []).map(termKey));
    const uitgezonderd = (profiel && profiel.verbodenUitgezonderd) || [];
    const chips = lijst.map((t) => {
      const reden = t.reden ? `<span class="mp-term-reden">${esc(t.reden)}</span>` : (handmatig.has(termKey(t.term)) ? '<span class="mp-term-reden">Zelf toegevoegd</span>' : '');
      return `<span class="mp-term"${t.reden ? ` title="${esc(t.reden)}"` : ''}><span class="mp-term-tekst">${esc(t.term)}</span><button type="button" class="mp-term-weg" data-actie="verbod-weg" data-term="${esc(t.term)}" aria-label="Haal ${esc(t.term)} weg" title="Weghalen">&times;</button>${reden}</span>`;
    }).join('');
    const terug = uitgezonderd.length
      ? `<p class="mp-uitleg">Weggehaald: ${uitgezonderd.map((t) => `<button type="button" class="mp-link" data-actie="verbod-terug" data-term="${esc(t)}">${esc(t)} terugzetten</button>`).join(' ')}</p>`
      : '';
    return `<div class="mp-uitgesloten mp-verboden">
      <h3>Termen die we in blogs niet gebruiken</h3>
      <p class="mp-uitleg">Deze lijst is automatisch opgesteld uit jullie profiel, en jullie passen hem zelf aan. Staat er een term bij die wel mag? Haal hem weg. Mis je een term? Voeg hem toe. Een nieuwe blog wordt automatisch gecontroleerd op deze termen en bij een treffer herschreven. Een wijziging werkt vanaf de eerstvolgende blog.</p>
      ${chips ? `<div class="mp-termen">${chips}</div>` : '<p class="mp-uitleg">Er staan nog geen termen op de lijst.</p>'}
      <div class="mp-verbod-form"><input type="text" class="mp-verbod-input" maxlength="40" placeholder="Term toevoegen" aria-label="Term toevoegen"><button type="button" class="btn-save-sm" data-actie="verbod-voeg">Toevoegen</button></div>
      ${terug}
    </div>`;
  }

  function klantTermenHtml() {
    return verbodenBlokHtml() +
      termenBlokHtml('mp-vast', 'Vaste schrijfwijzen',
        'Deze namen en termen schrijven we altijd zo.',
        profiel && profiel.vasteTermen);
  }

  function termenSectieHtml() {
    const aantal = (l) => (Array.isArray(l) ? l.length : 0);
    const samenvatting = [
      `${aantal(profiel && profiel.verbodenTermen)} verboden termen`,
      `${aantal(profiel && profiel.vasteTermen)} vaste schrijfwijzen`,
      `${aantal(profiel && profiel.uitgeslotenZoektermen)} uitgesloten zoektermen`
    ].join(', ');
    return `<details class="mp-termen-sectie"${termenOpen ? ' open' : ''}>
      <summary><strong>Termen en schrijfregels</strong><span class="mp-termen-samenvatting">${esc(samenvatting)}</span></summary>
      ${uitgeslotenHtml()}${klantTermenHtml()}
    </details>`;
  }

  async function wijzigVerbod(actie, term) {
    const fout = el('merkprofielFout');
    if (fout) fout.textContent = '';
    try {
      await apiMp(`/${clientId}/merkprofiel/verboden`, { method: 'POST', body: JSON.stringify({ actie, term }) });
      await laad(true);
    } catch (err) {
      if (fout) fout.textContent = err.message;
    }
  }

  function render() {
    const root = el('merkprofielInhoud');
    if (!root || !profiel) return;
    const t = tellingen();
    const totaal = profiel.secties.length;
    const todo = t.aanvullen + t.controleren;
    if (filter === null) filter = todo > 0 ? 'todo' : 'alles';
    const naam = esc(profiel.klantNaam || '');
    const procent = Math.round((t.bevestigd / totaal) * 100);
    const openFeiten = [];
    profiel.secties.forEach((s) => s.feiten.forEach((f) => {
      if (f.open && f.status !== 'klopt' && f.status !== 'aangepast') openFeiten.push({ nr: s.nr, titel: s.titel, f });
    }));
    const openHtml = openFeiten.length
      ? `<div class="mp-open"><h3>Dit hebben we nog van jullie nodig</h3><ul>${openFeiten.slice(0, 8).map((v) => `<li><span class="mp-open-tekst"><strong>${esc(v.titel)}:</strong> ${esc(v.f.tekst)}</span><button type="button" class="btn-save-sm" data-actie="ga-naar" data-sectie="${v.nr}" data-id="${esc(v.f.id)}">Invullen</button></li>`).join('')}</ul></div>`
      : '';
    const tabs = [
      ['todo', `Nog te doen (${todo})`],
      ['bevestigd', `Bevestigd (${t.bevestigd})`],
      ['alles', `Alles (${totaal})`]
    ].map(([k, l]) => `<button type="button" class="mp-tab${filter === k ? ' mp-tab-actief' : ''}" data-actie="filter" data-filter="${k}">${l}</button>`).join('');
    const kaarten = profiel.secties.filter(zichtbaar).map(sectieHtml).join('');
    const klaar = todo === 0
      ? '<div class="mp-klaar"><strong>Alles is bevestigd.</strong> Bedankt. Wij schrijven jullie blogs op basis van dit profiel. Wil je later nog iets wijzigen, dan kan dat hier altijd.</div>'
      : '';
    root.innerHTML = `
      <div class="mp-hero">
        <div>
          <h2>Zo zien wij ${naam}</h2>
          <p>Vastgesteld${profiel.bijgewerkt ? ' op ' + esc(datumLang(profiel.bijgewerkt)) : ''}${profiel.aantalPaginas ? ` uit ${profiel.aantalPaginas} pagina's van jullie website` : ' uit jullie website'}, aangevuld met jullie eigen informatie. Hier baseren we jullie blogs op. Open een onderdeel om te lezen wat we hebben vastgesteld. Klopt het, kies dan "Dit klopt allemaal". Klopt iets niet, pas het aan of laat het weg.</p>
        </div>
        <div class="mp-voortgang"><div class="mp-voortgang-tekst">${t.bevestigd} van ${totaal} onderdelen bevestigd</div>
          <div class="mp-balk"><div class="mp-balk-vulling" style="width:${procent}%"></div></div></div>
      </div>
      ${klaar}${openHtml}
      <div class="mp-tabs">${tabs}</div>
      <div class="mp-kaarten">${kaarten || '<p class="mp-uitleg">Niets in deze lijst.</p>'}</div>
      ${termenSectieHtml()}`;
    root.querySelectorAll('.mp-feiten').forEach((u) => { if (!u.children.length) u.remove(); });
  }

  async function bewaar(regelId, status, opmerking, regelTekst) {
    const fout = el('merkprofielFout');
    if (fout) fout.textContent = '';
    try {
      await apiMp(`/${clientId}/merkprofiel/beoordeel`, { method: 'POST', body: JSON.stringify({ regelId, status, opmerking, regelTekst }) });
      await laad(true);
    } catch (err) {
      if (fout) fout.textContent = err.message;
    }
  }

  function vindFeit(id) {
    for (const s of profiel.secties) {
      const f = s.feiten.find((x) => x.id === id);
      if (f) return f;
    }
    return null;
  }

  function bindKlikken() {
    const root = el('merkprofielInhoud');
    if (!root || root.dataset.gebonden) return;
    root.dataset.gebonden = '1';
    root.addEventListener('toggle', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('mp-termen-sectie')) termenOpen = e.target.open;
    }, true);
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.classList || !e.target.classList.contains('mp-verbod-input')) return;
      e.preventDefault();
      const term = e.target.value.trim();
      if (term) wijzigVerbod('voeg', term);
    });
    root.addEventListener('click', (e) => {
      const knop = e.target.closest('[data-actie]');
      if (!knop) return;
      const actie = knop.dataset.actie;
      const kaart = knop.closest('.mp-kaart');
      const feitEl = knop.closest('.mp-feit');
      if (actie === 'filter') { filter = knop.dataset.filter; return render(); }
      if (actie === 'verbod-weg' || actie === 'verbod-terug') return wijzigVerbod(actie === 'verbod-weg' ? 'verwijder' : 'voeg', knop.dataset.term);
      if (actie === 'verbod-voeg') {
        const veld = root.querySelector('.mp-verbod-input');
        const term = veld ? veld.value.trim() : '';
        if (!term) return;
        return wijzigVerbod('voeg', term);
      }
      if (actie === 'toggle') {
        const nr = Number(kaart.dataset.sectie);
        if (open.has(nr)) open.delete(nr); else open.add(nr);
        return render();
      }
      if (actie === 'ga-naar') {
        const nr = Number(knop.dataset.sectie);
        open.add(nr);
        if (filter === 'bevestigd') filter = 'todo';
        render();
        const doel = el('merkprofielInhoud').querySelector(`.mp-feit[data-id="${knop.dataset.id}"]`);
        if (doel) {
          doel.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const form = doel.querySelector('.mp-aanpas-form');
          if (form) { form.classList.remove('hidden'); const ta = form.querySelector('textarea'); if (ta) ta.focus({ preventScroll: true }); }
        }
        return;
      }
      if (actie === 'sectie-klopt') return bewaar(`sectie-${kaart.dataset.sectie}`, 'klopt', '', '');
      if (actie === 'sectie-terug') return bewaar(`sectie-${kaart.dataset.sectie}`, 'geen', '', '');
      if (!feitEl) return;
      const f = vindFeit(feitEl.dataset.id);
      if (!f) return;
      if (actie === 'uitsluiten') return bewaar(f.id, f.status === 'niet_gebruiken' ? 'geen' : 'niet_gebruiken', f.opmerking, f.tekst);
      if (actie === 'aanpassen') return feitEl.querySelector('.mp-aanpas-form').classList.toggle('hidden');
      if (actie === 'aanpassen-opslaan') {
        const tekst = feitEl.querySelector('.mp-aanpas-tekst').value.trim();
        if (!tekst) return;
        return bewaar(f.id, 'aangepast', tekst, f.origineel || f.tekst);
      }
      if (actie === 'aanpassen-terug') return bewaar(f.id, 'geen', '', f.origineel || f.tekst);
      if (actie === 'opmerking') return feitEl.querySelector('.mp-opm-form').classList.toggle('hidden');
      if (actie === 'opmerking-opslaan') {
        const tekst = feitEl.querySelector('.mp-opm-tekst').value.trim();
        const status = tekst ? 'opmerking' : (f.status === 'niet_gebruiken' ? 'niet_gebruiken' : 'geen');
        return bewaar(f.id, f.status === 'niet_gebruiken' ? 'niet_gebruiken' : status, tekst, f.tekst);
      }
    });
  }

  async function laad(stil) {
    const leeg = el('merkprofielLeeg');
    const fout = el('merkprofielFout');
    try {
      const data = await apiMp(`/${clientId}/merkprofiel`);
      if (!data.beschikbaar) {
        profiel = null;
        if (leeg) leeg.classList.remove('hidden');
        if (el('merkprofielInhoud')) el('merkprofielInhoud').innerHTML = '';
        return false;
      }
      profiel = data;
      if (leeg) leeg.classList.add('hidden');
      render();
      bindKlikken();
      return true;
    } catch (err) {
      if (fout && !stil) fout.textContent = err.message;
      return false;
    }
  }

  // Wordt na het inloggen aangeroepen: toont het tabblad alleen als er een
  // vastgesteld profiel is en de klant het tabblad aan heeft staan.
  async function controleer(id) {
    clientId = id;
    const knop = el('merkprofielTabBtn');
    try {
      const data = await apiMp(`/${clientId}/merkprofiel`);
      if (knop) knop.classList.toggle('hidden', !data.beschikbaar);
    } catch (err) {
      if (knop) knop.classList.add('hidden');
    }
  }

  window.checkMerkprofiel = controleer;
  window.loadMerkprofiel = function () { return laad(false); };
})();
