// Merkprofiel-tabblad: toont het klantprofiel als tien kaarten met de herkomst
// per feit, en laat de klant per onderdeel bevestigen, een feit uitsluiten of
// een opmerking plaatsen. Data en logica staan in src/services/merkprofiel.js.
(function () {
  let profiel = null;
  let clientId = '';

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

  function feitHtml(f) {
    const uitgesloten = f.status === 'niet_gebruiken';
    const bevestigd = f.status === 'klopt';
    const label = herkomstLabel(f.herkomst);
    const intern = f.intern ? '<span class="mp-bron mp-bron-intern">intern, niet in blogs</span>' : '';
    const open = f.open ? '<span class="mp-bron mp-bron-open">aan te vullen</span>' : '';
    const aangepast = f.status === 'aangepast';
    const opmerking = f.opmerking ? `<div class="mp-opmerking">Jouw opmerking: ${esc(f.opmerking)}</div>` : '';
    const was = aangepast && f.origineel ? `<div class="mp-opmerking">Eerder stond hier: ${esc(f.origineel)}</div>` : '';
    return `<li class="mp-feit${uitgesloten ? ' mp-uitgesloten' : ''}" data-id="${esc(f.id)}">
      <div class="mp-feit-tekst">${esc(f.tekst)}</div>
      <div class="mp-feit-meta">${label}${intern}${open}${bevestigd ? '<span class="mp-bron mp-bron-ok">door jou bevestigd</span>' : ''}${aangepast ? '<span class="mp-bron mp-bron-ok">door jou aangepast</span>' : ''}${uitgesloten ? '<span class="mp-bron mp-bron-uit">niet gebruiken</span>' : ''}</div>
      ${was}${opmerking}
      <div class="mp-feit-acties">
        ${f.beschermd ? '' : `<button type="button" class="mp-link" data-actie="uitsluiten">${uitgesloten ? 'Toch gebruiken' : 'Niet gebruiken'}</button>`}
        ${f.beschermd ? '' : `<button type="button" class="mp-link" data-actie="aanpassen">${f.open ? 'Invullen' : 'Aanpassen'}</button>`}
        <button type="button" class="mp-link" data-actie="opmerking">Opmerking</button>
      </div>
      <div class="mp-aanpas-form hidden"><textarea class="mp-aanpas-tekst" rows="3" placeholder="${f.open ? 'Vul hier in wat wel klopt.' : 'Schrijf hier de juiste tekst.'}">${f.open ? '' : esc(f.tekst)}</textarea>
        <button type="button" class="btn-save-sm" data-actie="aanpassen-opslaan">Opslaan</button>${aangepast ? '<button type="button" class="mp-link" data-actie="aanpassen-terug">Terug naar origineel</button>' : ''}</div>
      <div class="mp-opm-form hidden"><textarea class="mp-opm-tekst" rows="2" placeholder="Wat klopt er niet, of wat mogen we weten?">${esc(f.opmerking)}</textarea>
        <button type="button" class="btn-save-sm" data-actie="opmerking-opslaan">Opslaan</button></div>
    </li>`;
  }

  function sectieHtml(s) {
    let huidigeSubkop = null;
    let lijst = '';
    s.feiten.forEach((f) => {
      if (f.subkop && f.subkop !== huidigeSubkop) {
        lijst += `</ul><div class="mp-subkop">${esc(f.subkop)}</div><ul class="mp-feiten">`;
      }
      huidigeSubkop = f.subkop;
      lijst += feitHtml(f);
    });
    const klopt = s.bevestigd
      ? `<span class="mp-sectie-ok">Bevestigd${s.bevestigdOp ? ' op ' + esc(datumLang(s.bevestigdOp)) : ''}</span><button type="button" class="mp-link" data-actie="sectie-terug">Ongedaan maken</button>`
      : '<button type="button" class="btn-save-sm" data-actie="sectie-klopt">Dit klopt</button>';
    const concurrent = s.nr === 10 ? '<p class="mp-uitleg">Welke bedrijven zie jij als concurrent? Wij stellen er drie tot vijf voor en meten die later in AI antwoorden. Reageer via een opmerking.</p>' : '';
    return `<section class="mp-kaart${s.bevestigd ? ' mp-bevestigd' : ''}" data-sectie="${s.nr}">
      <header class="mp-kaart-kop"><div><span class="mp-nr">${s.nr}</span><h3>${esc(s.titel)}</h3></div><div class="mp-sectie-actie">${klopt}</div></header>
      ${concurrent}<ul class="mp-feiten">${lijst}</ul></section>`;
  }

  function render() {
    const root = el('merkprofielInhoud');
    if (!root || !profiel) return;
    const naam = esc(profiel.klantNaam || '');
    const procent = Math.round((profiel.aantalBevestigd / profiel.aantalSecties) * 100);
    const open = (profiel.openVragen || []).slice(0, 8);
    const openHtml = open.length
      ? `<div class="mp-open"><h3>Wat we nog van jullie nodig hebben</h3><ul>${open.map((v) => `<li><strong>${esc(v.sectie)}:</strong> ${esc(v.tekst)}</li>`).join('')}</ul></div>`
      : '';
    root.innerHTML = `
      <div class="mp-hero">
        <div>
          <h2>Zo zien wij ${naam}</h2>
          <p>Vastgesteld${profiel.bijgewerkt ? ' op ' + esc(datumLang(profiel.bijgewerkt)) : ''}${profiel.aantalPaginas ? ` uit ${profiel.aantalPaginas} pagina's van jullie website` : ' uit jullie website'}, aangevuld met jullie eigen informatie. Dit is waar we jullie blogs op baseren. Klopt iets niet, zeg het dan.</p>
        </div>
        <div class="mp-voortgang"><div class="mp-voortgang-tekst">${profiel.aantalBevestigd} van ${profiel.aantalSecties} onderdelen bevestigd</div>
          <div class="mp-balk"><div class="mp-balk-vulling" style="width:${procent}%"></div></div></div>
      </div>
      ${openHtml}
      <div class="mp-kaarten">${profiel.secties.map(sectieHtml).join('')}</div>`;
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
    root.addEventListener('click', (e) => {
      const knop = e.target.closest('[data-actie]');
      if (!knop) return;
      const actie = knop.dataset.actie;
      const kaart = knop.closest('.mp-kaart');
      const feitEl = knop.closest('.mp-feit');
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
