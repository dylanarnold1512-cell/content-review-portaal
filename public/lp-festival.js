// LP Fabriek: "Festivalpagina maken" in het tabblad WordPress kloon (zie src/lp/festivalKloon.js).
// Draait los van lp-kloon.js; gebruikt lpApi, setBtnLoading en formatApiError uit lp.js, en de selects voor klant
// en bronpagina uit het kloonscherm.
(function () {
  const $ = (id) => document.getElementById(id);
  const state = { blokken: [], blokDoel: null, portaalPaginas: null, klant: null, bron: null, bronUrl: '', velden: [], huidig: new Map(), historie: [], feiten: [], doelId: null };

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
    if (!e) return;
    if (!tekst) { e.classList.add('hidden'); return; }
    e.textContent = tekst;
    e.classList.remove('hidden');
    e.scrollIntoView({ block: 'nearest' });
  }

  const origineel = (id) => (state.velden.find((v) => v.id === id) || {}).waarde;
  const wijzigingen = () => state.velden
    .filter((v) => state.huidig.has(v.id) && state.huidig.get(v.id) !== v.waarde)
    .map((v) => ({ id: v.id, node: v.node, pad: v.pad, module: v.module, soort: v.soort, oud: v.waarde, nieuw: state.huidig.get(v.id) }));

  function bewaarStap() {
    state.historie.push(new Map(state.huidig));
    if (state.historie.length > 30) state.historie.shift();
  }

  // Wijzigingen die in het voorbeeld zelf zijn getypt komen als bericht binnen.
  let tekstenTimer = null;
  window.addEventListener('message', (e) => {
    const frame = $('lpFestFrame');
    if (!frame || e.source !== frame.contentWindow) return;
    const d = e.data;
    if (d && d.lpfBlok && typeof d.lpfBlok.node === 'string') { openBlokPaneel(d.lpfBlok.node, d.lpfBlok.waar === 'voor' ? 'voor' : 'na'); return; }
    if (!d || typeof d.lpf !== 'string' || typeof d.waarde !== 'string') return;
    if (!state.velden.some((v) => v.id === d.lpf)) return;
    if (d.start) bewaarStap();
    state.huidig.set(d.lpf, d.waarde);
    clearTimeout(tekstenTimer);
    tekstenTimer = setTimeout(bouwTekstenLijst, 600);
  });

  // -- Blokken uit het portaal in het voorbeeld zetten --
  async function openBlokPaneel(node, waar) {
    toonFout('');
    state.blokDoel = { node, waar };
    const veld = state.velden.find((v) => v.node === node);
    $('lpFestBlokTitel').textContent = `Blok ${waar === 'voor' ? 'boven' : 'onder'} ${veld ? veld.groep : 'dit onderdeel'}`;
    $('lpFestBlokPaneel').classList.remove('hidden');
    try {
      if (!state.portaalPaginas) state.portaalPaginas = (await lpApi(`/kloon/portaalpaginas?klant=${encodeURIComponent(state.klant)}`)).paginas;
      const pag = $('lpFestBlokPagina');
      if (!state.portaalPaginas.length) { pag.innerHTML = ''; return toonFout('Deze klant heeft nog geen portaalpagina\'s met een sjabloon om een blok uit te halen.'); }
      if (!pag.options.length) {
        state.portaalPaginas.forEach((p) => pag.appendChild(el('option', { value: p.id, text: p.titel })));
        pag.addEventListener('change', laadBlokSecties);
        $('lpFestBlokSectie').addEventListener('change', vulBlokDelen);
        await laadBlokSecties();
      }
      $('lpFestBlokPaneel').scrollIntoView({ block: 'nearest' });
    } catch (err) {
      toonFout(formatApiError(err));
    }
  }

  let blokSecties = [];
  async function laadBlokSecties() {
    const sec = $('lpFestBlokSectie');
    sec.innerHTML = '';
    try {
      const r = await lpApi(`/kloon/secties?klant=${encodeURIComponent(state.klant)}&pagina=${encodeURIComponent($('lpFestBlokPagina').value)}`);
      blokSecties = r.secties;
      blokSecties.forEach((s) => sec.appendChild(el('option', { value: s.index, text: s.label })));
    } catch (err) {
      blokSecties = [];
      toonFout(formatApiError(err));
    }
    vulBlokDelen();
  }

  function vulBlokDelen() {
    const deel = $('lpFestBlokDeel');
    deel.innerHTML = '';
    const sec = blokSecties.find((x) => String(x.index) === $('lpFestBlokSectie').value);
    deel.appendChild(el('option', { value: '', text: 'Hele onderdeel' }));
    ((sec && sec.delen) || []).forEach((d) => deel.appendChild(el('option', { value: d.index, text: `Alleen: ${d.label}` })));
  }

  function toonBlokLijst() {
    const houder = $('lpFestBlokLijst');
    houder.innerHTML = '';
    state.blokken.forEach((b, i) => {
      houder.appendChild(el('div', { style: 'display:flex;gap:10px;align-items:center;font-size:13px;margin:3px 0;' }, [
        el('span', { text: `Blok ${i + 1}: ${b.label} (${b.waar === 'voor' ? 'boven' : 'onder'} ${b.plekNaam})` }),
        el('button', { type: 'button', class: 'btn-plain', text: 'Weghalen', onclick: async () => { state.blokken.splice(i, 1); toonBlokLijst(); await ververVoorbeeld(); } })
      ]));
    });
  }

  $('lpFestBlokAnnuleerBtn').addEventListener('click', () => $('lpFestBlokPaneel').classList.add('hidden'));
  $('lpFestBlokOkBtn').addEventListener('click', async () => {
    toonFout('');
    if (!state.blokDoel) return;
    const body = { klant: state.klant, pagina: $('lpFestBlokPagina').value, sectie: $('lpFestBlokSectie').value, deel: $('lpFestBlokDeel').value };
    if (!body.pagina || body.sectie === '') return toonFout('Kies eerst een onderdeel.');
    const btn = $('lpFestBlokOkBtn');
    setBtnLoading(btn, true, 'Bezig...');
    try {
      const r = await lpApi('/kloon/blokvoorbeeld', { method: 'POST', body: JSON.stringify(body) });
      const veld = state.velden.find((v) => v.node === state.blokDoel.node);
      state.blokken.push({ ...body, html: r.html, label: String(r.titel || 'blok').replace(/^[^:]*:\s*/, ''), na: state.blokDoel.node, waar: state.blokDoel.waar, plekNaam: veld ? veld.groep : 'onderdeel' });
      $('lpFestBlokPaneel').classList.add('hidden');
      toonBlokLijst();
      await ververVoorbeeld();
    } catch (err) {
      toonFout(formatApiError(err));
    } finally {
      setBtnLoading(btn, false);
    }
  });

  async function ververVoorbeeld() {
    const frame = $('lpFestFrame');
    try {
      const r = await lpApi('/kloon/festival/voorbeeld', {
        method: 'POST',
        body: JSON.stringify({ klant: state.klant, bronUrl: state.bronUrl, blokken: state.blokken.map((b) => ({ html: b.html, na: b.na, waar: b.waar })), bewerkbaar: state.velden.filter((v) => v.soort === 'tekst' && (v.module === 'heading' || v.module === 'rich-text')).map((v) => ({ id: v.id, node: v.node, pad: v.pad, module: v.module })), wijzigingen: wijzigingen().map((w) => ({ oud: w.oud, nieuw: w.nieuw, soort: w.soort, node: w.node, pad: w.pad, module: w.module })) })
      });
      frame.srcdoc = r.html;
      $('lpFestInfo').dataset.nietGevonden = String(r.nietGevonden || 0);
      toonInfo(r.nietGevonden || 0, r.blokkenNietGevonden || 0);
    } catch (err) {
      toonFout(formatApiError(err));
    }
  }

  let laatsteWaarschuwingen = [];
  function toonInfo(nietGevonden, blokkenNietGevonden) {
    const f = state.festival || {};
    const delen = [f.naam, f.plaats, f.datum, f.tijden, f.locatie].filter(Boolean);
    $('lpFestInfo').textContent = `Gegevens gebruikt: ${delen.join(', ') || 'alleen wat je zelf invulde'}.`;
    const lijst = $('lpFestWaarschuwingen');
    lijst.innerHTML = '';
    laatsteWaarschuwingen.forEach((w) => lijst.appendChild(el('li', { text: w })));
    if (blokkenNietGevonden) lijst.appendChild(el('li', { text: `${blokkenNietGevonden} blok(ken) konden niet in het voorbeeld worden gezet. Kies een ander onderdeel als plek.` }));
    if (nietGevonden) lijst.appendChild(el('li', { text: `${nietGevonden} aangepaste tekst(en) zijn niet in het voorbeeld te tonen (de site schrijft ze net anders). Ze gaan wel gewoon mee naar het concept.` }));
  }

  function bouwTekstenLijst() {
    const houder = $('lpFestTeksten');
    houder.innerHTML = '';
    state.velden.filter((v) => v.soort === 'tekst' && v.waarde && (v.standaardAi || state.huidig.get(v.id) !== v.waarde)).forEach((v) => {
      const lang = String(v.waarde).length > 90 || /[\n<]/.test(String(v.waarde));
      const invoer = lang ? el('textarea', { class: 'lp-json-textarea', style: 'min-height:90px;', spellcheck: 'true' }) : el('input', { type: 'text', autocomplete: 'off' });
      invoer.value = state.huidig.get(v.id);
      invoer.addEventListener('input', () => { state.huidig.set(v.id, invoer.value); });
      houder.appendChild(el('div', { class: 'kloon-veld' }, [el('label', { text: `${v.groep}, ${v.label}` }), invoer]));
    });
  }

  $('lpFestStartBtn').addEventListener('click', async () => {
    toonFout('');
    const klant = $('lpKloonKlant').value;
    const bron = $('lpKloonBron').value;
    const naam = $('lpFestNaam').value.trim();
    if (!klant || !bron) return toonFout('Kies eerst een klant en een bronpagina.');
    if (!naam) return toonFout('Vul de naam van het festival in.');
    const btn = $('lpFestStartBtn');
    setBtnLoading(btn, true, 'Bezig met lezen en schrijven...');
    try {
      const r = await lpApi('/kloon/festival/start', {
        method: 'POST',
        body: JSON.stringify({ klant, bron, festivalNaam: naam, festivalUrl: $('lpFestUrl').value.trim(), plaats: $('lpFestPlaats').value.trim(), wensen: $('lpFestWensen').value.trim() })
      });
      state.klant = klant;
      state.bron = r.bron;
      state.bronUrl = r.bronUrl;
      state.velden = r.velden;
      state.festival = r.festival;
      state.feiten = r.feiten;
      state.huidig = new Map(r.velden.map((v) => [v.id, v.waarde]));
      r.voorstellen.forEach((v) => state.huidig.set(v.id, v.waarde));
      state.historie = [];
      state.doelId = null;
      state.blokken = [];
      toonBlokLijst();
      laatsteWaarschuwingen = r.waarschuwingen || [];
      $('lpFestTitel').value = `Overnachten bij ${r.festival.naam}`;
      $('lpFestMaakBtn').textContent = 'Zet als concept in WordPress';
      $('lpFestResultaat').classList.add('hidden');
      $('lpFestWerk').classList.remove('hidden');
      bouwTekstenLijst();
      toonInfo(0);
      await ververVoorbeeld();
      $('lpFestWerk').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      toonFout(formatApiError(err));
    } finally {
      setBtnLoading(btn, false);
    }
  });

  $('lpFestPasAanBtn').addEventListener('click', async () => {
    toonFout('');
    const instructie = $('lpFestInstructie').value.trim();
    if (!instructie) return toonFout('Typ eerst wat er anders moet.');
    const btn = $('lpFestPasAanBtn');
    setBtnLoading(btn, true, 'De AI past aan...');
    try {
      const velden = state.velden.filter((v) => v.soort === 'tekst' && (state.huidig.get(v.id) || '').trim())
        .map((v) => ({ id: v.id, node: v.node, groep: v.groep, label: v.label, huidig: state.huidig.get(v.id) }));
      const r = await lpApi('/kloon/festival/aanpassen', { method: 'POST', body: JSON.stringify({ klant: state.klant, instructie, velden, feiten: state.feiten }) });
      const nieuweBlokken = r.blokken || [];
      if (!r.voorstellen.length && !nieuweBlokken.length) {
        laatsteWaarschuwingen = ['De AI vond niets om te veranderen. Zeg het wat concreter, bijvoorbeeld welke tekst of kop je bedoelt.'];
        toonInfo(Number($('lpFestInfo').dataset.nietGevonden || 0));
        return;
      }
      bewaarStap();
      r.voorstellen.forEach((v) => state.huidig.set(v.id, v.waarde));
      nieuweBlokken.forEach((b) => state.blokken.push({ html: b.html, na: b.na, waar: b.waar, label: b.titel, plekNaam: b.plekNaam || 'onderdeel', eigen: true }));
      toonBlokLijst();
      laatsteWaarschuwingen = [`${r.voorstellen.length} tekst(en) aangepast${nieuweBlokken.length ? ` en ${nieuweBlokken.length} blok(ken) toegevoegd` : ''}.`, ...(r.waarschuwingen || [])];
      $('lpFestInstructie').value = '';
      bouwTekstenLijst();
      await ververVoorbeeld();
    } catch (err) {
      toonFout(formatApiError(err));
    } finally {
      setBtnLoading(btn, false);
    }
  });

  $('lpFestOngedaanBtn').addEventListener('click', async () => {
    const vorige = state.historie.pop();
    if (!vorige) return toonFout('Er is niets om ongedaan te maken.');
    state.huidig = vorige;
    laatsteWaarschuwingen = [];
    bouwTekstenLijst();
    await ververVoorbeeld();
  });

  $('lpFestVerversBtn').addEventListener('click', async () => {
    bewaarStap();
    await ververVoorbeeld();
  });

  $('lpFestMaakBtn').addEventListener('click', async () => {
    toonFout('');
    const titel = $('lpFestTitel').value.trim();
    if (!titel) return toonFout('Vul een titel in voor de pagina.');
    const tekst = state.doelId ? 'Het concept in WordPress wordt overschreven met deze versie. Doorgaan?' : 'Er wordt een concept aangemaakt op de site van de klant. Doorgaan?';
    if (!window.confirm(tekst)) return;
    const btn = $('lpFestMaakBtn');
    setBtnLoading(btn, true, 'Bezig...');
    try {
      const velden = wijzigingen().map((w) => ({ node: w.node, pad: w.pad, waarde: w.nieuw }));
      const r = await lpApi('/kloon/maak', {
        method: 'POST',
        body: JSON.stringify({ klant: state.klant, bron: state.bron, titel, velden, zoekvervang: [], blokken: state.blokken.map((b) => (b.eigen ? { html: b.html, titel: b.label, plek: `${b.waar}:${b.na}` } : { pagina: b.pagina, sectie: b.sectie, deel: b.deel, plek: `${b.waar}:${b.na}` })), bijwerken: state.doelId || undefined, dryRun: false })
      });
      state.doelId = r.id;
      const houder = $('lpFestResultaat');
      houder.innerHTML = '';
      const doos = el('div', { class: 'kloon-resultaat' });
      doos.appendChild(el('strong', { text: `Concept ${r.bijgewerkt ? 'bijgewerkt' : 'aangemaakt'} (pagina nr. ${r.id}). Het staat niet live.` }));
      const links = el('p');
      [['Openen in de builder', r.builderUrl], ['Bewerken in WordPress', r.bewerkUrl], ['Voorbeeld', r.url]].forEach(([t, u]) => {
        if (!u) return;
        links.appendChild(el('a', { href: u, target: '_blank', rel: 'noopener', text: t }));
        links.appendChild(document.createTextNode('   '));
      });
      doos.appendChild(links);
      if (r.waarschuwingen && r.waarschuwingen.length) {
        const lijst = el('ul');
        r.waarschuwingen.forEach((w) => lijst.appendChild(el('li', { text: w })));
        doos.appendChild(lijst);
      }
      houder.appendChild(doos);
      houder.classList.remove('hidden');
      const lijstKnop = $('lpKloonLijstBtn');
      if (lijstKnop) lijstKnop.click();
    } catch (err) {
      toonFout(formatApiError(err));
    } finally {
      setBtnLoading(btn, false);
      btn.textContent = state.doelId ? 'Werk het concept bij' : 'Zet als concept in WordPress';
    }
  });
})();
