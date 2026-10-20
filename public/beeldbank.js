// Beeldbank-tabblad: afbeeldingen aanleveren. De browser verkleint elke afbeelding (maximaal 1600 pixels breed,
// WebP) en stuurt hem naar het portaal. Het systeem bepaalt zelf de map, bestandsnaam en alt tekst.
// Is het systeem er niet zeker van, dan kiest de gebruiker hier een map.
(function () {
  const MAX_BREEDTE = 1600;
  const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  let clientId = '';
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function apiBb(pad, opties) {
    const res = await fetch('/api' + pad, opties || { headers: { 'Content-Type': 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.melding || 'Er ging iets mis.');
    return data;
  }

  // Verkleint een bestand naar maximaal MAX_BREEDTE pixels breed. WebP waar de browser dat kan, anders JPG.
  async function verklein(bestand) {
    const bitmap = await createImageBitmap(bestand, { imageOrientation: 'from-image' });
    const schaal = Math.min(1, MAX_BREEDTE / bitmap.width);
    const breedte = Math.max(1, Math.round(bitmap.width * schaal));
    const hoogte = Math.max(1, Math.round(bitmap.height * schaal));
    const canvas = document.createElement('canvas');
    canvas.width = breedte;
    canvas.height = hoogte;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, breedte, hoogte);
    if (bitmap.close) bitmap.close();
    let blob = await new Promise((ok) => canvas.toBlob(ok, 'image/webp', 0.82));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
    const dataBase64 = await new Promise((ok, fout) => {
      const lezer = new FileReader();
      lezer.onload = () => ok(String(lezer.result).split(',')[1] || '');
      lezer.onerror = () => fout(new Error('Lezen mislukt'));
      lezer.readAsDataURL(blob);
    });
    return { dataBase64, mime: blob.type, breedte, hoogte, bytes: blob.size };
  }

  function rijHtml(r) {
    let status = '';
    if (r.fase === 'bezig') status = '<span class="bb-status bb-bezig">Bezig met verkleinen en indelen...</span>';
    else if (r.fase === 'geplaatst') status = '<span class="bb-status bb-goed">Geplaatst in map "' + esc(r.map) + '"' + (r.nieuweMap ? ' (nieuwe map)' : '') + '</span><div class="bb-sub">' + esc(r.naam) + '<br>' + esc(r.alt) + '</div>';
    else if (r.fase === 'duplicaat') status = '<span class="bb-status bb-let-op">Deze afbeelding staat er al.</span>';
    else if (r.fase === 'fout') status = '<span class="bb-status bb-fout">' + esc(r.melding) + '</span>';
    else if (r.fase === 'onzeker') {
      const opties = (r.bestaandeMappen || []).map((m) => '<option value="' + esc(m) + '"' + (m === r.voorstelMap ? ' selected' : '') + '>' + esc(m) + '</option>').join('');
      status = '<span class="bb-status bb-let-op">Kies zelf een map</span>'
        + '<div class="bb-kies"><select data-bb-map>' + '<option value="">Kies een bestaande map</option>' + opties + '</select>'
        + '<input type="text" data-bb-nieuw maxlength="40" placeholder="of typ een nieuwe mapnaam" value="' + esc(r.bestaandeMappen && r.bestaandeMappen.includes(r.voorstelMap) ? '' : (r.voorstelMap || '')) + '">'
        + '<button type="button" class="p-knop p-knop-hoofd" data-bb-plaats="' + r.id + '">Plaatsen</button></div>';
    }
    return '<li class="bb-rij" data-id="' + r.id + '"><div class="bb-naam">' + esc(r.bestand) + '</div><div class="bb-info">' + status + '</div></li>';
  }

  const rijen = [];
  let teller = 0;
  function teken() {
    const lijst = el('bbVoortgang');
    if (!lijst) return;
    lijst.innerHTML = rijen.map(rijHtml).join('');
    lijst.classList.toggle('hidden', !rijen.length);
  }

  async function verstuur(r, mapNaam) {
    r.fase = 'bezig';
    teken();
    try {
      const hint = (el('bbHint') && el('bbHint').value || '').trim();
      const antwoord = await apiBb('/' + clientId + '/beeldbank/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...r.payload, hint, mapNaam: mapNaam || '' })
      });
      if (antwoord.status === 'geplaatst') {
        Object.assign(r, { fase: 'geplaatst', map: antwoord.map, naam: antwoord.bestandsnaam, alt: antwoord.alt, nieuweMap: antwoord.nieuweMap });
        r.payload = null;
        laadLijst();
      } else if (antwoord.status === 'duplicaat') {
        Object.assign(r, { fase: 'duplicaat' });
        r.payload = null;
      } else if (antwoord.status === 'onzeker') {
        Object.assign(r, { fase: 'onzeker', voorstelMap: antwoord.voorstelMap, bestaandeMappen: antwoord.bestaandeMappen || [] });
      } else {
        Object.assign(r, { fase: 'fout', melding: antwoord.melding || 'Plaatsen is niet gelukt.' });
        r.payload = null;
      }
    } catch (err) {
      Object.assign(r, { fase: 'fout', melding: err.message });
      r.payload = null;
    }
    teken();
  }

  async function verwerkBestanden(bestanden) {
    for (const bestand of Array.from(bestanden)) {
      const r = { id: ++teller, bestand: bestand.name, fase: 'bezig' };
      rijen.unshift(r);
      teken();
      if (!TYPES.includes(bestand.type)) {
        Object.assign(r, { fase: 'fout', melding: 'Alleen JPG, PNG of WebP kan.' });
        teken();
        continue;
      }
      try {
        const v = await verklein(bestand);
        r.payload = { dataBase64: v.dataBase64, mime: v.mime, breedte: v.breedte, hoogte: v.hoogte, bestandsnaam: bestand.name };
      } catch (err) {
        Object.assign(r, { fase: 'fout', melding: 'Deze afbeelding kon niet gelezen worden.' });
        teken();
        continue;
      }
      await verstuur(r, '');
    }
  }

  function tekenLijst(afbeeldingen) {
    const lijst = el('bbLijst');
    if (!lijst) return;
    if (!afbeeldingen.length) {
      lijst.innerHTML = '<tr><td colspan="3" class="kd-leeg">Er staan nog geen afbeeldingen in de beeldbank.</td></tr>';
      return;
    }
    lijst.innerHTML = afbeeldingen.map((a) => '<tr><td>' + esc(a.map) + '</td><td>' + esc(a.bestandsnaam) + '</td><td>' + esc(a.alt) + '</td></tr>').join('');
  }

  async function laadLijst() {
    try {
      const data = await apiBb('/' + clientId + '/beeldbank');
      tekenLijst(data.afbeeldingen || []);
    } catch (err) {
      const lijst = el('bbLijst');
      if (lijst) lijst.innerHTML = '<tr><td colspan="3" class="kd-leeg">De lijst laadt even niet.</td></tr>';
    }
  }

  function koppel() {
    const invoer = el('bbBestand');
    if (invoer && !invoer.dataset.gekoppeld) {
      invoer.dataset.gekoppeld = '1';
      invoer.addEventListener('change', () => { if (invoer.files && invoer.files.length) verwerkBestanden(invoer.files); invoer.value = ''; });
    }
    const zone = el('bbDropzone');
    if (zone && !zone.dataset.gekoppeld) {
      zone.dataset.gekoppeld = '1';
      ['dragenter', 'dragover'].forEach((n) => zone.addEventListener(n, (e) => { e.preventDefault(); zone.classList.add('sleep'); }));
      ['dragleave', 'drop'].forEach((n) => zone.addEventListener(n, (e) => { e.preventDefault(); zone.classList.remove('sleep'); }));
      zone.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) verwerkBestanden(e.dataTransfer.files); });
    }
    const voortgang = el('bbVoortgang');
    if (voortgang && !voortgang.dataset.gekoppeld) {
      voortgang.dataset.gekoppeld = '1';
      voortgang.addEventListener('click', (e) => {
        const knop = e.target.closest('[data-bb-plaats]');
        if (!knop) return;
        const r = rijen.find((x) => String(x.id) === knop.dataset.bbPlaats);
        const rij = knop.closest('.bb-rij');
        if (!r || !rij || !r.payload) return;
        const gekozen = (rij.querySelector('[data-bb-nieuw]').value || '').trim() || rij.querySelector('[data-bb-map]').value;
        if (!gekozen) return;
        verstuur(r, gekozen);
      });
    }
  }

  async function controleer(id) {
    clientId = id;
    const knop = el('beeldbankTabBtn');
    try {
      const data = await apiBb('/' + clientId + '/beeldbank');
      if (knop) knop.classList.toggle('hidden', !data.beschikbaar);
    } catch (err) {
      if (knop) knop.classList.add('hidden');
    }
  }

  window.checkBeeldbank = controleer;
  window.loadBeeldbank = function () { koppel(); laadLijst(); };
})();
