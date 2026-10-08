// LP Fabriek: "Festivalpagina maken" in het tabblad WordPress kloon (zie src/lp/festivalKloon.js).
// Draait los van lp-kloon.js; gebruikt lpApi, setBtnLoading en formatApiError uit lp.js, en de selects voor klant
// en bronpagina uit het kloonscherm.
(function () {
  const $ = (id) => document.getElementById(id);
  const state = { klant: null, bron: null, bronUrl: '', velden: [], huidig: new Map(), historie: [], feiten: [], doelId: null };

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

  async function ververVoorbeeld() {
    const frame = $('lpFestFrame');
    try {
      const r = await lpApi('/kloon/festival/voorbeeld', {
        method: 'POST',
        body: JSON.stringify({ klant: state.klant, bronUrl: state.bronUrl, wijzigingen: wijzigingen().map((w) => ({ oud: w.oud, nieuw: w.nieuw, soort: w.soort, node: w.node, pad: w.pad, module: w.module })) })
      });
      frame.srcdoc = r.html;
      $('lpFestInfo').dataset.nietGevonden = String(r.nietGevonden || 0);
      toonInfo(r.nietGevonden || 0);
    } catch (err) {
      toonFout(formatApiError(err));
    }
  }

  let laatsteWaarschuwingen = [];
  function toonInfo(nietGevonden) {
    const f = state.festival || {};
    const delen = [f.naam, f.plaats, f.datum, f.tijden, f.locatie].filter(Boolean);
    $('lpFestInfo').textContent = `Gegevens gebruikt: ${delen.join(', ') || 'alleen wat je zelf invulde'}.`;
    const lijst = $('lpFestWaarschuwingen');
    lijst.innerHTML = '';
    laatsteWaarschuwingen.forEach((w) => lijst.appendChild(el('li', { text: w })));
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
        .map((v) => ({ id: v.id, groep: v.groep, label: v.label, huidig: state.huidig.get(v.id) }));
      const r = await lpApi('/kloon/festival/aanpassen', { method: 'POST', body: JSON.stringify({ klant: state.klant, instructie, velden, feiten: state.feiten }) });
      if (!r.voorstellen.length) {
        laatsteWaarschuwingen = ['De AI vond niets om te veranderen. Zeg het wat concreter, bijvoorbeeld welke tekst of kop je bedoelt.'];
        toonInfo(Number($('lpFestInfo').dataset.nietGevonden || 0));
        return;
      }
      bewaarStap();
      r.voorstellen.forEach((v) => state.huidig.set(v.id, v.waarde));
      laatsteWaarschuwingen = [`${r.voorstellen.length} tekst(en) aangepast.`, ...(r.waarschuwingen || [])];
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
        body: JSON.stringify({ klant: state.klant, bron: state.bron, titel, velden, zoekvervang: [], bijwerken: state.doelId || undefined, dryRun: false })
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
