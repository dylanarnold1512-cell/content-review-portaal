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
})();
