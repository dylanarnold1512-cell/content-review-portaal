// LP Fabriek: scherm "WordPress kloon" (zie src/lp/wpKloon.js en src/routes/lpKloon.js).
// Draait los van lp.js maar gebruikt de hulpfuncties daaruit (lpApi, setBtnLoading, formatApiError).
(function () {
  const $ = (id) => document.getElementById(id);
  const state = { klanten: [], klant: null, bron: null, velden: [], wijzigingen: new Map(), fotos: new Map(), geladen: false, mediaVeld: null, media: { search: '', page: 1, totalPages: 1 } };

  const stijl = document.createElement('style');
  stijl.textContent = `
    .kloon-groep { border: 1px solid #e7e2d9; border-radius: 12px; padding: 12px 14px; margin: 12px 0; background: #fff; }
    .kloon-groep h4 { margin: 0 0 8px; font-size: 14px; }
    .kloon-veld { margin: 8px 0; }
    .kloon-veld label { display: block; font-size: 12px; opacity: .75; margin-bottom: 3px; }
    .kloon-veld textarea, .kloon-veld input[type=text] { width: 100%; box-sizing: border-box; }
    .kloon-veld.gewijzigd textarea, .kloon-veld.gewijzigd input[type=text] { border-color: #e0a800; box-shadow: 0 0 0 2px rgba(224,168,0,.25); }
    .kloon-veld .kloon-ai { font-size: 12px; margin-left: 8px; }
    .kloon-zoekrij { display: flex; gap: 8px; margin: 6px 0; flex-wrap: wrap; }
    .kloon-zoekrij input { flex: 1; min-width: 160px; }
    .kloon-foto { display: flex; align-items: center; gap: 10px; }
    .kloon-foto img { width: 64px; height: 48px; object-fit: cover; border-radius: 6px; }
    .kloon-resultaat { border: 1px solid #cfe6d0; background: #f3faf3; border-radius: 12px; padding: 12px 14px; }
    .kloon-resultaat.controle { border-color: #e7e2d9; background: #faf8f4; }
  `;
  document.head.appendChild(stijl);

  function el(tag, opties = {}, kinderen = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(opties)) {
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const kind of kinderen) n.appendChild(typeof kind === 'string' ? document.createTextNode(kind) : kind);
    return n;
  }

  function toonFout(tekst) {
    const e = $('lpKloonError');
    if (!tekst) { e.classList.add('hidden'); return; }
    e.textContent = tekst;
    e.classList.remove('hidden');
  }

  // Tabbladen: lp.js verbergt de bekende panelen zelf, dit paneel verbergen we hier.
  document.querySelectorAll('#lpTabNav .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const actief = btn.dataset.lpTab === 'kloon';
      $('lpKloonTab').classList.toggle('hidden', !actief);
      if (actief) { laadBronnen(); laadLijst(); }
    });
  });

  function datumTekst(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function renderLijst(klonen) {
    const houder = $('lpKloonLijst');
    houder.innerHTML = '';
    if (!klonen.length) { houder.textContent = 'Nog geen klonen gemaakt.'; return; }
    const tabel = el('table', { class: 'admin-table' });
    tabel.appendChild(el('thead', {}, [el('tr', {}, ['Pagina', 'Status', 'Gemaakt', 'Bron', 'Links'].map((t) => el('th', { text: t })))]));
    const body = el('tbody');
    klonen.forEach((k) => {
      const links = el('td');
      [['Builder', k.builderUrl], ['Bewerken', k.bewerkUrl], [k.status === 'publish' ? 'Bekijken' : 'Voorbeeld', k.url]].forEach(([tekst, url]) => {
        if (!url) return;
        links.appendChild(el('a', { href: url, target: '_blank', rel: 'noopener', text: tekst }));
        links.appendChild(document.createTextNode('  '));
      });
      body.appendChild(el('tr', {}, [
        el('td', { text: `${k.titel} (nr. ${k.id})` }),
        el('td', { text: k.statusNaam }),
        el('td', { text: datumTekst(k.datum) }),
        el('td', { text: k.bronTitel || (k.bron ? `nr. ${k.bron}` : '') }),
        links
      ]));
    });
    tabel.appendChild(body);
    houder.appendChild(tabel);
  }

  async function laadLijst() {
    const klant = $('lpKloonKlant').value || (state.klanten[0] && state.klanten[0].id);
    const houder = $('lpKloonLijst');
    if (!klant) {
      // De klantenlijst is nog niet geladen: laadBronnen roept dit opnieuw aan zodra die er is.
      return;
    }
    try {
      const { klonen } = await lpApi(`/kloon/klonen?klant=${encodeURIComponent(klant)}`);
      renderLijst(klonen);
    } catch (err) {
      houder.textContent = `Lijst niet beschikbaar: ${formatApiError(err)}`;
    }
  }
  $('lpKloonLijstBtn').addEventListener('click', laadLijst);

  async function laadBronnen() {
    if (state.geladen) return;
    try {
      const { klanten } = await lpApi('/kloon/bronnen');
      state.klanten = klanten;
      const klantSel = $('lpKloonKlant');
      klantSel.innerHTML = '';
      klanten.forEach((k) => klantSel.appendChild(el('option', { value: k.id, text: k.naam })));
      klantSel.onchange = vulBronnen;
      vulBronnen();
      state.geladen = true;
      laadLijst();
      if (!klanten.length) toonFout('Er zijn nog geen klanten met een bronpagina. Voeg kloonBronnen toe aan het klantprofiel.');
    } catch (err) {
      toonFout(formatApiError(err));
    }
  }

  function vulBronnen() {
    const klant = state.klanten.find((k) => k.id === $('lpKloonKlant').value);
    const sel = $('lpKloonBron');
    sel.innerHTML = '';
    ((klant && klant.bronnen) || []).forEach((b) => sel.appendChild(el('option', { value: b.id, text: `${b.naam} (nr. ${b.id})` })));
  }

  $('lpKloonVeldenBtn').addEventListener('click', async () => {
    toonFout('');
    const btn = $('lpKloonVeldenBtn');
    const klant = $('lpKloonKlant').value;
    const bron = $('lpKloonBron').value;
    if (!klant || !bron) return toonFout('Kies eerst een klant en een bronpagina.');
    setBtnLoading(btn, true, 'Velden ophalen...');
    try {
      const data = await lpApi('/kloon/velden', { method: 'POST', body: JSON.stringify({ klant, bron }) });
      state.klant = klant;
      state.bron = data.bron;
      state.velden = data.velden;
      state.wijzigingen = new Map();
      state.fotos = new Map();
      $('lpKloonTitel').value = '';
      $('lpKloonSlug').value = '';
      $('lpKloonZoekRijen').innerHTML = '';
      $('lpKloonBlokRijen').innerHTML = '';
      voegZoekRijToe();
      renderVelden();
      $('lpKloonResultaat').classList.add('hidden');
      $('lpKloonEditor').classList.remove('hidden');
    } catch (err) {
      toonFout(formatApiError(err));
    } finally {
      setBtnLoading(btn, false);
    }
  });

  function voegZoekRijToe() {
    const rij = el('div', { class: 'kloon-zoekrij' }, [
      el('input', { type: 'text', placeholder: 'Zoek (bv. Breda)', 'data-rol': 'zoek' }),
      el('input', { type: 'text', placeholder: 'Vervang door (bv. Eindhoven)', 'data-rol': 'vervang' })
    ]);
    $('lpKloonZoekRijen').appendChild(rij);
  }
  $('lpKloonZoekAddBtn').addEventListener('click', voegZoekRijToe);

  // -- Blokken uit het portaal --
  async function portaalPaginas() {
    if (state.portaalPaginas && state.portaalKlant === state.klant) return state.portaalPaginas;
    const data = await lpApi(`/kloon/portaalpaginas?klant=${encodeURIComponent(state.klant)}`);
    state.portaalPaginas = data.paginas;
    state.portaalKlant = state.klant;
    return data.paginas;
  }

  function plaatsOpties() {
    const gezien = new Set();
    const opties = [];
    state.velden.forEach((v) => {
      if (gezien.has(v.node)) return;
      gezien.add(v.node);
      opties.push({ node: v.node, label: v.groep });
    });
    return opties;
  }

  async function voegBlokRijToe() {
    toonFout('');
    try {
      const paginas = await portaalPaginas();
      if (!paginas.length) return toonFout('Deze klant heeft nog geen portaalpagina\'s.');
      const pagSel = el('select', { 'data-rol': 'pagina' }, paginas.map((p) => el('option', { value: p.id, text: p.titel })));
      const secSel = el('select', { 'data-rol': 'sectie' });
      const naSel = el('select', { 'data-rol': 'na' }, plaatsOpties().map((o) => el('option', { value: o.node, text: `na: ${o.label}` })));
      const laadSecties = async () => {
        secSel.innerHTML = '';
        try {
          const { secties } = await lpApi(`/kloon/secties?klant=${encodeURIComponent(state.klant)}&pagina=${encodeURIComponent(pagSel.value)}`);
          secties.forEach((s) => secSel.appendChild(el('option', { value: s.index, text: s.label })));
          if (!secties.length) secSel.appendChild(el('option', { value: '', text: '(geen onderdelen)' }));
        } catch (err) {
          secSel.appendChild(el('option', { value: '', text: '(laden mislukt)' }));
          toonFout(formatApiError(err));
        }
      };
      pagSel.addEventListener('change', laadSecties);
      const rij = el('div', { class: 'kloon-zoekrij' }, [
        pagSel, secSel, naSel,
        el('button', { type: 'button', class: 'btn-plain', text: 'Weghalen', onclick: () => rij.remove() })
      ]);
      $('lpKloonBlokRijen').appendChild(rij);
      laadSecties();
    } catch (err) {
      toonFout(formatApiError(err));
    }
  }
  $('lpKloonBlokAddBtn').addEventListener('click', voegBlokRijToe);

  function verzamelBlokken() {
    return [...document.querySelectorAll('#lpKloonBlokRijen > div')].map((rij) => ({
      pagina: rij.querySelector('[data-rol="pagina"]').value,
      sectie: rij.querySelector('[data-rol="sectie"]').value,
      na: rij.querySelector('[data-rol="na"]').value
    })).filter((b) => b.pagina && b.sectie !== '' && b.na);
  }

  function huidigeWaarde(veld) {
    return state.wijzigingen.has(veld.id) ? state.wijzigingen.get(veld.id) : veld.waarde;
  }

  function renderVelden() {
    const houder = $('lpKloonVelden');
    houder.innerHTML = '';
    let groepNaam = null;
    let groepEl = null;
    state.velden.forEach((veld) => {
      if (veld.groep !== groepNaam) {
        groepNaam = veld.groep;
        groepEl = el('div', { class: 'kloon-groep' }, [el('h4', { text: groepNaam })]);
        houder.appendChild(groepEl);
      }
      groepEl.appendChild(renderVeld(veld));
    });
  }

  function renderVeld(veld) {
    const wrap = el('div', { class: 'kloon-veld', 'data-veld': veld.id });
    const label = el('label', { text: veld.label });
    wrap.appendChild(label);
    if (veld.soort === 'afbeelding') {
      const foto = state.fotos.get(veld.id);
      const rij = el('div', { class: 'kloon-foto' });
      if (foto) rij.appendChild(el('img', { src: foto.thumbnail || foto.url, alt: foto.alt || '' }));
      rij.appendChild(el('span', { text: foto ? `Nieuwe foto: ${foto.titel || foto.id}` : `Huidige foto (nr. ${veld.waarde})` }));
      rij.appendChild(el('button', { type: 'button', class: 'btn-plain', text: 'Andere foto kiezen', onclick: () => openMedia(veld) }));
      wrap.appendChild(rij);
      wrap.classList.toggle('gewijzigd', Boolean(foto));
      return wrap;
    }
    const lang = String(veld.waarde || '').length > 90 || /[\n<]/.test(String(veld.waarde || ''));
    const invoer = lang
      ? el('textarea', { class: 'lp-json-textarea', style: `min-height:${Math.min(220, 54 + Math.floor(String(veld.waarde).length / 3))}px;`, spellcheck: 'true' })
      : el('input', { type: 'text', autocomplete: 'off' });
    invoer.value = huidigeWaarde(veld);
    wrap.classList.toggle('gewijzigd', invoer.value !== veld.waarde);
    invoer.addEventListener('input', () => {
      if (invoer.value === veld.waarde) state.wijzigingen.delete(veld.id);
      else state.wijzigingen.set(veld.id, invoer.value);
      wrap.classList.toggle('gewijzigd', invoer.value !== veld.waarde);
    });
    wrap.appendChild(invoer);
    if (veld.soort === 'tekst') {
      const vink = el('input', { type: 'checkbox', 'data-ai': veld.id });
      vink.checked = Boolean(veld.standaardAi);
      label.appendChild(el('span', { class: 'kloon-ai' }, [vink, ' AI mag dit herschrijven']));
    }
    return wrap;
  }

  // -- AI voorstel --
  $('lpKloonVoorstelBtn').addEventListener('click', async () => {
    toonFout('');
    const info = $('lpKloonVoorstelInfo');
    info.classList.add('hidden');
    const opdracht = $('lpKloonOpdracht').value.trim();
    const geselecteerd = [...document.querySelectorAll('#lpKloonVelden input[data-ai]')].filter((c) => c.checked).map((c) => c.dataset.ai);
    const velden = state.velden.filter((v) => geselecteerd.includes(v.id)).map((v) => ({ id: v.id, groep: v.groep, label: v.label, huidig: huidigeWaarde(v) }));
    if (!opdracht) return toonFout('Vul eerst in waar de nieuwe pagina over gaat.');
    if (!velden.length) return toonFout('Vink minstens één tekstveld aan dat de AI mag herschrijven.');
    const btn = $('lpKloonVoorstelBtn');
    setBtnLoading(btn, true, 'De AI schrijft...');
    try {
      const { voorstellen, waarschuwingen } = await lpApi('/kloon/voorstel', { method: 'POST', body: JSON.stringify({ klant: state.klant, opdracht, velden }) });
      voorstellen.forEach((v) => {
        const veld = state.velden.find((x) => x.id === v.id);
        if (!veld) return;
        if (v.waarde === veld.waarde) state.wijzigingen.delete(v.id);
        else state.wijzigingen.set(v.id, v.waarde);
      });
      renderVelden();
      // vinkjes opnieuw zetten zoals ze stonden
      document.querySelectorAll('#lpKloonVelden input[data-ai]').forEach((c) => { c.checked = geselecteerd.includes(c.dataset.ai); });
      info.textContent = `${voorstellen.length} tekst(en) voorgesteld. ${(waarschuwingen || []).join(' ')} Lees ze door en pas aan waar nodig.`;
      info.classList.remove('hidden');
    } catch (err) {
      toonFout(formatApiError(err));
    } finally {
      setBtnLoading(btn, false);
    }
  });

  // -- Fotokiezer --
  function bouwMediaOverlay() {
    if ($('lpKloonMediaOverlay')) return;
    const overlay = el('div', { id: 'lpKloonMediaOverlay', class: 'lp-modal-overlay hidden' }, [
      el('div', { class: 'lp-modal-box' }, [
        el('div', { class: 'lp-modal-header' }, [
          el('strong', { text: 'Foto kiezen' }),
          el('button', { type: 'button', class: 'btn-plain', text: 'Sluiten', onclick: () => overlay.classList.add('hidden') })
        ]),
        el('div', { class: 'lp-field-row', style: 'max-width:320px;' }, [
          el('label', { for: 'lpKloonMediaZoek', text: 'Zoekterm (optioneel)' }),
          el('input', { type: 'text', id: 'lpKloonMediaZoek', autocomplete: 'off' })
        ]),
        el('button', { type: 'button', id: 'lpKloonMediaZoekBtn', class: 'btn-plain', text: 'Zoeken', onclick: () => zoekMedia(false) }),
        el('p', { id: 'lpKloonMediaFout', class: 'admin-error hidden' }),
        el('div', { id: 'lpKloonMediaGrid', class: 'lp-media-grid' }),
        el('button', { type: 'button', id: 'lpKloonMediaMeer', class: 'btn-plain hidden', text: 'Meer laden', onclick: () => zoekMedia(true) })
      ])
    ]);
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.classList.add('hidden'); });
    document.body.appendChild(overlay);
  }

  function openMedia(veld) {
    bouwMediaOverlay();
    state.mediaVeld = veld;
    $('lpKloonMediaZoek').value = '';
    $('lpKloonMediaOverlay').classList.remove('hidden');
    zoekMedia(false);
  }

  async function zoekMedia(meer) {
    const fout = $('lpKloonMediaFout');
    fout.classList.add('hidden');
    const pagina = meer ? state.media.page + 1 : 1;
    const zoek = meer ? state.media.search : $('lpKloonMediaZoek').value.trim();
    try {
      const qs = new URLSearchParams({ page: String(pagina) });
      if (zoek) qs.set('search', zoek);
      const data = await lpApi(`/clients/${state.klant}/media?${qs.toString()}`);
      state.media = { search: zoek, page: data.page, totalPages: data.totalPages };
      const grid = $('lpKloonMediaGrid');
      if (!meer) grid.innerHTML = '';
      if (!data.media.length && !meer) grid.appendChild(el('p', { class: 'admin-footnote', text: 'Niets gevonden.' }));
      data.media.forEach((item) => {
        const kaart = el('div', { class: 'lp-media-item' }, [
          el('img', { src: item.thumbnail, alt: item.alt || '', loading: 'lazy' }),
          el('span', { text: item.titel || '(zonder titel)' })
        ]);
        kaart.addEventListener('click', () => kiesFoto(item));
        grid.appendChild(kaart);
      });
      $('lpKloonMediaMeer').classList.toggle('hidden', !(data.page < data.totalPages));
    } catch (err) {
      fout.textContent = formatApiError(err);
      fout.classList.remove('hidden');
    }
  }

  function kiesFoto(item) {
    const veld = state.mediaVeld;
    if (!veld) return;
    state.fotos.set(veld.id, item);
    $('lpKloonMediaOverlay').classList.add('hidden');
    const oud = document.querySelector(`#lpKloonVelden [data-veld="${CSS.escape(veld.id)}"]`);
    if (oud) oud.replaceWith(renderVeld(veld));
  }

  // -- Aanmaken --
  function verzamelVerzoek(dryRun) {
    const velden = [];
    state.velden.forEach((v) => {
      if (v.soort === 'afbeelding') {
        const foto = state.fotos.get(v.id);
        if (foto) velden.push({ node: v.node, pad: v.pad, attachment: foto.id });
      } else if (state.wijzigingen.has(v.id)) {
        velden.push({ node: v.node, pad: v.pad, waarde: state.wijzigingen.get(v.id) });
      }
    });
    const zoekvervang = [...document.querySelectorAll('#lpKloonZoekRijen .kloon-zoekrij')]
      .map((rij) => ({ zoek: rij.querySelector('[data-rol=zoek]').value, vervang: rij.querySelector('[data-rol=vervang]').value }))
      .filter((z) => z.zoek.trim());
    return {
      klant: state.klant,
      bron: state.bron,
      titel: $('lpKloonTitel').value.trim(),
      slug: $('lpKloonSlug').value.trim(),
      metaTitel: $('lpKloonMetaTitel').value.trim(),
      metaBeschrijving: $('lpKloonMetaBeschrijving').value.trim(),
      velden,
      zoekvervang,
      blokken: verzamelBlokken(),
      dryRun
    };
  }

  function toonResultaat(r) {
    const houder = $('lpKloonResultaat');
    houder.innerHTML = '';
    const doos = el('div', { class: 'kloon-resultaat' + (r.dryRun ? ' controle' : '') });
    if (r.dryRun) {
      doos.appendChild(el('strong', { text: 'Controle gelukt, er is niets aangemaakt.' }));
      doos.appendChild(el('p', { text: `${r.wijzigingen} wijziging(en) zouden worden doorgevoerd.` }));
    } else {
      doos.appendChild(el('strong', { text: `Concept aangemaakt (pagina nr. ${r.id}, status ${r.status}).` }));
      doos.appendChild(el('p', { text: `${r.wijzigingen} wijziging(en) doorgevoerd.` }));
      const links = el('p');
      [['Openen in de builder', r.builderUrl], ['Bewerken in WordPress', r.bewerkUrl], ['Voorbeeld', r.url]].forEach(([tekst, url]) => {
        if (!url) return;
        links.appendChild(el('a', { href: url, target: '_blank', rel: 'noopener', text: tekst }));
        links.appendChild(document.createTextNode('   '));
      });
      doos.appendChild(links);
    }
    if (r.waarschuwingen.length) {
      doos.appendChild(el('p', { text: 'Let op:' }));
      const lijst = el('ul');
      r.waarschuwingen.forEach((w) => lijst.appendChild(el('li', { text: w })));
      doos.appendChild(lijst);
    }
    houder.appendChild(doos);
    houder.classList.remove('hidden');
  }

  async function verstuur(dryRun) {
    toonFout('');
    const verzoek = verzamelVerzoek(dryRun);
    if (!verzoek.titel) return toonFout('Vul een titel in voor de nieuwe pagina.');
    if (!dryRun && !window.confirm('Er wordt een nieuw concept aangemaakt op de site van de klant. Doorgaan?')) return;
    const btn = dryRun ? $('lpKloonControleBtn') : $('lpKloonMaakBtn');
    setBtnLoading(btn, true, dryRun ? 'Controleren...' : 'Aanmaken...');
    try {
      const r = await lpApi('/kloon/maak', { method: 'POST', body: JSON.stringify(verzoek) });
      toonResultaat(r);
      if (!dryRun) laadLijst();
    } catch (err) {
      toonFout(formatApiError(err));
    } finally {
      setBtnLoading(btn, false);
    }
  }
  $('lpKloonControleBtn').addEventListener('click', () => verstuur(true));
  $('lpKloonMaakBtn').addEventListener('click', () => verstuur(false));
})();
