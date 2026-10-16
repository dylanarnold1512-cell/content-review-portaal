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
        $('npAdviesKnop').click();
      }));
    } catch (e) { kaart.classList.add('hidden'); }
  }
  $('lpNewKlant').addEventListener('change', () => { laadGepland(); $('npAdviesKaart').classList.add('hidden'); });
  document.querySelectorAll('#lpTabNav .tab-btn').forEach((b) => b.addEventListener('click', () => { if (b.dataset.lpTab === 'nieuw') laadGepland(); }));
  const nieuweKnop = $('lpNieuwePaginaBtn');
  if (nieuweKnop) nieuweKnop.addEventListener('click', laadGepland);

  $('npAdviesKnop').addEventListener('click', async () => {
    fout('lpNewError', '');
    const knop = $('npAdviesKnop');
    const klant = $('lpNewKlant').value;
    const onderwerp = $('npOnderwerp').value.trim();
    if (!onderwerp) { fout('lpNewError', 'Beschrijf eerst in een paar woorden welke pagina je wilt.'); return; }
    knop.disabled = true;
    $('npAdviesStatus').textContent = 'De AI denkt mee... Dit duurt ongeveer 15 seconden.';
    try {
      const { advies } = await lpApi('/pages/begeleiding', { method: 'POST', body: JSON.stringify({ klant, onderwerp }) });
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
        switchLpSubtab('publiceren');
        const pv = $('lpPreviewBtn'); if (pv) pv.click();
        const v = $('lpValidateBtn'); if (v) v.click();
      });
    }
    box.innerHTML = items.map((it, i) => `<div class="wp-advies-item ${it.soort}"><p>${esc(it.tekst)}</p>${it.knop ? `<button type="button" class="btn btn-approve" data-adv="${i}">${esc(it.knop)}</button>` : ''}</div>`).join('');
    box.querySelectorAll('[data-adv]').forEach((b) => b.addEventListener('click', () => items[Number(b.dataset.adv)].actie()));
  };
})();
