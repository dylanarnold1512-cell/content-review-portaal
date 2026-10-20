// LP Fabriek: scherm "Tekst vervangen" (zie src/lp/tekstVervangen.js en de routes /clients/:id/tekst-vervangen/zoek
// en /pages/:id/tekst-vervangen in src/routes/lp.js). Gebruikt lpApi, setBtnLoading en formatApiError uit lp.js.
(function () {
  const $ = (id) => document.getElementById(id);
  const state = { paginas: [], bezig: false };

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
    const e = $('lpVervangError');
    if (!tekst) { e.classList.add('hidden'); return; }
    e.textContent = tekst;
    e.classList.remove('hidden');
  }

  const WP_NAMEN = { publish: 'Live', draft: 'Concept', pending: 'In afwachting', private: 'Privé', future: 'Gepland', onbekend: 'Onbekend', 'niet gepubliceerd': 'Niet in WordPress' };
  function wpNaam(status) { return WP_NAMEN[status] || status; }

  async function vulKlanten() {
    const select = $('lpVervangKlant');
    if (select.options.length) return;
    try {
      const { clients } = await lpApi('/clients');
      select.innerHTML = clients.map((c) => `<option value="${c.id}">${c.naam}</option>`).join('');
    } catch (err) { toonFout(err.message); }
  }

  document.querySelectorAll('#lpTabNav .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const actief = btn.dataset.lpTab === 'vervang';
      $('lpVervangTab').classList.toggle('hidden', !actief);
      if (actief) vulKlanten();
    });
  });

  function geselecteerd() {
    return [...document.querySelectorAll('#lpVervangBody input[type=checkbox]')].filter((c) => c.checked && !c.disabled).map((c) => state.paginas.find((p) => p.id === c.dataset.id)).filter(Boolean);
  }

  function resetBevestiging() {
    $('lpVervangBevestig').classList.add('hidden');
    $('lpVervangAnnuleerBtn').classList.add('hidden');
    $('lpVervangUitvoerBtn').textContent = 'Aanpassen...';
    $('lpVervangUitvoerBtn').dataset.stap = '';
  }

  function renderResultaat(data) {
    state.paginas = data.paginas;
    $('lpVervangResultaat').classList.remove('hidden');
    const w = $('lpVervangWaarschuwing');
    w.textContent = data.statusWaarschuwing || '';
    w.classList.toggle('hidden', !data.statusWaarschuwing);
    const metTekst = data.paginas.filter((p) => !p.fout);
    $('lpVervangSamenvatting').textContent = data.paginas.length
      ? `${metTekst.length} van ${data.totaalGescand} pagina's bevatten deze tekst.`
      : `Geen enkele van de ${data.totaalGescand} pagina's bevat deze tekst.`;
    const body = $('lpVervangBody');
    body.innerHTML = '';
    data.paginas.forEach((p) => {
      const cb = el('input', { type: 'checkbox', 'data-id': p.id });
      cb.checked = !p.fout;
      cb.disabled = !!p.fout;
      body.appendChild(el('tr', { 'data-rij': p.id }, [
        el('td', {}, [cb]),
        el('td', {}, [p.wpUrl ? el('a', { href: p.wpUrl, target: '_blank', rel: 'noopener', text: p.titel }) : document.createTextNode(p.titel)]),
        el('td', { text: wpNaam(p.wpStatus) }),
        el('td', { text: p.velden.join(', ') }),
        el('td', { text: p.fout ? '' : `...${p.fragment}...` }),
        el('td', { 'data-uitkomst': p.id, text: p.fout ? `Kon niet worden gelezen: ${p.fout}` : '' })
      ]));
    });
    $('lpVervangUitvoerBtn').disabled = !metTekst.length;
    resetBevestiging();
  }

  $('lpVervangAlles').addEventListener('change', (e) => {
    document.querySelectorAll('#lpVervangBody input[type=checkbox]').forEach((c) => { if (!c.disabled) c.checked = e.target.checked; });
    resetBevestiging();
  });
  $('lpVervangBody').addEventListener('change', resetBevestiging);
  $('lpVervangPubliceer').addEventListener('change', resetBevestiging);

  $('lpVervangZoekBtn').addEventListener('click', async () => {
    toonFout('');
    const btn = $('lpVervangZoekBtn');
    setBtnLoading(btn, true, 'Zoeken...');
    try {
      const data = await lpApi(`/clients/${encodeURIComponent($('lpVervangKlant').value)}/tekst-vervangen/zoek`, {
        method: 'POST',
        body: JSON.stringify({ zoek: $('lpVervangZoek').value, slotKey: $('lpVervangVeld').value.trim() || undefined })
      });
      renderResultaat(data);
    } catch (err) { toonFout(formatApiError(err)); } finally { setBtnLoading(btn, false); }
  });

  $('lpVervangAnnuleerBtn').addEventListener('click', resetBevestiging);

  $('lpVervangUitvoerBtn').addEventListener('click', async () => {
    const btn = $('lpVervangUitvoerBtn');
    const gekozen = geselecteerd();
    if (!gekozen.length || state.bezig) return;
    const publiceer = $('lpVervangPubliceer').checked;
    // Stap 1: eerst een duidelijke bevestiging met de aantallen.
    if (btn.dataset.stap !== 'bevestig') {
      const live = gekozen.filter((p) => p.wpStatus === 'publish').length;
      const nieuw = $('lpVervangNieuw').value;
      const wat = nieuw.trim() ? 'vervangen door de nieuwe tekst' : 'verwijderd';
      let tekst = `De tekst wordt bij ${gekozen.length} pagina's ${wat}.`;
      if (publiceer) tekst += live ? (live === 1 ? ' 1 daarvan staat live in WordPress: die blijft live, maar toont meteen de nieuwe tekst.' : ` ${live} daarvan staan live in WordPress: die blijven live, maar tonen meteen de nieuwe tekst.`) : ' Geen enkele staat live in WordPress.';
      else tekst += ' Alleen het portaal wordt aangepast, WordPress niet.';
      $('lpVervangBevestig').textContent = tekst;
      $('lpVervangBevestig').classList.remove('hidden');
      $('lpVervangAnnuleerBtn').classList.remove('hidden');
      btn.textContent = 'Ja, uitvoeren';
      btn.dataset.stap = 'bevestig';
      return;
    }
    // Stap 2: pagina voor pagina uitvoeren, zodat een fout bij een pagina de rest niet stopt.
    state.bezig = true;
    toonFout('');
    $('lpVervangAnnuleerBtn').classList.add('hidden');
    $('lpVervangBevestig').classList.add('hidden');
    btn.disabled = true;
    btn.dataset.stap = '';
    let gelukt = 0;
    let mislukt = 0;
    for (let i = 0; i < gekozen.length; i++) {
      const p = gekozen[i];
      const cel = document.querySelector(`[data-uitkomst="${p.id}"]`);
      btn.textContent = `Bezig (${i + 1} van ${gekozen.length})...`;
      cel.textContent = 'Bezig...';
      try {
        const r = await lpApi(`/pages/${encodeURIComponent(p.id)}/tekst-vervangen`, {
          method: 'POST',
          body: JSON.stringify({
            zoek: $('lpVervangZoek').value,
            vervang: $('lpVervangNieuw').value,
            slotKey: $('lpVervangVeld').value.trim() || undefined,
            heleVeld: $('lpVervangHeel').checked,
            publiceer
          })
        });
        if (!r.opgeslagen) { cel.textContent = r.melding || 'Niets aangepast.'; continue; }
        gelukt += 1;
        const delen = ['Aangepast in het portaal'];
        if (r.gepubliceerd) delen.push(`bijgewerkt in WordPress (${wpNaam(r.wpStatus || p.wpStatus)})`);
        if (r.melding) delen.push(r.melding);
        cel.textContent = delen.join(', ') + '.';
      } catch (err) {
        mislukt += 1;
        cel.textContent = `Mislukt: ${err.message}`;
      }
    }
    state.bezig = false;
    btn.disabled = false;
    btn.textContent = 'Aanpassen...';
    $('lpVervangSamenvatting').textContent = `Klaar: ${gelukt} pagina's aangepast${mislukt ? `, ${mislukt} mislukt (zie de tabel)` : ''}.`;
  });
  // ---- Pagina's opnieuw naar WordPress sturen (zonder tekst te veranderen) ----
  const opnieuw = { paginas: [], bezig: false };

  function opnieuwGeselecteerd() {
    return [...document.querySelectorAll('#lpOpnieuwBody input[type=checkbox]')].filter((c) => c.checked).map((c) => opnieuw.paginas.find((p) => p.id === c.dataset.id)).filter(Boolean);
  }
  function opnieuwReset() {
    $('lpOpnieuwBevestig').classList.add('hidden');
    $('lpOpnieuwAnnuleerBtn').classList.add('hidden');
    $('lpOpnieuwUitvoerBtn').textContent = 'Opnieuw sturen...';
    $('lpOpnieuwUitvoerBtn').dataset.stap = '';
  }

  $('lpOpnieuwLijstBtn').addEventListener('click', async () => {
    toonFout('');
    const btn = $('lpOpnieuwLijstBtn');
    setBtnLoading(btn, true, 'Laden...');
    try {
      const data = await lpApi(`/clients/${encodeURIComponent($('lpVervangKlant').value)}/opnieuw-publiceren/lijst`, { method: 'POST', body: '{}' });
      opnieuw.paginas = data.paginas;
      $('lpOpnieuwResultaat').classList.remove('hidden');
      const w = $('lpOpnieuwWaarschuwing');
      w.textContent = data.statusWaarschuwing || (data.paginas.length ? `${data.paginas.length} pagina's staan in WordPress.` : 'Deze klant heeft nog geen pagina\'s in WordPress.');
      w.classList.remove('hidden');
      const body = $('lpOpnieuwBody');
      body.innerHTML = '';
      data.paginas.forEach((p) => {
        const cb = el('input', { type: 'checkbox', 'data-id': p.id });
        body.appendChild(el('tr', {}, [
          el('td', {}, [cb]),
          el('td', {}, [p.wpUrl ? el('a', { href: p.wpUrl, target: '_blank', rel: 'noopener', text: p.titel }) : document.createTextNode(p.titel)]),
          el('td', { text: wpNaam(p.wpStatus) }),
          el('td', { 'data-opnieuw-uitkomst': p.id, text: '' })
        ]));
      });
      $('lpOpnieuwAlles').checked = false;
      $('lpOpnieuwUitvoerBtn').disabled = !data.paginas.length;
      opnieuwReset();
    } catch (err) { toonFout(formatApiError(err)); } finally { setBtnLoading(btn, false); }
  });

  $('lpOpnieuwAlles').addEventListener('change', (e) => {
    document.querySelectorAll('#lpOpnieuwBody input[type=checkbox]').forEach((c) => { c.checked = e.target.checked; });
    opnieuwReset();
  });
  $('lpOpnieuwBody').addEventListener('change', opnieuwReset);
  $('lpOpnieuwAnnuleerBtn').addEventListener('click', opnieuwReset);

  $('lpOpnieuwUitvoerBtn').addEventListener('click', async () => {
    const btn = $('lpOpnieuwUitvoerBtn');
    const gekozen = opnieuwGeselecteerd();
    if (!gekozen.length || opnieuw.bezig) return;
    if (btn.dataset.stap !== 'bevestig') {
      const live = gekozen.filter((p) => p.wpStatus === 'publish').length;
      let tekst = `${gekozen.length} pagina's worden opnieuw naar WordPress gestuurd, met dezelfde tekst.`;
      if (live) tekst += live === 1 ? ' 1 daarvan staat live: die blijft live, maar toont meteen de nieuwe opbouw.' : ` ${live} daarvan staan live: die blijven live, maar tonen meteen de nieuwe opbouw.`;
      $('lpOpnieuwBevestig').textContent = tekst;
      $('lpOpnieuwBevestig').classList.remove('hidden');
      $('lpOpnieuwAnnuleerBtn').classList.remove('hidden');
      btn.textContent = 'Ja, versturen';
      btn.dataset.stap = 'bevestig';
      return;
    }
    opnieuw.bezig = true;
    toonFout('');
    $('lpOpnieuwAnnuleerBtn').classList.add('hidden');
    $('lpOpnieuwBevestig').classList.add('hidden');
    btn.disabled = true;
    btn.dataset.stap = '';
    let gelukt = 0;
    let mislukt = 0;
    for (let i = 0; i < gekozen.length; i++) {
      const p = gekozen[i];
      const cel = document.querySelector(`[data-opnieuw-uitkomst="${p.id}"]`);
      btn.textContent = `Bezig (${i + 1} van ${gekozen.length})...`;
      cel.textContent = 'Bezig...';
      try {
        const r = await lpApi(`/pages/${encodeURIComponent(p.id)}/opnieuw-publiceren`, { method: 'POST', body: '{}' });
        gelukt += 1;
        const delen = [`Bijgewerkt in WordPress (${wpNaam(r.wpStatus || p.wpStatus)})`, `${r.ctaBalken} offertebalk${r.ctaBalken === 1 ? '' : 'en'} op de pagina`];
        if (r.melding) delen.push(r.melding);
        cel.textContent = delen.join(', ') + '.';
      } catch (err) {
        mislukt += 1;
        cel.textContent = `Mislukt: ${err.message}`;
      }
    }
    opnieuw.bezig = false;
    btn.disabled = false;
    btn.textContent = 'Opnieuw sturen...';
    $('lpOpnieuwWaarschuwing').textContent = `Klaar: ${gelukt} pagina's bijgewerkt${mislukt ? `, ${mislukt} mislukt (zie de tabel)` : ''}.`;
  });

  // ---- Pagina's opnieuw laten schrijven (19-10-2026) ----
  const schrijf = { paginas: [], bezig: false };
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

  function schrijfGeselecteerd() {
    return [...document.querySelectorAll('#lpSchrijfBody input[type=checkbox]')].filter((c) => c.checked).map((c) => schrijf.paginas.find((p) => p.id === c.dataset.id)).filter(Boolean);
  }
  function schrijfReset() {
    $('lpSchrijfBevestig').classList.add('hidden');
    $('lpSchrijfAnnuleerBtn').classList.add('hidden');
    $('lpSchrijfUitvoerBtn').textContent = 'Opnieuw laten schrijven...';
    $('lpSchrijfUitvoerBtn').dataset.stap = '';
  }

  $('lpSchrijfLijstBtn').addEventListener('click', async () => {
    toonFout('');
    const btn = $('lpSchrijfLijstBtn');
    setBtnLoading(btn, true, 'Laden...');
    try {
      const data = await lpApi(`/clients/${encodeURIComponent($('lpVervangKlant').value)}/opnieuw-publiceren/lijst`, { method: 'POST', body: '{}' });
      schrijf.paginas = data.paginas;
      $('lpSchrijfResultaat').classList.remove('hidden');
      const w = $('lpSchrijfWaarschuwing');
      w.textContent = data.statusWaarschuwing || (data.paginas.length ? `${data.paginas.length} pagina's staan in WordPress.` : 'Deze klant heeft nog geen pagina\'s in WordPress.');
      w.classList.remove('hidden');
      const body = $('lpSchrijfBody');
      body.innerHTML = '';
      data.paginas.forEach((p) => {
        const cb = el('input', { type: 'checkbox', 'data-id': p.id });
        body.appendChild(el('tr', {}, [
          el('td', {}, [cb]),
          el('td', {}, [p.wpUrl ? el('a', { href: p.wpUrl, target: '_blank', rel: 'noopener', text: p.titel }) : document.createTextNode(p.titel)]),
          el('td', { text: wpNaam(p.wpStatus) }),
          el('td', { 'data-schrijf-uitkomst': p.id, text: '' })
        ]));
      });
      $('lpSchrijfAlles').checked = false;
      $('lpSchrijfUitvoerBtn').disabled = !data.paginas.length;
      schrijfReset();
    } catch (err) { toonFout(formatApiError(err)); } finally { setBtnLoading(btn, false); }
  });

  $('lpSchrijfAlles').addEventListener('change', (e) => {
    document.querySelectorAll('#lpSchrijfBody input[type=checkbox]').forEach((c) => { c.checked = e.target.checked; });
    schrijfReset();
  });
  $('lpSchrijfBody').addEventListener('change', schrijfReset);
  $('lpSchrijfPubliceer').addEventListener('change', schrijfReset);
  $('lpSchrijfAnnuleerBtn').addEventListener('click', schrijfReset);

  // Een pagina in de wachtrij zetten (de server werkt de wachtrij een voor een af) en daarna wachten op de uitkomst.
  async function schrijfInWachtrij(id, publiceer) {
    await lpApi(`/pages/${encodeURIComponent(id)}/schrijf-opnieuw`, { method: 'POST', body: JSON.stringify({ publiceer }) });
  }
  async function schrijfWachtOp(id) {
    let onbekend = 0;
    for (let i = 0; i < 900; i++) {
      await wacht(4000);
      const s = await lpApi(`/pages/${encodeURIComponent(id)}/schrijf-status`);
      if (s.tekstStatus && s.tekstStatus.status === 'fout') throw new Error(s.tekstStatus.fout || 'Schrijven mislukt.');
      if (s.tekstStatus) { onbekend = 0; continue; }
      if (s.uitkomst) return s.uitkomst;
      onbekend += 1;
      if (onbekend >= 3) throw new Error('De uitkomst is niet terug te vinden. Controleer de pagina zelf.');
    }
    throw new Error('Het duurde te lang. Controleer de pagina zelf.');
  }

  $('lpSchrijfUitvoerBtn').addEventListener('click', async () => {
    const btn = $('lpSchrijfUitvoerBtn');
    const gekozen = schrijfGeselecteerd();
    if (!gekozen.length || schrijf.bezig) return;
    const publiceer = $('lpSchrijfPubliceer').checked;
    if (btn.dataset.stap !== 'bevestig') {
      const live = gekozen.filter((p) => p.wpStatus === 'publish').length;
      let tekst = `${gekozen.length} pagina's worden opnieuw geschreven. De huidige tekst in het portaal wordt vervangen.`;
      tekst += publiceer
        ? ' De nieuwe tekst gaat meteen naar dezelfde WordPress pagina.'
        : ' Er gaat niets naar WordPress, je controleert eerst en stuurt daarna zelf.';
      if (publiceer && live) tekst += live === 1 ? ' 1 daarvan staat live: die blijft live en toont meteen de nieuwe tekst.' : ` ${live} daarvan staan live: die blijven live en tonen meteen de nieuwe tekst.`;
      $('lpSchrijfBevestig').textContent = tekst;
      $('lpSchrijfBevestig').classList.remove('hidden');
      $('lpSchrijfAnnuleerBtn').classList.remove('hidden');
      btn.textContent = 'Ja, opnieuw schrijven';
      btn.dataset.stap = 'bevestig';
      return;
    }
    schrijf.bezig = true;
    toonFout('');
    $('lpSchrijfAnnuleerBtn').classList.add('hidden');
    $('lpSchrijfBevestig').classList.add('hidden');
    btn.disabled = true;
    btn.dataset.stap = '';
    let gelukt = 0;
    let mislukt = 0;
    // Eerst alles in de wachtrij zetten: de server schrijft daarna door, ook als je dit scherm sluit.
    const gezet = [];
    for (const p of gekozen) {
      const cel = document.querySelector(`[data-schrijf-uitkomst="${p.id}"]`);
      try {
        await schrijfInWachtrij(p.id, publiceer);
        cel.textContent = 'In de wachtrij...';
        gezet.push(p);
      } catch (err) {
        mislukt += 1;
        cel.textContent = `Mislukt: ${err.message}`;
      }
    }
    $('lpSchrijfWaarschuwing').textContent = `${gezet.length} pagina's staan in de wachtrij. De server schrijft ze een voor een, ongeveer twee minuten per pagina. Je mag dit scherm sluiten: wat klaar is staat gewoon in het portaal.`;
    for (let i = 0; i < gezet.length; i++) {
      const p = gezet[i];
      const cel = document.querySelector(`[data-schrijf-uitkomst="${p.id}"]`);
      btn.textContent = `Bezig (${i + 1} van ${gezet.length})...`;
      try {
        const u = await schrijfWachtOp(p.id);
        gelukt += 1;
        const delen = ['Nieuwe tekst opgeslagen in het portaal'];
        if (publiceer && u.wpStatus) delen.push(`bijgewerkt in WordPress (${wpNaam(u.wpStatus)})`);
        if (u.wpMelding) delen.push(u.wpMelding);
        if (u.waarschuwing) delen.push(u.waarschuwing);
        cel.textContent = delen.join(', ') + '.';
      } catch (err) {
        mislukt += 1;
        cel.textContent = `Mislukt: ${err.message}`;
      }
    }
    schrijf.bezig = false;
    btn.disabled = false;
    btn.textContent = 'Opnieuw laten schrijven...';
    $('lpSchrijfWaarschuwing').textContent = `Klaar: ${gelukt} pagina's opnieuw geschreven${mislukt ? `, ${mislukt} mislukt (zie de tabel)` : ''}.`;
  });

  // ---- Een onderdeel overnemen van een voorbeeldpagina (20-10-2026) ----
  const ond = { paginas: [], onderdelen: [], bron: null, bezig: false };

  function ondReset() {
    $('lpOndBevestig').classList.add('hidden');
    $('lpOndAnnuleerBtn').classList.add('hidden');
    $('lpOndUitvoerBtn').textContent = 'Overnemen...';
    $('lpOndUitvoerBtn').dataset.stap = '';
  }
  function ondGeselecteerd() {
    return [...document.querySelectorAll('#lpOndBody input[type=checkbox]')].filter((c) => c.checked && !c.disabled).map((c) => ond.paginas.find((p) => p.id === c.dataset.id)).filter(Boolean);
  }
  function ondTabel() {
    const bron = ond.paginas.find((p) => p.id === $('lpOndBron').value);
    const body = $('lpOndBody');
    body.innerHTML = '';
    const doelen = ond.paginas.filter((p) => bron && p.id !== bron.id && p.blueprint === bron.blueprint);
    doelen.forEach((p) => {
      const cb = el('input', { type: 'checkbox', 'data-id': p.id });
      cb.checked = true;
      body.appendChild(el('tr', {}, [
        el('td', {}, [cb]),
        el('td', {}, [p.wpUrl ? el('a', { href: p.wpUrl, target: '_blank', rel: 'noopener', text: p.titel }) : document.createTextNode(p.titel)]),
        el('td', { text: wpNaam(p.wpStatus) }),
        el('td', { 'data-ond-uitkomst': p.id, text: '' })
      ]));
    });
    const anders = bron ? ond.paginas.filter((p) => p.id !== bron.id && p.blueprint !== bron.blueprint).length : 0;
    const w = $('lpOndWaarschuwing');
    w.textContent = [ond.statusWaarschuwing, `${doelen.length} pagina's hebben hetzelfde sjabloon als de voorbeeldpagina.`, anders ? `${anders} met een ander sjabloon staan niet in de lijst.` : ''].filter(Boolean).join(' ');
    w.classList.remove('hidden');
    $('lpOndAlles').checked = doelen.length > 0;
    ondReset();
  }
  function ondInhoud() {
    const o = ond.onderdelen.find((x) => x.id === $('lpOndOnderdeel').value);
    $('lpOndInhoud').textContent = o ? `Zo staat het op de voorbeeldpagina: ${o.inhoud.join(' | ')}` : '';
    $('lpOndUitvoerBtn').disabled = !o;
    ondReset();
  }
  async function ondLaadOnderdelen() {
    const sel = $('lpOndOnderdeel');
    sel.innerHTML = '<option value="">Laden...</option>';
    ond.onderdelen = [];
    ondInhoud();
    ondTabel();
    const id = $('lpOndBron').value;
    if (!id) return;
    try {
      const data = await lpApi(`/pages/${encodeURIComponent(id)}/onderdelen`);
      ond.onderdelen = data.onderdelen;
      ond.bronPlaats = data.plaats;
      sel.innerHTML = '<option value="">Kies een onderdeel</option>' + data.onderdelen.map((o) => `<option value="${o.id}">${o.naam} (${o.slots.join(', ')})</option>`).join('');
      const project = data.onderdelen.find((o) => /^project/.test(o.id));
      if (project) sel.value = project.id;
      ondInhoud();
    } catch (err) { sel.innerHTML = ''; toonFout(formatApiError(err)); }
  }

  $('lpOndLijstBtn').addEventListener('click', async () => {
    toonFout('');
    const btn = $('lpOndLijstBtn');
    setBtnLoading(btn, true, 'Laden...');
    try {
      const data = await lpApi(`/clients/${encodeURIComponent($('lpVervangKlant').value)}/onderdeel-overnemen/lijst`, { method: 'POST', body: '{}' });
      ond.paginas = data.paginas;
      ond.statusWaarschuwing = data.statusWaarschuwing;
      $('lpOndKeuze').classList.remove('hidden');
      $('lpOndBron').innerHTML = '<option value="">Kies de pagina waar het goed staat</option>' + data.paginas.map((p) => `<option value="${p.id}">${p.titel}</option>`).join('');
      $('lpOndOnderdeel').innerHTML = '';
      $('lpOndBody').innerHTML = '';
      $('lpOndInhoud').textContent = '';
      $('lpOndWaarschuwing').classList.add('hidden');
      $('lpOndUitvoerBtn').disabled = true;
    } catch (err) { toonFout(formatApiError(err)); } finally { setBtnLoading(btn, false); }
  });
  $('lpOndBron').addEventListener('change', ondLaadOnderdelen);
  $('lpOndOnderdeel').addEventListener('change', ondInhoud);
  $('lpOndAlles').addEventListener('change', (e) => {
    document.querySelectorAll('#lpOndBody input[type=checkbox]').forEach((c) => { c.checked = e.target.checked; });
    ondReset();
  });
  $('lpOndBody').addEventListener('change', ondReset);
  $('lpOndPubliceer').addEventListener('change', ondReset);
  $('lpOndAnnuleerBtn').addEventListener('click', ondReset);

  $('lpOndUitvoerBtn').addEventListener('click', async () => {
    const btn = $('lpOndUitvoerBtn');
    const gekozen = ondGeselecteerd();
    const onderdeelId = $('lpOndOnderdeel').value;
    const bronPageId = $('lpOndBron').value;
    if (!gekozen.length || !onderdeelId || !bronPageId || ond.bezig) return;
    const publiceer = $('lpOndPubliceer').checked;
    const o = ond.onderdelen.find((x) => x.id === onderdeelId);
    if (btn.dataset.stap !== 'bevestig') {
      const live = gekozen.filter((p) => p.wpStatus === 'publish').length;
      let tekst = `Het onderdeel ${o ? o.naam : onderdeelId} wordt op ${gekozen.length} pagina's precies zo gezet als op de voorbeeldpagina. De rest van de tekst blijft staan.`;
      tekst += publiceer ? ' Pagina\'s die in WordPress staan worden meteen bijgewerkt.' : ' Er gaat niets naar WordPress.';
      if (publiceer && live) tekst += live === 1 ? ' 1 daarvan staat live en blijft live.' : ` ${live} daarvan staan live en blijven live.`;
      $('lpOndBevestig').textContent = tekst;
      $('lpOndBevestig').classList.remove('hidden');
      $('lpOndAnnuleerBtn').classList.remove('hidden');
      btn.textContent = 'Ja, overnemen';
      btn.dataset.stap = 'bevestig';
      return;
    }
    ond.bezig = true;
    toonFout('');
    $('lpOndAnnuleerBtn').classList.add('hidden');
    $('lpOndBevestig').classList.add('hidden');
    btn.disabled = true;
    btn.dataset.stap = '';
    let gelukt = 0;
    let mislukt = 0;
    for (let i = 0; i < gekozen.length; i++) {
      const p = gekozen[i];
      const cel = document.querySelector(`[data-ond-uitkomst="${p.id}"]`);
      btn.textContent = `Bezig (${i + 1} van ${gekozen.length})...`;
      cel.textContent = 'Bezig...';
      try {
        const r = await lpApi(`/pages/${encodeURIComponent(p.id)}/onderdeel-overnemen`, { method: 'POST', body: JSON.stringify({ bronPageId, onderdeelId, publiceer }) });
        gelukt += 1;
        const delen = ['Overgenomen'];
        if (r.gepubliceerd) delen.push(`bijgewerkt in WordPress (${wpNaam(r.wpStatus)})`);
        if (r.melding) delen.push(r.melding);
        cel.textContent = delen.join(', ') + (delen.length > 1 && /[.]$/.test(delen[delen.length - 1]) ? '' : '.');
      } catch (err) {
        mislukt += 1;
        cel.textContent = `Mislukt: ${err.message}`;
      }
    }
    ond.bezig = false;
    btn.disabled = false;
    btn.textContent = 'Overnemen...';
    $('lpOndWaarschuwing').textContent = `Klaar: ${gelukt} pagina's bijgewerkt${mislukt ? `, ${mislukt} mislukt (zie de tabel)` : ''}.`;
  });
})();
