// LP Fabriek, stap 12 (14-10-2026): de AI als begeleider bij een nieuwe pagina, een nieuw sjabloon en een bestaand sjabloon,
// plus het advies "Wat nu" op het paginascherm. Gebruikt lpApi en de schermfuncties uit lp.js.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function toon(id, tekst) {
    const el = $(id);
    if (!el) return;
    el.textContent = tekst || '';
    el.classList.toggle('hidden', !tekst);
  }
  function fout(id, tekst) {
    const e = $(id);
    if (!e) return;
    e.textContent = tekst || '';
    e.classList.toggle('hidden', !tekst);
  }

  // ---- Nieuwe pagina ----
  async function laadGepland() {
    const klant = $('lpNewKlant').value;
    const kaart = $('npGepland');
    if (!klant) { kaart.classList.add('hidden'); return; }
    try {
      const { pages } = await lpApi('/pages?klant=' + encodeURIComponent(klant));
      const gepland = (pages || []).filter((p) => p.status === 'Idee').slice(0, 8);
      $('npGeplandLijst').innerHTML = gepland.map((p) => `<button type="button" class="btn-plain np-chip" data-titel="${esc(p.titel)}">${esc(p.titel)}</button>`).join('');
      kaart.classList.toggle('hidden', !gepland.length);
      $('npGeplandLijst').querySelectorAll('.np-chip').forEach((b) => b.addEventListener('click', () => {
        $('npOnderwerp').value = 'Een pagina met de titel: ' + b.dataset.titel;
        $('npMaakKnop').click();
      }));
    } catch (e) { kaart.classList.add('hidden'); }
  }
  $('lpNewKlant').addEventListener('change', () => { laadGepland(); $('npAdviesKaart').classList.add('hidden'); $('npResultaat').classList.add('hidden'); $('npLeeg').classList.remove('hidden'); });
  document.querySelectorAll('#lpTabNav .tab-btn').forEach((b) => b.addEventListener('click', () => { if (b.dataset.lpTab === 'nieuw') laadGepland(); }));
  const nieuweKnop = $('lpNieuwePaginaBtn');
  if (nieuweKnop) nieuweKnop.addEventListener('click', laadGepland);

  // Maak pagina: de AI kiest wat jij niet zelf kiest en de pagina wordt meteen aangemaakt.
  // Het sjabloon dat je in stap 1 kiest gaat naar de server en de AI kan dan geen ander sjabloon nemen.
  function toonResultaat(r, invoerGegevens) {
    lpState.npPagina = r.page;
    const extra = r.extraPlaatsen || [];
    lpState.npLaatste = { ...invoerGegevens, pageIds: [r.page.id, ...extra.filter((x) => x.id).map((x) => x.id)], blueprintId: r.advies.blueprintId, titel: r.page.titel, slug: r.page.slug || r.advies.slug || '' };
    const feiten = r.automatisch ? 'alle feiten van de klant' : null;
    $('npResultaatKop').textContent = `${r.page.titel} is aangemaakt`;
    $('npResultaatTekst').textContent = r.automatisch
      ? `De AI schrijft nu de tekst met ${feiten}. Je vindt hem straks bij Wacht op jou. Je hoeft hier niet te wachten.`
      : 'Deze klant heeft Pagr. niet aan en geen interne automatisering, dus de tekst schrijf je zelf via de knop op het paginascherm.';
    const gelukt = extra.filter((x) => x.id);
    const mislukt = extra.filter((x) => x.fout);
    if (gelukt.length) $('npResultaatTekst').textContent += ` Er ${gelukt.length === 1 ? 'is ook 1 pagina' : 'zijn ook ' + gelukt.length + " pagina's"} gemaakt voor ${gelukt.map((x) => x.plaats).join(', ')}.`;
    if (mislukt.length) $('npResultaatTekst').textContent += ` Niet gelukt: ${mislukt.map((x) => (x.plaats ? x.plaats + ': ' : '') + x.fout).join(' ')}`;
    const rij = (k, w, veld) => `<div class="np-keuze" data-veld="${veld || ''}"><span class="np-keuze-k">${k}</span><b class="np-keuze-w">${esc(w)}</b>${veld ? `<button type="button" class="np-wijzig" data-wijzig="${veld}">Wijzig</button>` : ''}</div>`;
    $('npResultaatKeuzes').innerHTML =
      rij('Sjabloon', r.sjabloonNaam || r.advies.blueprintId, 'sjabloon') +
      rij('Titel', r.page.titel, 'titel') +
      rij('Webadres', '/' + lpState.npLaatste.slug, 'slug') +
      (r.advies.waarom ? `<div class="np-keuze"><span class="np-keuze-k">Waarom</span><span class="np-keuze-uitleg">${esc(r.advies.waarom)}</span></div>` : '');
    $('npResultaatKeuzes').querySelectorAll('[data-wijzig]').forEach((b) => b.addEventListener('click', () => openWijzig(b.dataset.wijzig)));
    $('npLeeg').classList.add('hidden');
    $('npResultaat').classList.remove('hidden');
  }

  // Wijzig: een veldje onder de keuze. Opslaan verwijdert de net gemaakte pagina('s) en laat de AI opnieuw beginnen.
  function openWijzig(veld) {
    const l = lpState.npLaatste;
    const rij = $('npResultaatKeuzes').querySelector(`[data-veld="${veld}"]`);
    if (!l || !rij || rij.nextElementSibling?.classList.contains('np-wijzigvak')) return;
    let invoer;
    if (veld === 'sjabloon') invoer = `<select id="npWijzigWaarde">${$('npSjabloon').innerHTML}</select>`;
    else invoer = `<input type="text" id="npWijzigWaarde" value="${esc(veld === 'titel' ? l.titel : l.slug)}">`;
    rij.insertAdjacentHTML('afterend', `<div class="np-wijzigvak">${invoer}<button type="button" class="btn btn-approve" id="npWijzigOk">Opnieuw laten maken</button><button type="button" class="btn btn-plain" id="npWijzigAnnuleer">Annuleer</button></div>`);
    if (veld === 'sjabloon') $('npWijzigWaarde').value = l.blueprintId || '';
    $('npWijzigAnnuleer').addEventListener('click', () => rij.nextElementSibling.remove());
    $('npWijzigOk').addEventListener('click', async () => {
      const waarde = $('npWijzigWaarde').value.trim();
      const overrides = { ...(l.overrides || {}) };
      if (veld === 'sjabloon') { if (!waarde) { fout('lpNewError', 'Kies een sjabloon.'); return; } overrides.blueprintId = waarde; }
      if (veld === 'titel') { if (!waarde) { fout('lpNewError', 'Typ een titel.'); return; } overrides.titel = waarde; }
      if (veld === 'slug') { if (!waarde) { fout('lpNewError', 'Typ een webadres.'); return; } overrides.slug = waarde; }
      $('npWijzigOk').disabled = true;
      try {
        await lpApi('/pages/verwijder-meerdere', { method: 'POST', body: JSON.stringify({ ids: l.pageIds }) });
      } catch (err) { fout('lpNewError', err.message); $('npWijzigOk').disabled = false; return; }
      await maakPagina({ klant: l.klant, onderwerp: l.onderwerp, plaatsen: l.plaatsen, blueprintId: overrides.blueprintId || l.blueprintId, overrides });
    });
  }

  async function maakPagina({ klant, onderwerp, plaatsen, blueprintId, overrides }) {
    fout('lpNewError', '');
    const knop = $('npMaakKnop');
    knop.disabled = true;
    $('npAdviesStatus').textContent = 'De pagina wordt gemaakt... Dit duurt ongeveer 15 seconden.';
    try {
      const body = { klant, onderwerp, plaatsen: plaatsen || '', blueprintId: blueprintId || '' };
      if (overrides && overrides.titel) body.titel = overrides.titel;
      if (overrides && overrides.slug) body.slug = overrides.slug;
      const r = await lpApi('/pages/snel', { method: 'POST', body: JSON.stringify(body) });
      if (!r.page) {
        // Niet netjes gelukt: vul het formulier voor zodat jij kiest.
        await vulFormulier(r.advies);
        $('npAdviesStatus').textContent = 'De AI weet het niet zeker. Controleer hieronder wat is ingevuld.';
        return;
      }
      toonResultaat(r, { klant, onderwerp, plaatsen, overrides: overrides || {} });
      if ($('npPlaatsen')) $('npPlaatsen').value = '';
      $('npAdviesStatus').textContent = 'Klaar voor controle binnen een paar minuten.';
      $('npOnderwerp').value = '';
      if (typeof loadPages === 'function') loadPages();
      if (typeof wpLaad === 'function') wpLaad();
    } catch (err) {
      $('npAdviesStatus').textContent = '';
      fout('lpNewError', err.message);
    } finally { knop.disabled = false; }
  }

  $('npMaakKnop').addEventListener('click', () => {
    const onderwerp = $('npOnderwerp').value.trim();
    if (!onderwerp) { fout('lpNewError', 'Typ eerst in een zin welke pagina je wilt.'); return; }
    maakPagina({ klant: $('lpNewKlant').value, onderwerp, plaatsen: ($('npPlaatsen') || {}).value || '', blueprintId: $('npSjabloon').value });
  });
  $('npSjabloon').addEventListener('change', () => {
    $('npSjabloonUitleg').textContent = $('npSjabloon').value
      ? 'De AI gebruikt alleen dit sjabloon en kiest zelf titel en webadres.'
      : 'De AI kiest het sjabloon dat bij je zin past.';
  });
  $('npOpenPagina').addEventListener('click', () => { if (lpState.npPagina) { switchLpTab('paginas'); openPageDetail(lpState.npPagina.id); } });
  $('npNaarWerkplaats').addEventListener('click', () => switchLpTab('werkplaats'));
  $('npTerug').addEventListener('click', () => switchLpTab('werkplaats'));
  $('npNogEen').addEventListener('click', () => { $('npResultaat').classList.add('hidden'); $('npLeeg').classList.remove('hidden'); $('npOnderwerp').focus(); });

  async function vulFormulier(advies) {
    if (advies.blueprintId) {
      $('lpNewBlueprint').value = advies.blueprintId;
      await loadNewFormInvoerFields();
    }
    $('lpNewTitel').value = advies.titel || '';
    $('lpNewSlug').value = advies.slug || '';
    Object.entries(advies.invoer || {}).forEach(([k, v]) => {
      const el = document.querySelector(`#lpNewInvoerFields [data-veld-key="${k}"]`);
      if (el) el.value = v;
    });
    toon('npWaarom', advies.waarom);
    toon('npTip', advies.tip ? 'Tip: ' + advies.tip : '');
    toon('npWaarschuwing', advies.waarschuwing);
    $('npAdviesKaart').classList.remove('hidden');
    $('npHandmatig').classList.remove('hidden');
  }

  $('npAdviesKnop').addEventListener('click', async () => {
    fout('lpNewError', '');
    const knop = $('npAdviesKnop');
    const klant = $('lpNewKlant').value;
    const onderwerp = $('npOnderwerp').value.trim();
    if (!onderwerp) { fout('lpNewError', 'Beschrijf eerst in een paar woorden welke pagina je wilt.'); return; }
    knop.disabled = true;
    $('npAdviesStatus').textContent = 'De AI denkt mee... Dit duurt ongeveer 15 seconden.';
    try {
      const { advies } = await lpApi('/pages/begeleiding', { method: 'POST', body: JSON.stringify({ klant, onderwerp, blueprintId: $('npSjabloon').value }) });
      await vulFormulier(advies);
      $('npAdviesStatus').textContent = 'Controleer hieronder wat de AI heeft ingevuld en pas aan.';
    } catch (err) {
      $('npAdviesStatus').textContent = '';
      fout('lpNewError', err.message);
    } finally { knop.disabled = false; }
  });

  // ---- Nieuw sjabloon ----
  $('tnAdviesKnop').addEventListener('click', async () => {
    fout('lpTemplateNewError', '');
    const klant = $('lpTplNewKlant').value;
    const doel = $('tnDoel').value.trim();
    if (!klant) { fout('lpTemplateNewError', 'Kies eerst een klant.'); return; }
    if (!doel) { fout('lpTemplateNewError', 'Beschrijf eerst in een paar woorden voor welk soort pagina dit sjabloon is.'); return; }
    const knop = $('tnAdviesKnop');
    knop.disabled = true;
    $('tnAdviesStatus').textContent = 'De AI denkt mee... Dit duurt ongeveer 15 seconden.';
    try {
      const { advies } = await lpApi('/templates/begeleiding', { method: 'POST', body: JSON.stringify({ klant, doel }) });
      if (advies.naam && !$('lpTplNewNaam').value.trim()) $('lpTplNewNaam').value = advies.naam;
      $('lpTplNewPaginatype').value = advies.paginatype || '';
      document.querySelectorAll('#lpTplOnderdelenChecklist input[type="checkbox"]').forEach((cb) => { cb.checked = (advies.onderdelen || []).includes(cb.value); });
      {
        const namen = Array.from(document.querySelectorAll('#lpTplOnderdelenChecklist input[type="checkbox"]:checked')).map((cb) => (cb.parentElement.textContent || cb.value).trim());
        const kader = $('lpTplOnderdelenSamenvatting');
        if (kader) kader.textContent = namen.length ? 'Opbouw volgens het advies van de AI: ' + namen.join(', ') + '. Elke pagina van dit sjabloon heeft deze vaste opbouw.' : 'De AI bepaalt zelf de opbouw van dit sjabloon.';
      }
      $('lpTplNewVisueleRichting').value = advies.visueleRichting || '';
      $('lpTplNewConversiedoel').value = advies.conversiedoel || '';
      if (advies.wens && !$('lpTplNewWens').value.trim()) $('lpTplNewWens').value = advies.wens;
      toon('tnWaarom', advies.waarom ? 'Advies van de AI: ' + advies.waarom : '');
      $('tnAdviesStatus').textContent = 'Ingevuld in stap 2. Controleer en pas aan.';
    } catch (err) {
      $('tnAdviesStatus').textContent = '';
      fout('lpTemplateNewError', err.message);
    } finally { knop.disabled = false; }
  });
  $('lpNewTemplateBtn').addEventListener('click', () => {
    $('tnDoel').value = '';
    toon('tnWaarom', '');
    $('tnAdviesStatus').textContent = '';
  });

  // ---- Sjabloon bekijken: tips van de AI ----
  $('tdBewaarKnop').addEventListener('click', () => $('lpTplSaveBlueprintBtn').click());
  // Schermafbeeldingen van het voorbeeld voor de AI: desktop (breed, in stukken) en het begin van de mobiele versie.
  // Alles gebeurt in de browser met html2canvas; lukt dat niet, dan geeft de AI tips op basis van de code alleen.
  async function maakVoorbeeldBeelden(html) {
    if (typeof window.html2canvas !== 'function') return [];
    const STUK = 1400;
    const maak = async (breedte, maxHoogte) => {
      const frame = document.createElement('iframe');
      frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${breedte}px;height:900px;border:0;`;
      document.body.appendChild(frame);
      try {
        await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = html; });
        const doc = frame.contentDocument;
        try { if (doc.fonts && doc.fonts.ready) await Promise.race([doc.fonts.ready, new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* lettertypen niet af te wachten */ }
        await new Promise((r) => setTimeout(r, 600));
        const hoogte = Math.min(Math.max(doc.documentElement.scrollHeight, 400), maxHoogte);
        const canvas = await window.html2canvas(doc.documentElement, { width: breedte, height: hoogte, windowWidth: breedte, windowHeight: hoogte, scale: 1, useCORS: true, logging: false, backgroundColor: '#ffffff' });
        const stukken = [];
        for (let y = 0; y < canvas.height; y += STUK) {
          const h = Math.min(STUK, canvas.height - y);
          if (h < 40) continue;
          const stuk = document.createElement('canvas');
          stuk.width = canvas.width;
          stuk.height = h;
          const ctx = stuk.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, stuk.width, h);
          ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
          stukken.push(stuk.toDataURL('image/jpeg', 0.8));
        }
        return stukken;
      } finally { frame.remove(); }
    };
    try {
      const desktop = (await maak(1200, 6 * STUK)).slice(0, 6);
      let mobiel = [];
      try { mobiel = (await maak(390, 2 * STUK)).slice(0, 2); } catch (e) { mobiel = []; }
      return [...desktop, ...mobiel];
    } catch (e) { return []; }
  }

  $('tdTipsKnop').addEventListener('click', async () => {
    const template = lpState.currentTemplate;
    if (!template) return;
    fout('lpTemplateDetailError', '');
    let blueprint;
    try { blueprint = JSON.parse($('lpTplDetailBlueprintJson').value || '{}'); } catch (err) { fout('lpTemplateDetailError', 'De opzet van het sjabloon is ongeldig: ' + err.message); return; }
    const knop = $('tdTipsKnop');
    knop.disabled = true;
    $('tdTipsStatus').textContent = 'Er wordt een schermafbeelding van het voorbeeld gemaakt...';
    $('tdTipsLijst').innerHTML = '';
    try {
      let screenshots = [];
      try {
        await refreshTemplateDetailPreview();
        const html = $('lpTplDetailPreviewFrame').srcdoc;
        if (html) screenshots = await maakVoorbeeldBeelden(html);
      } catch (e) { screenshots = []; }
      $('tdTipsStatus').textContent = screenshots.length
        ? 'De AI bekijkt het voorbeeld... Dit duurt ongeveer 30 seconden.'
        : 'De schermafbeelding is niet gelukt, de AI geeft nu tips op basis van de code (dus niet over de uitstraling)... Dit duurt ongeveer 20 seconden.';
      const body = { klant: template.klant, naam: template.naam, blueprint };
      if (screenshots.length) body.screenshots = screenshots;
      const { punten } = await lpApi('/templates/verbeterpunten', { method: 'POST', body: JSON.stringify(body) });
      $('tdTipsStatus').textContent = punten.length ? '' : 'De AI vindt dit sjabloon al goed. Er zijn geen verbeterpunten.';
      $('tdTipsLijst').innerHTML = punten.map((p, i) => `<div class="wp-advies-item plan">
        <p><span class="wp-muted">${p.soort === 'ontwerp' ? 'Uitstraling' : 'Inhoud'}</span><br><strong>${esc(p.titel)}</strong><br>${esc(p.uitleg)}</p>
        <button type="button" class="btn btn-approve" data-tip="${i}">Voer dit door</button></div>`).join('');
      $('tdTipsLijst').querySelectorAll('[data-tip]').forEach((b) => b.addEventListener('click', () => {
        $('lpTplDetailSectieSelect').value = '';
        $('lpTplDetailFeedback').value = punten[Number(b.dataset.tip)].opdracht;
        $('lpTplDetailRefineBtn').click();
        b.disabled = true;
        b.textContent = 'Wordt doorgevoerd...';
      }));
    } catch (err) {
      $('tdTipsStatus').textContent = '';
      fout('lpTemplateDetailError', err.message);
    } finally { knop.disabled = false; }
  });

  // ---- Paginascherm: wat nu ----
  window.lpRenderPaginaAdvies = function (page, st) {
    const box = $('pdAdvies');
    if (!box) return;
    const items = [];
    const ts = (typeof lpState !== 'undefined' && lpState.tekstStatus) || null;
    const stap = (tekst, knop, actie, soort) => items.push({ tekst, knop, actie, soort: soort || 'plan' });
    if (page.status === 'Afgewezen') items.push({ soort: 'let-op', tekst: 'Deze pagina is afgewezen. Pas de tekst aan of laat de AI hem opnieuw schrijven.' });
    if (page.status === 'Fout') items.push({ soort: 'fout', tekst: 'Er ging iets mis bij deze pagina. Controleer de tekst en probeer het opnieuw.' });
    if (st.gepubliceerd) {
      stap('Deze pagina staat live. Wil je hem verbeteren, kijk dan in de Werkplaats bij Bijhouden of er een voorstel staat.', null, null, 'goed');
    } else if (!st.contentKlaar && ts && (ts.status === 'bezig' || ts.status === 'wacht')) {
      stap('De AI schrijft de tekst voor deze pagina. Dit duurt ongeveer een minuut. Je hoeft niets te doen, dit scherm ververst vanzelf.', null, null, 'goed');
    } else if (!st.contentKlaar && ts && ts.status === 'fout') {
      items.push({ soort: 'fout', tekst: `Het schrijven van de tekst is niet gelukt: ${ts.fout}` });
      stap('Probeer het nog een keer.', 'Laat de AI opnieuw schrijven', async () => { await lpApi(`/pages/${page.id}/auto-tekst`, { method: 'POST', body: '{}' }); openPageDetail(page.id); });
    } else if (!st.invoerIngevuld) {
      stap('Beschrijf kort waar de pagina over gaat en wat hem anders maakt dan vergelijkbare pagina\'s. Daarna schrijft de AI de tekst.', 'Naar Onderwerp', () => switchLpSubtab('invoer'));
    } else if (!st.contentKlaar) {
      stap('Alles staat klaar. De AI kan nu de tekst schrijven en passende foto\'s kiezen.', 'Laat de AI de tekst schrijven', () => { switchLpSubtab('content'); const k = $('lpGenerateContentBtn'); if (k && !k.disabled) k.click(); });
    } else {
      stap('De tekst is klaar. Bekijk het voorbeeld en laat de pagina controleren voordat je hem als concept naar WordPress zet.', 'Bekijk en controleer', () => {
        const pv = $('lpPreviewBtn'); if (pv) pv.click();
        const v = $('lpValidateBtn'); if (v) v.click();
        const kaart = $('pdAdviesKaart'); if (kaart) kaart.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    const toonControle = !st.gepubliceerd && st.contentKlaar && !(ts && (ts.status === 'bezig' || ts.status === 'wacht'));
    if (toonControle && !(typeof lpState !== 'undefined' && lpState.pagrModule)) {
      // Zonder Pagr. module draait de controle niet vanzelf: de knop doet het met een klik.
      items[items.length - 1] = { tekst: 'De tekst is klaar. Laat de pagina controleren voordat je hem live zet.', knop: 'Controleer de pagina', soort: 'plan', actie: () => lpToonControle(page) };
    }
    box.innerHTML = items.map((it, i) => `<div class="wp-advies-item ${it.soort}"><p>${esc(it.tekst)}</p>${it.knop ? `<button type="button" class="btn btn-approve" data-adv="${i}">${esc(it.knop)}</button>` : ''}</div>`).join('');
    box.querySelectorAll('[data-adv]').forEach((b) => b.addEventListener('click', () => items[Number(b.dataset.adv)].actie()));
    if (toonControle && typeof lpState !== 'undefined' && lpState.pagrModule) lpToonControle(page);
  };

  // Automatische controle: haalt de controle op en toont per punt een oplosknop.
  window.lpToonControle = async function (page) {
    const box = $('pdAdvies');
    if (!box) return;
    let kaart = $('pdControle');
    if (!kaart) { kaart = document.createElement('div'); kaart.id = 'pdControle'; box.appendChild(kaart); }
    kaart.innerHTML = '<p class="wp-muted">De pagina wordt gecontroleerd...</p>';
    try {
      const c = await lpApi(`/pages/${page.id}/controle`);
      const punten = [...c.fouten.map((p, i) => ({ p, soort: 'fout', i })), ...c.letOp.map((p, i) => ({ p, soort: 'let-op', i }))];
      const knoppen = (p, soort, i) => [
        p.knop ? `<button type="button" class="btn btn-plain" data-oplos="${soort}-${i}">${esc(p.knop)}</button>` : '',
        ...(p.acties || []).map((a, j) => `<button type="button" class="btn btn-plain" data-actie="${soort}-${i}-${j}">${esc(a.label)}</button>`)
      ].join('');
      const punt = ({ p, soort, i }, n) => {
        const k = knoppen(p, soort, i);
        return `<div class="pd-punt"><div class="pd-punt-kop"><span class="pd-nr ${soort}">${n + 1}</span><div><strong>${esc(p.tekst)}</strong></div></div>${k ? `<div class="wp-idee-knoppen">${k}</div>` : ''}</div>`;
      };
      kaart.innerHTML = `<p class="${c.ok ? '' : 'admin-error'}"><strong>${esc(c.samenvatting)}</strong>${c.letOp.length && c.ok ? ' Ze blokkeren live zetten niet.' : ''}</p>`
        + punten.map((x, n) => punt(x, n)).join('')
        + ((c.inOrde || []).length ? `<details class="pd-punt"><summary><strong>In orde (${c.inOrde.length})</strong></summary><ul class="pd-inorde">${c.inOrde.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>` : '');
      // Nummers in het voorbeeld bij de secties waar een punt over gaat.
      lpState.controleMarkers = punten.map((x, n) => ({ n: n + 1, sectie: x.p.sectieIndex, soort: x.soort })).filter((m) => m.sectie != null);
      if (typeof lpZetMarkers === 'function') lpZetMarkers();
      kaart.insertAdjacentHTML('beforeend', `<div class="pd-punt" id="pdRedactie"><div class="pd-punt-kop"><div><strong>Tweede lezer</strong><p class="wp-muted np-klein">Een tweede AI leest de pagina als bezoeker die twijfelt en geeft maximaal vijf verbeteringen. Dit duurt ongeveer een halve minuut.</p></div></div><div class="wp-idee-knoppen"><button type="button" class="btn btn-plain" id="pdRedactieKnop">Laat een tweede AI meelezen</button></div><div id="pdRedactieUit"></div></div>`);
      const redactieKnop = $('pdRedactieKnop');
      if (redactieKnop) redactieKnop.addEventListener('click', async () => {
        const uit = $('pdRedactieUit');
        redactieKnop.disabled = true;
        redactieKnop.textContent = 'De tweede AI leest mee...';
        try {
          const r = await lpApi(`/pages/${page.id}/redactie-check`, { method: 'POST', body: '{}' });
          if (!r.punten.length) {
            uit.innerHTML = '<p class="wp-muted">De tweede lezer vond niets dat beter kan.</p>';
          } else {
            uit.innerHTML = r.punten.map((p, i) => `<div class="pd-punt"><div class="pd-punt-kop"><span class="pd-nr let-op">${i + 1}</span><div><strong>${esc(p.probleem)}</strong><p class="wp-muted np-klein">${esc(p.aanwijzing)}</p></div></div><div class="wp-idee-knoppen"><button type="button" class="btn btn-plain" data-herschrijf="${i}">Herschrijf dit onderdeel</button></div></div>`).join('');
            uit.querySelectorAll('[data-herschrijf]').forEach((hb) => hb.addEventListener('click', async () => {
              const p = r.punten[Number(hb.dataset.herschrijf)];
              hb.disabled = true;
              hb.textContent = 'Bezig met herschrijven (ongeveer 20 seconden)...';
              try {
                await lpApi(`/pages/${page.id}/herschrijf`, { method: 'POST', body: JSON.stringify({ slots: p.slots, aanwijzing: p.aanwijzing }) });
                openPageDetail(page.id);
              } catch (err) { hb.textContent = err.message; hb.disabled = false; }
            }));
          }
        } catch (err) { uit.innerHTML = `<p class="admin-error">${esc(err.message)}</p>`; }
        finally { redactieKnop.disabled = false; redactieKnop.textContent = 'Laat een tweede AI meelezen'; }
      });
      kaart.insertAdjacentHTML('beforeend', `<div class="pd-live">
        <h3>Live zetten</h3>
        <button type="button" class="btn btn-approve" id="pdZetLive"${c.ok ? '' : ' disabled'}>Zet live${c.site ? ' op ' + esc(c.site) : ''}</button>
        <button type="button" class="btn btn-plain" id="pdAlsConcept">Alleen als concept in WordPress</button>
        <p class="wp-muted np-klein">${c.ok ? 'Er gaat niets live zonder jouw klik. Zet je hem zelf live in WordPress, dan ziet het portaal dat ook.' : 'Los eerst de fouten op, dan kun je hem live zetten.'}</p>
        <p id="pdLiveMelding" class="wp-muted"></p></div>`);
      const melding = (t, fout) => { const m = $('pdLiveMelding'); if (m) { m.textContent = t; m.className = fout ? 'admin-error' : 'wp-muted'; } };
      const zetLive = $('pdZetLive');
      if (zetLive) zetLive.addEventListener('click', async () => {
        if (!confirm('Deze pagina nu live zetten' + (c.site ? ' op ' + c.site : '') + '?')) return;
        zetLive.disabled = true;
        melding('Bezig met live zetten...');
        try {
          const r = await lpApi(`/pages/${page.id}/zet-live`, { method: 'POST', body: JSON.stringify({ bevestigd: true }) });
          melding('De pagina staat live: ' + (r.page.wpUrl || ''));
          openPageDetail(page.id);
        } catch (err) { zetLive.disabled = false; melding(err.message, true); }
      });
      const alsConcept = $('pdAlsConcept');
      if (alsConcept) alsConcept.addEventListener('click', async () => {
        alsConcept.disabled = true;
        melding('Bezig...');
        try {
          const r = await lpApi(`/pages/${page.id}/publish`, { method: 'POST' });
          melding('Concept gezet in WordPress: ' + (r.page.wpUrl || ''));
        } catch (err) { melding(err.message, true); }
        alsConcept.disabled = false;
      });
      kaart.querySelectorAll('[data-actie]').forEach((b) => b.addEventListener('click', async () => {
        const [soort, i, j] = b.dataset.actie.split('-');
        const lijst = soort === 'fout' ? c.fouten : c.letOp;
        const a = lijst[Number(i)].acties[Number(j)];
        b.disabled = true;
        const tekst = b.textContent;
        b.textContent = 'Bezig...';
        try {
          if (a.type === 'verberg') {
            await lpApi(`/pages/${page.id}/verberg`, { method: 'POST', body: JSON.stringify({ type: 'sectie', index: a.sectie, verborgen: true }) });
          } else if (a.type === 'herschrijf') {
            b.textContent = 'Bezig met herschrijven (ongeveer 20 seconden)...';
            await lpApi(`/pages/${page.id}/herschrijf`, { method: 'POST', body: JSON.stringify({ slots: a.slots, aanwijzing: a.aanwijzing }) });
            openPageDetail(page.id);
            return;
          } else if (a.type === 'fotos') {
            const r = await lpApi(`/pages/${page.id}/kies-fotos`, { method: 'POST', body: JSON.stringify({ lijst: a.lijst }) });
            if (!r.gewisseld) { b.textContent = r.melding; b.disabled = false; return; }
          }
          if (typeof refreshPreview === 'function') await refreshPreview();
          window.lpToonControle(page);
        } catch (err) { b.textContent = err.message; b.disabled = false; }
      }));
      kaart.querySelectorAll('[data-oplos]').forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        b.textContent = 'Bezig...';
        try {
          await lpApi(`/pages/${page.id}/auto-tekst`, { method: 'POST', body: JSON.stringify({ opnieuw: true }) });
          openPageDetail(page.id);
        } catch (err) { b.textContent = err.message; }
      }));
    } catch (err) {
      kaart.innerHTML = `<p class="admin-error">${esc(err.message)}</p>`;
    }
  };
})();
