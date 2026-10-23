// LP Fabriek: scherm "Klantgegevens" (Pagr. stap 10). Profiel en feiten per klant, opgeslagen in Notion via
// /api/lp/klantgegevens (zie src/lp/klantgegevens.js). Gebruikt lpApi uit lp.js.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const state = { geladen: false, klant: null, kv: null, voorbeeld: {}, correcties: [] };

  function fout(tekst) {
    const e = $('kgFout');
    if (!tekst) { e.classList.add('hidden'); e.textContent = ''; return; }
    e.textContent = tekst;
    e.classList.remove('hidden');
  }
  function status(tekst) { $('kgStatus').textContent = tekst || ''; }

  function feitRij(f) {
    const d = document.createElement('div');
    d.className = 'kg-feit';
    d.dataset.id = f.id || '';
    d.innerHTML = `
      <input type="text" data-veld="label" placeholder="Naam van het feit" value="${esc(f.label)}">
      <textarea data-veld="waarde" rows="2" placeholder="Wat is het feit">${esc(f.waarde)}</textarea>
      <textarea data-veld="bron" rows="2" placeholder="Bron en datum, bijvoorbeeld: website, voettekst, gecontroleerd 14-10-2026">${esc(f.bron)}</textarea>
      <label class="kg-std"><input type="checkbox" data-veld="standaard"${f.standaard ? ' checked' : ''}> Standaard</label>
      <button type="button" class="btn btn-plain" data-actie="weg">Verwijder</button>`;
    d.querySelector('[data-actie="weg"]').addEventListener('click', () => d.remove());
    return d;
  }

  function vul(k) {
    state.klant = k;
    const p = k.profiel, b = p.bedrijf, a = b.adres;
    $('kgNaam').value = p.naam;
    $('kgBedrijfNaam').value = b.naam;
    $('kgUrl').value = b.url;
    $('kgTelefoon').value = b.telefoon;
    $('kgEmail').value = b.email;
    $('kgStraat').value = a.straat;
    $('kgPostcode').value = a.postcode;
    $('kgPlaats').value = a.plaats;
    $('kgWerkgebied').value = (b.werkgebied || []).join('\n');
    $('kgToon').value = p.toonNotitie;
    $('kgFoto').value = p.fotoRichtlijn;
    $('kgNiet').value = (p.nietToegestaan || []).join('\n');
    $('kgCtaBalken').value = String((p.ctaBalken && p.ctaBalken.aantal) === 2 ? 2 : 1);
    $('kgAutoLiveAan').checked = p.autoLive === true;
    laadAutoLive(k.id);
    state.correcties = (k.profiel.correcties || []).map((c) => ({ ...c }));
    tekenCorrecties();
    state.voorbeeld = { ...(k.profiel.voorbeeldPaginas || {}) };
    laadVoorbeelden(k.id);
    state.kv = k.profiel.klantverhaal ? JSON.parse(JSON.stringify(k.profiel.klantverhaal)) : null;
    renderKv();
    $('kgKvMelding').textContent = '';
    vulHuisstijl(k.profiel.huisstijl || {});
    $('kgHuisWaarschuwing').innerHTML = (k.waarschuwingen || []).map((w) => `<p>${esc(w)}</p>`).join('');
    const eigen = (k.eigenLettertypenInCode || []).length ? ` Eigen lettertypebestanden (${k.eigenLettertypenInCode.join(', ')}) en extra CSS staan in de code en blijven daar.` : '';
    $('kgHuisCode').textContent = (k.huisstijlEigen ? 'Afwijkingen van de standaard staan in Notion.' : (k.huisstijlVanCode ? 'Deze huisstijl komt nu uit de code. Wat je hier wijzigt komt erbovenop in Notion.' : 'Nog geen eigen huisstijl, de standaard geldt.')) + eigen;
    $('kgHuisMelding').textContent = '';
    const lijst = $('kgFeiten');
    lijst.innerHTML = '';
    k.feiten.forEach((f) => lijst.appendChild(feitRij(f)));
    $('kgBron').textContent = k.inNotion ? 'Staat in Notion' : (k.inCode ? 'Nu nog uit de code. Na opslaan staat het in Notion.' : '');
    const vars = (k.wordpressVariabelen || []).filter(Boolean).join(', ');
    $('kgTechniekTekst').textContent = vars
      ? `WordPress gegevens, formulier, SEO plugin en kleuren en lettertypen staan niet hier. De WordPress variabelen op Render zijn: ${vars}.`
      : 'WordPress gegevens, formulier, SEO plugin en kleuren en lettertypen staan niet hier.';
    status('');
  }

  // Automatisch live zetten werkt pas na 5 live pagina's. Hier alleen de uitleg en de blokkade in het scherm,
  // de server controleert het aantal zelf nog een keer (src/lp/klaarVoorLive.js).
  // Correcties die het systeem onthoudt (leren.js). Verwijderen kan hier, het bewaren gaat met Opslaan.
  function tekenCorrecties() {
    const el = $('kgCorrectiesLijst');
    if (!el) return;
    if (!state.correcties.length) { el.textContent = 'Nog geen correcties.'; return; }
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    el.innerHTML = state.correcties.map((c, i) => `<div class="wp-wrij"><div class="wp-wtekst"><span class="wp-muted">${esc(c.datum)}</span><b>Voor:</b> ${esc(c.voor)}<br><b>Na:</b> ${esc(c.na)}</div><div class="wp-idee-knoppen"><button type="button" class="btn btn-plain" data-corr="${i}">Verwijder</button></div></div>`).join('');
    el.querySelectorAll('[data-corr]').forEach((b) => b.addEventListener('click', () => { state.correcties.splice(Number(b.dataset.corr), 1); tekenCorrecties(); }));
  }

  async function laadAutoLive(klantId) {
    const vink = $('kgAutoLiveAan');
    const uitleg = $('kgAutoLiveUitleg');
    try {
      const { pages } = await lpApi('/pages?klant=' + encodeURIComponent(klantId));
      const live = pages.filter((p) => p.status === 'Gepubliceerd').length;
      const genoeg = live >= 5;
      vink.disabled = !genoeg && !vink.checked;
      uitleg.dataset.live = String(live);
      uitleg.textContent = uitleg.textContent.replace(/ Nu staan er \d+ live\.$/, '') + ` Nu staan er ${live} live.`;
    } catch (err) { /* de uitleg blijft staan, de server bewaakt de regel */ }
  }

  // Voorbeeldpagina per sjabloon: een keuzelijst met de pagina's van de klant per sjabloon.
  async function laadVoorbeelden(klantId) {
    const el = $('kgVoorbeeldLijst');
    if (!el) return;
    el.textContent = 'Laden...';
    try {
      const [{ templates }, { pages }] = await Promise.all([
        lpApi('/templates?klant=' + encodeURIComponent(klantId)),
        lpApi('/pages?klant=' + encodeURIComponent(klantId))
      ]);
      if (!state.klant || state.klant.id !== klantId) return;
      const perBlueprint = new Map();
      (templates || []).filter((t) => t.status !== 'Gearchiveerd' && t.blueprintId).forEach((t) => { if (!perBlueprint.has(t.blueprintId)) perBlueprint.set(t.blueprintId, t.naam || t.blueprintId); });
      if (!perBlueprint.size) { el.textContent = 'Deze klant heeft nog geen sjablonen.'; return; }
      el.innerHTML = '';
      perBlueprint.forEach((naam, blueprintId) => {
        const eigen = (pages || []).filter((p) => p.blueprint === blueprintId);
        const rij = document.createElement('div');
        rij.className = 'wp-veld';
        const huidig = state.voorbeeld[blueprintId] || '';
        const opties = ['<option value="">Geen keuze (laatst gepubliceerde pagina)</option>']
          .concat(eigen.map((p) => `<option value="${esc(p.id)}"${p.id.replace(/-/g, '') === huidig.replace(/-/g, '') ? ' selected' : ''}>${esc(p.titel)} (${esc(p.status)})</option>`));
        rij.innerHTML = `<label>${esc(naam)}</label><select>${opties.join('')}</select>`;
        rij.querySelector('select').addEventListener('change', (e) => {
          if (e.target.value) state.voorbeeld[blueprintId] = e.target.value; else delete state.voorbeeld[blueprintId];
          status('Vergeet niet op te slaan.');
        });
        el.appendChild(rij);
      });
    } catch (err) {
      el.textContent = 'De pagina\'s konden niet geladen worden: ' + err.message;
    }
  }

  function vulHuisstijl(h) {
    document.querySelectorAll('#kgHuisstijl [data-huis]').forEach((el) => {
      const k = el.dataset.huis;
      const w = k === 'googleFonts' ? (h[k] || []).join(', ') : (h[k] || '');
      el.value = w;
    });
    zetKleurkiezers();
  }

  function zetKleurkiezers() {
    document.querySelectorAll('#kgHuisstijl [data-kleurkies]').forEach((kies) => {
      const w = $('kgH_' + kies.dataset.kleurkies).value.trim();
      const hex = /^#([0-9a-f]{3})$/i.test(w) ? '#' + w.slice(1).split('').map((c) => c + c).join('') : w;
      kies.value = /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : '#ffffff';
    });
  }

  function leesHuisstijl() {
    const h = {};
    document.querySelectorAll('#kgHuisstijl [data-huis]').forEach((el) => { h[el.dataset.huis] = el.value; });
    return h;
  }

  document.querySelectorAll('#kgHuisstijl [data-kleurkies]').forEach((kies) => {
    kies.addEventListener('input', () => { $('kgH_' + kies.dataset.kleurkies).value = kies.value.toUpperCase(); });
  });
  document.querySelectorAll('#kgHuisstijl .kg-kleur input[type="text"]').forEach((t) => t.addEventListener('input', zetKleurkiezers));

  $('kgHuisVoorstel').addEventListener('click', async () => {
    fout('');
    const url = $('kgUrl').value.trim();
    if (!url) { fout('Vul eerst de website van de klant in bij Bedrijf.'); return; }
    const knop = $('kgHuisVoorstel');
    knop.disabled = true;
    $('kgHuisMelding').textContent = 'De website wordt uitgelezen. Dit duurt ongeveer een halve minuut...';
    try {
      const r = await lpApi('/klantgegevens/huisstijl-voorstel', { method: 'POST', body: JSON.stringify({ url }) });
      const nu = leesHuisstijl();
      vulHuisstijl({ ...nu, ...r.huisstijl, googleFonts: r.huisstijl.googleFonts || String(nu.googleFonts || '').split(',').map((x) => x.trim()).filter(Boolean) });
      const twijfels = (r.twijfels || []).length ? ' Twijfelpunten: ' + r.twijfels.join(' ') : '';
      $('kgHuisMelding').textContent = (r.samenvatting || 'Voorstel ingevuld.') + twijfels + ' Controleer de velden en sla daarna op.';
    } catch (err) { $('kgHuisMelding').textContent = ''; fout(err.message); }
    finally { knop.disabled = false; }
  });

  // ---- Klantverhaal ----
  const SECTIES = [
    { sleutel: 'waaromKiezen', titel: 'Waarom klanten kiezen', velden: [['punt', 'Punt', 'input'], ['uitleg', 'Uitleg', 'textarea']] },
    { sleutel: 'twijfels', titel: 'Twijfels van klanten en het antwoord', velden: [['twijfel', 'Twijfel', 'input'], ['antwoord', 'Antwoord', 'textarea']] },
    { sleutel: 'bewijs', titel: 'Bewijs (reviews en projecten)', velden: [['wie', 'Wie of waar', 'input'], ['tekst', 'Tekst', 'textarea']] },
    { sleutel: 'werkwijze', titel: 'Werkwijze', velden: [['stap', 'Stap', 'input'], ['uitleg', 'Uitleg', 'textarea']] }
  ];

  function bronLink(bron) {
    const b = String(bron || '');
    return /^https?:\/\//i.test(b) ? `<a href="${esc(b)}" target="_blank" rel="noopener">${esc(b)}</a>` : esc(b);
  }

  function nieuwKv() {
    return { versie: 1, status: 'concept', stem: { aanspreekvorm: 'je', kenmerken: [], voorbeeldzinnen: [] }, gezicht: null, waaromKiezen: [], twijfels: [], bewijs: [], werkwijze: [], nietGebruiken: [], tegenstrijdig: [], ontbreekt: [] };
  }

  function renderKv() {
    const kv = state.kv;
    const doel = $('kgKvInhoud');
    if (!kv) {
      doel.innerHTML = '<p class="kv-leeg">Er is nog geen klantverhaal. Klik op "Analyseer klantverhaal" om het van de website te laten opstellen. Zonder klantverhaal klinken de pagina\'s van deze klant minder persoonlijk.</p><button type="button" class="btn btn-plain" id="kgKvLeeg">Zelf een leeg klantverhaal beginnen</button>';
      $('kgKvLeeg').addEventListener('click', () => { state.kv = nieuwKv(); renderKv(); });
      return;
    }
    const delen = [];
    delen.push(`<div class="kv-status"><label><input type="checkbox" id="kgKvGoed"${kv.status === 'goedgekeurd' ? ' checked' : ''}> Goedgekeurd, gebruik dit bij Content genereren</label><label>Aanspreekvorm <select id="kgKvVorm"><option value="je"${kv.stem.aanspreekvorm === 'je' ? ' selected' : ''}>je</option><option value="u"${kv.stem.aanspreekvorm === 'u' ? ' selected' : ''}>u</option></select></label><span class="wp-muted">Status: ${kv.status === 'goedgekeurd' ? 'goedgekeurd' : 'concept'}</span></div>`);
    delen.push(`<h3 class="kv-kop">Stem van het bedrijf</h3><div class="kv-stem"><div class="wp-veld"><label for="kgKvKenmerken">Kenmerken (een per regel)</label><textarea id="kgKvKenmerken" rows="3">${esc((kv.stem.kenmerken || []).join('\n'))}</textarea></div></div>`);
    delen.push(`<h3 class="kv-kop">Voorbeeldzinnen van de eigen site</h3>${rijenKv('voorbeeldzinnen', kv.stem.voorbeeldzinnen, [['tekst', 'Zin', 'textarea']])}${plusKnop('voorbeeldzinnen')}`);
    delen.push(`<h3 class="kv-kop">Gezicht</h3>${kv.gezicht ? `<div class="kv-rij"><input type="text" data-pad="gezicht.naam" value="${esc(kv.gezicht.naam)}" placeholder="Naam"><textarea rows="3" data-pad="gezicht.tekst" placeholder="Wat deze persoon zelf zegt">${esc(kv.gezicht.tekst)}</textarea><button type="button" class="btn btn-plain" data-weg-gezicht>Verwijder</button><div class="kv-bron">Bron: ${bronLink(kv.gezicht.bron)}</div></div>` : '<p class="kv-leeg">Geen persoon gevonden op de site.</p>'}`);
    SECTIES.forEach((sec) => { delen.push(`<h3 class="kv-kop">${esc(sec.titel)}</h3>${rijenKv(sec.sleutel, kv[sec.sleutel], sec.velden)}${plusKnop(sec.sleutel)}`); });
    if ((kv.tegenstrijdig || []).length) {
      delen.push('<h3 class="kv-kop">Tegenstrijdig op de site: kies wat klopt</h3>' + kv.tegenstrijdig.map((t, i) => `<div class="kv-rij"><div>${esc(t.onderwerp)}</div><select data-keuze="${i}"><option value="">Niet noemen op de pagina\'s</option>${t.waarden.map((w) => `<option value="${esc(w.waarde)}"${t.gekozen === w.waarde ? ' selected' : ''}>${esc(w.waarde)}</option>`).join('')}</select><span></span><div class="kv-bron">${t.waarden.map((w) => `${esc(w.waarde)}: ${bronLink(w.bron)}`).join(' &nbsp; ')}</div></div>`).join(''));
    }
    if ((kv.nietGebruiken || []).length) {
      delen.push('<h3 class="kv-kop">Niet gebruiken (lege of onbewezen claims)</h3>' + kv.nietGebruiken.map((n, i) => `<div class="kv-rij"><div>${esc(n.tekst)}</div><div class="wp-muted">${esc(n.reden)}</div><button type="button" class="btn btn-plain" data-weg-niet="${i}">Verwijder</button></div>`).join(''));
    }
    if ((kv.ontbreekt || []).length) {
      delen.push('<h3 class="kv-kop">Wat de site niet vertelt (vraag dit aan de klant)</h3><ul>' + kv.ontbreekt.map((o) => `<li>${esc(o)}</li>`).join('') + '</ul>');
    }
    doel.innerHTML = delen.join('');
    koppelKv();
  }

  const NIEUW_ITEM = {
    voorbeeldzinnen: () => ({ tekst: '', bron: 'eigen aanvulling' }),
    waaromKiezen: () => ({ punt: '', uitleg: '', bron: 'eigen aanvulling', citaat: '' }),
    twijfels: () => ({ twijfel: '', antwoord: '', bron: 'eigen aanvulling', citaat: '' }),
    bewijs: () => ({ soort: 'review', wie: '', tekst: '', bron: 'eigen aanvulling', citaat: '' }),
    werkwijze: () => ({ stap: '', uitleg: '', bron: 'eigen aanvulling', citaat: '' })
  };

  function plusKnop(sleutel) {
    return `<p><button type="button" class="btn btn-plain" data-plus="${sleutel}">+ Zelf toevoegen</button></p>`;
  }

  function rijenKv(sleutel, lijst, velden) {
    if (!(lijst || []).length) return '<p class="kv-leeg">Niets gevonden op de site.</p>';
    return lijst.map((item, i) => {
      const veld = (v) => (v[2] === 'textarea'
        ? `<textarea rows="3" data-pad="${sleutel}.${i}.${v[0]}" placeholder="${esc(v[1])}">${esc(item[v[0]])}</textarea>`
        : `<input type="text" data-pad="${sleutel}.${i}.${v[0]}" value="${esc(item[v[0]])}" placeholder="${esc(v[1])}">`);
      const eerste = veld(velden[0]);
      const tweede = velden[1] ? veld(velden[1]) : '<span></span>';
      return `<div class="kv-rij">${eerste}${tweede}<button type="button" class="btn btn-plain" data-weg="${sleutel}.${i}">Verwijder</button><div class="kv-bron">Bron: ${bronLink(item.bron)}</div></div>`;
    }).join('');
  }

  function zetPad(pad, waarde) {
    const delen = pad.split('.');
    let o = delen[0] === 'voorbeeldzinnen' ? state.kv.stem : state.kv;
    for (let n = 0; n < delen.length - 1; n++) o = o[delen[n]];
    o[delen[delen.length - 1]] = waarde;
  }

  function koppelKv() {
    const kv = state.kv;
    document.querySelectorAll('#kgKvInhoud [data-pad]').forEach((el) => el.addEventListener('input', () => zetPad(el.dataset.pad, el.value)));
    document.querySelectorAll('#kgKvInhoud [data-weg]').forEach((el) => el.addEventListener('click', () => {
      const [sleutel, i] = el.dataset.weg.split('.');
      (sleutel === 'voorbeeldzinnen' ? kv.stem.voorbeeldzinnen : kv[sleutel]).splice(Number(i), 1);
      renderKv();
    }));
    document.querySelectorAll('#kgKvInhoud [data-plus]').forEach((el) => el.addEventListener('click', () => {
      const sleutel = el.dataset.plus;
      (sleutel === 'voorbeeldzinnen' ? kv.stem.voorbeeldzinnen : kv[sleutel]).push(NIEUW_ITEM[sleutel]());
      renderKv();
    }));
    document.querySelectorAll('#kgKvInhoud [data-weg-niet]').forEach((el) => el.addEventListener('click', () => { kv.nietGebruiken.splice(Number(el.dataset.wegNiet), 1); renderKv(); }));
    document.querySelectorAll('#kgKvInhoud [data-weg-gezicht]').forEach((el) => el.addEventListener('click', () => { kv.gezicht = null; renderKv(); }));
    document.querySelectorAll('#kgKvInhoud [data-keuze]').forEach((el) => el.addEventListener('change', () => { kv.tegenstrijdig[Number(el.dataset.keuze)].gekozen = el.value; }));
    $('kgKvGoed').addEventListener('change', (e) => { kv.status = e.target.checked ? 'goedgekeurd' : 'concept'; });
    $('kgKvVorm').addEventListener('change', (e) => { kv.stem.aanspreekvorm = e.target.value; });
    $('kgKvKenmerken').addEventListener('input', (e) => { kv.stem.kenmerken = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); });
  }

  $('kgKvAnalyse').addEventListener('click', async () => {
    fout('');
    if (!state.klant) return;
    if (state.kv && !window.confirm('Er staat al een klantverhaal. Een nieuwe analyse vervangt het op het scherm (opgeslagen wordt het pas als je opslaat). Doorgaan?')) return;
    const knop = $('kgKvAnalyse');
    knop.disabled = true;
    $('kgKvMelding').textContent = 'De website wordt gelezen en geordend. Dit duurt ongeveer een minuut...';
    try {
      const r = await lpApi('/klantgegevens/' + encodeURIComponent(state.klant.id) + '/klantverhaal-voorstel', { method: 'POST', body: JSON.stringify({}) });
      state.kv = r.voorstel;
      renderKv();
      const w = (r.waarschuwingen || []).map((x) => `<div class="kv-waarschuwing">${esc(x)}</div>`).join('');
      $('kgKvMelding').innerHTML = `${r.gelezen.length} pagina's gelezen. Controleer het voorstel, zet "Goedgekeurd" aan en sla op.${w}`;
    } catch (err) { $('kgKvMelding').textContent = ''; fout(err.message); }
    finally { knop.disabled = false; }
  });

  function lees() {
    const regels = (id) => $(id).value.split('\n').map((x) => x.trim()).filter(Boolean);
    return {
      profiel: {
        naam: $('kgNaam').value,
        bedrijf: {
          naam: $('kgBedrijfNaam').value,
          url: $('kgUrl').value,
          telefoon: $('kgTelefoon').value,
          email: $('kgEmail').value,
          adres: { straat: $('kgStraat').value, postcode: $('kgPostcode').value, plaats: $('kgPlaats').value, land: (state.klant && state.klant.profiel.bedrijf.adres.land) || 'NL' },
          werkgebied: regels('kgWerkgebied')
        },
        toonNotitie: $('kgToon').value,
        fotoRichtlijn: $('kgFoto').value,
        nietToegestaan: regels('kgNiet'),
        ctaBalken: { aantal: Number($('kgCtaBalken').value) === 2 ? 2 : 1 },
        klantverhaal: state.kv || undefined,
        voorbeeldPaginas: state.voorbeeld,
        autoLive: $('kgAutoLiveAan').checked,
        correcties: state.correcties,
        huisstijl: leesHuisstijl()
      },
      feiten: [...document.querySelectorAll('#kgFeiten .kg-feit')].map((r) => ({
        id: r.dataset.id,
        label: r.querySelector('[data-veld="label"]').value,
        waarde: r.querySelector('[data-veld="waarde"]').value,
        bron: r.querySelector('[data-veld="bron"]').value,
        standaard: r.querySelector('[data-veld="standaard"]').checked
      }))
    };
  }

  async function laadKlant(id) {
    fout('');
    try {
      const { klant } = await lpApi('/klantgegevens/' + encodeURIComponent(id));
      vul(klant);
    } catch (err) { fout(err.message); }
  }

  async function laadLijst(kies) {
    try {
      const { klanten } = await lpApi('/klantgegevens');
      const sel = $('kgKlant');
      sel.innerHTML = klanten.map((k) => `<option value="${esc(k.id)}">${esc(k.naam)}${k.klantverhaal === 'ontbreekt' ? ' (klantverhaal ontbreekt)' : (k.klantverhaal === 'concept' ? ' (klantverhaal nog niet goedgekeurd)' : '')}</option>`).join('') + '<option value="__nieuw">+ Nieuwe klant</option>';
      const id = kies || (klanten[0] && klanten[0].id);
      if (id) { sel.value = id; await laadKlant(id); }
    } catch (err) { fout(err.message); }
  }

  $('kgKlant').addEventListener('change', () => {
    const v = $('kgKlant').value;
    if (v === '__nieuw') { $('kgNieuwKaart').classList.remove('hidden'); $('kgFormulier').classList.add('hidden'); return; }
    $('kgNieuwKaart').classList.add('hidden');
    $('kgFormulier').classList.remove('hidden');
    laadKlant(v);
  });
  $('kgNieuwAnnuleer').addEventListener('click', () => {
    $('kgNieuwKaart').classList.add('hidden');
    $('kgFormulier').classList.remove('hidden');
    laadLijst(state.klant && state.klant.id);
  });
  $('kgNieuwNaam').addEventListener('input', () => {
    if (!$('kgNieuwId').dataset.handmatig) $('kgNieuwId').value = $('kgNieuwNaam').value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 30);
  });
  $('kgNieuwId').addEventListener('input', () => { $('kgNieuwId').dataset.handmatig = '1'; });
  $('kgNieuwMaak').addEventListener('click', async () => {
    fout('');
    const naam = $('kgNieuwNaam').value.trim();
    try {
      const { klant } = await lpApi('/klantgegevens', { method: 'POST', body: JSON.stringify({ klantId: $('kgNieuwId').value, profiel: { naam, bedrijf: { naam } }, feiten: [] }) });
      $('kgNieuwNaam').value = ''; $('kgNieuwId').value = ''; delete $('kgNieuwId').dataset.handmatig;
      $('kgNieuwKaart').classList.add('hidden');
      $('kgFormulier').classList.remove('hidden');
      await laadLijst(klant.id);
      status('Klant aangemaakt. Vul nu de gegevens en feiten in en maak daarna het klantverhaal met "Analyseer klantverhaal".');
    } catch (err) { fout(err.message); }
  });

  $('kgFeitPlus').addEventListener('click', () => {
    const rij = feitRij({ label: '', waarde: '', bron: '' });
    $('kgFeiten').appendChild(rij);
    rij.querySelector('input').focus();
  });

  $('kgBewaar').addEventListener('click', async () => {
    fout('');
    if (!state.klant) return;
    status('Bezig met opslaan...');
    try {
      const { klant } = await lpApi('/klantgegevens/' + encodeURIComponent(state.klant.id), { method: 'PUT', body: JSON.stringify(lees()) });
      vul(klant);
      status('Opgeslagen in Notion.');
    } catch (err) { status(''); fout(err.message); }
  });

  document.querySelectorAll('#lpTabNav .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const actief = btn.dataset.lpTab === 'klantgegevens';
      $('lpKlantgegevensTab').classList.toggle('hidden', !actief);
      if (actief && !state.geladen) { state.geladen = true; laadLijst(); }
    });
  });
})();
