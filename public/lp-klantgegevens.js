// LP Fabriek: scherm "Klantgegevens" (Pagr. stap 10). Profiel en feiten per klant, opgeslagen in Notion via
// /api/lp/klantgegevens (zie src/lp/klantgegevens.js). Gebruikt lpApi uit lp.js.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const state = { geladen: false, klant: null };

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
      sel.innerHTML = klanten.map((k) => `<option value="${esc(k.id)}">${esc(k.naam)}</option>`).join('') + '<option value="__nieuw">+ Nieuwe klant</option>';
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
      status('Klant aangemaakt. Vul nu de gegevens en feiten in.');
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
