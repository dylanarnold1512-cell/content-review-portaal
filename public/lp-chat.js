// Pagr. scherm "Bouwen met chat" (23-10-2026). Kies een klant, beschrijf de pagina en de AI bouwt hem direct. Daarna
// bijsturen in de chat en als concept naar WordPress. Praat met /api/lp/chat/* (src/routes/lp.js, src/lp/chatBouwer.js)
// en gebruikt voor voorbeeld en publiceren dezelfde routes als een gewone pagina. Gebruikt lpApi uit lp.js.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const state = { geladen: false, klant: '', pageId: null, berichten: [], bezig: false, page: null };
  const NIEUW = '__nieuw__';

  const VOORBEELDEN = [
    'Ik wil een Google Ads pagina voor aanbouw. Het zoekwoord is "aanbouw laten bouwen Bollenstreek" en het doel is offerteaanvragen.',
    'Maak een Meta Ads pagina voor een gratis adviesgesprek over verbouwen.',
    'Ik wil een LinkedIn Ads pagina voor bedrijven. Help me eerst met de juiste invalshoek.'
  ];

  function fout(tekst) {
    const e = $('chFout');
    if (!tekst) { e.classList.add('hidden'); e.textContent = ''; return; }
    e.textContent = tekst;
    e.classList.remove('hidden');
  }

  function tekenBerichten(extra) {
    const lijst = $('chBerichten');
    if (!state.berichten.length && !extra) {
      lijst.innerHTML = `<div class="ch-leeg"><p>Vertel in je eigen woorden waar de campagne voor is. Meer hoeft niet. De AI kent de huisstijl, de site, de feiten, de reviews en het formulier van de klant, en weet hoe een campagnepagina werkt. Wat nog ontbreekt (kanaal, doel, aanbieding, advertentietekst of zoekwoord) vraagt hij zelf, en daarna bouwt hij een eerste versie.</p><p>Niet zeker hoe je begint? Klik op een voorbeeld hieronder en pas het aan.</p><div class="ch-voorbeelden">${VOORBEELDEN.map((v, i) => `<button type="button" class="ch-voorbeeld" data-i="${i}">${esc(v)}</button>`).join('')}</div></div>`;
      lijst.querySelectorAll('.ch-voorbeeld').forEach((b) => b.addEventListener('click', () => { $('chTekst').value = VOORBEELDEN[Number(b.dataset.i)]; $('chTekst').focus(); }));
      return;
    }
    lijst.innerHTML = state.berichten.map((b) => {
      const label = b.rol === 'ai' ? (b.actie === 'bouw' ? 'Pagr. heeft de pagina opgebouwd' : b.actie === 'tekst' ? 'Pagr. heeft teksten aangepast' : 'Pagr.') : 'Jij';
      return `<div class="ch-bericht ${b.rol === 'ai' ? 'ai' : 'dylan'}"><span class="ch-label">${esc(label)}</span>${esc(b.tekst)}</div>`;
    }).join('') + (extra || '');
    lijst.scrollTop = lijst.scrollHeight;
  }

  function zetBezig(aan) {
    state.bezig = aan;
    $('chVerstuur').disabled = aan;
    $('chTekst').disabled = aan;
    $('chKlant').disabled = aan;
    $('chPagina').disabled = aan;
  }

  function tekenBalk() {
    const p = state.page;
    $('chOpenDetail').disabled = !state.pageId;
    $('chPubliceer').disabled = !state.pageId || state.bezig;
    $('chVernieuw').disabled = !state.pageId;
    if (!p) { $('chStatus').textContent = ''; return; }
    const wp = p.wpUrl ? ` · <a href="${esc(p.wpUrl)}" target="_blank" rel="noopener">bekijk concept in WordPress</a>` : '';
    $('chStatus').innerHTML = `${esc(p.titel || '')} · ${esc(p.status || '')}${wp}`;
  }

  async function laadVoorbeeld() {
    const kader = $('chKader');
    if (!state.pageId) {
      kader.innerHTML = '<div class="ch-kader-leeg">Hier verschijnt de pagina zodra de AI hem heeft gebouwd. Elke aanpassing in de chat zie je hier meteen terug.</div>';
      return;
    }
    try {
      const { html } = await lpApi(`/pages/${state.pageId}/preview`);
      let frame = kader.querySelector('iframe');
      if (!frame) { kader.innerHTML = ''; frame = document.createElement('iframe'); frame.title = 'Voorbeeld van de pagina'; kader.appendChild(frame); }
      const scroll = frame.contentWindow ? frame.contentWindow.scrollY : 0;
      frame.onload = () => { try { frame.contentWindow.scrollTo(0, scroll); } catch (e) { /* leeg */ } };
      frame.srcdoc = html;
    } catch (err) {
      kader.innerHTML = `<div class="ch-kader-leeg">Voorbeeld laden lukte niet: ${esc(err.message)}</div>`;
    }
  }

  function toonMeldingen(lijst, titel) {
    const el = $('chMeldingen');
    const items = (lijst || []).filter(Boolean);
    if (!items.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.innerHTML = `<strong>${esc(titel || 'Let op')}</strong><ul>${items.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`;
    el.classList.remove('hidden');
  }

  async function laadPaginaLijst(kies) {
    const sel = $('chPagina');
    sel.innerHTML = `<option value="${NIEUW}">Nieuwe pagina</option>`;
    if (!state.klant) return;
    try {
      const { paginas } = await lpApi(`/chat/lijst?klant=${encodeURIComponent(state.klant)}`);
      paginas.sort((a, b) => String(b.laatstGewijzigd || '').localeCompare(String(a.laatstGewijzigd || '')));
      sel.innerHTML += paginas.map((p) => `<option value="${esc(p.id)}">${esc(p.titel)} (${esc(p.status)})</option>`).join('');
    } catch (err) { fout(err.message); }
    sel.value = kies && [...sel.options].some((o) => o.value === kies) ? kies : NIEUW;
  }

  async function openPagina(pageId) {
    fout('');
    toonMeldingen([]);
    if (!pageId || pageId === NIEUW) {
      state.pageId = null; state.page = null; state.berichten = [];
      tekenBerichten(); tekenBalk(); laadVoorbeeld();
      return;
    }
    try {
      const { page, berichten } = await lpApi(`/chat/${encodeURIComponent(pageId)}`);
      state.pageId = page.id; state.page = page; state.berichten = berichten || [];
      tekenBerichten(); tekenBalk(); laadVoorbeeld();
    } catch (err) { fout(err.message); }
  }

  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

  async function verstuur() {
    const tekst = $('chTekst').value.trim();
    if (!tekst || state.bezig) return;
    if (!state.klant) { fout('Kies eerst een klant.'); return; }
    fout('');
    zetBezig(true);
    const voor = state.berichten.slice();
    state.berichten = voor.concat([{ rol: 'dylan', tekst }]);
    $('chTekst').value = '';
    const bezigTekst = (s) => `<div class="ch-bericht ai bezig"><span class="ch-label">Pagr.</span>${state.pageId ? 'Bezig met aanpassen' : 'Bezig met bouwen'}${s ? ` (${s} sec)` : ''}. Een hele pagina bouwen duurt ongeveer een tot drie minuten.</div>`;
    tekenBerichten(bezigTekst(0));
    try {
      const { taakId } = await lpApi('/chat/bericht', { method: 'POST', body: JSON.stringify({ klant: state.klant, pageId: state.pageId, bericht: tekst, berichten: state.pageId ? undefined : voor }) });
      let uitkomst = null;
      for (let i = 0; i < 200 && !uitkomst; i++) {
        await wacht(3000);
        const t = await lpApi(`/chat/taak/${taakId}`);
        if (t.status === 'bezig') { tekenBerichten(bezigTekst(t.seconden)); continue; }
        if (t.status === 'fout') throw new Error(t.fout || 'Er ging iets mis.');
        uitkomst = t.resultaat;
      }
      if (!uitkomst) throw new Error('Het duurde te lang. Open de pagina opnieuw om te zien of het gelukt is.');
      state.berichten = uitkomst.berichten || state.berichten;
      const nieuwePagina = uitkomst.pageId && uitkomst.pageId !== state.pageId;
      state.pageId = uitkomst.pageId || state.pageId;
      tekenBerichten();
      toonMeldingen(uitkomst.waarschuwingen, 'Let op');
      if (nieuwePagina) {
        await laadPaginaLijst(state.pageId);
        const { page } = await lpApi(`/chat/${encodeURIComponent(state.pageId)}`);
        state.page = page;
      }
      tekenBalk();
      if (uitkomst.actie !== 'geen') await laadVoorbeeld();
    } catch (err) {
      tekenBerichten(`<div class="ch-bericht fout"><span class="ch-label">Niet gelukt</span>${esc(err.message)}</div>`);
      if (!state.pageId) state.berichten = voor;
      $('chTekst').value = tekst;
    } finally {
      zetBezig(false);
      tekenBalk();
      $('chTekst').focus();
    }
  }

  async function publiceer() {
    if (!state.pageId) return;
    const knop = $('chPubliceer');
    setBtnLoading(knop, true, 'Bezig met publiceren...');
    toonMeldingen([]);
    try {
      const { page, seo } = await lpApi(`/pages/${state.pageId}/publish`, { method: 'POST', body: '{}' });
      state.page = { ...state.page, status: page.status, wpUrl: page.wpUrl, wpPaginaId: page.wpPaginaId };
      const seoTekst = seo && seo.melding ? [seo.melding] : [];
      toonMeldingen(['Staat als concept in WordPress. Live zetten doe je zelf, via WordPress of het paginascherm.', ...seoTekst], 'Gepubliceerd als concept');
    } catch (err) {
      const v = err.data && err.data.validation;
      toonMeldingen(v && v.errors && v.errors.length ? v.errors.concat(['Vraag in de chat om dit op te lossen, bijvoorbeeld "maak de metatitel korter".']) : [err.message], 'Nog niet gepubliceerd');
    } finally {
      setBtnLoading(knop, false);
      tekenBalk();
    }
  }

  async function laadKlanten() {
    try {
      const { clients } = await lpApi('/clients');
      $('chKlant').innerHTML = '<option value="">Kies een klant</option>' + clients.map((c) => `<option value="${esc(c.id)}">${esc(c.naam)}</option>`).join('');
    } catch (err) { fout(err.message); }
    tekenBerichten(); tekenBalk(); laadVoorbeeld();
  }

  $('chKlant').addEventListener('change', async () => {
    state.klant = $('chKlant').value;
    await laadPaginaLijst();
    openPagina(NIEUW);
  });
  $('chPagina').addEventListener('change', () => openPagina($('chPagina').value));
  $('chVerstuur').addEventListener('click', verstuur);
  $('chTekst').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); verstuur(); } });
  $('chPubliceer').addEventListener('click', publiceer);
  $('chVernieuw').addEventListener('click', laadVoorbeeld);
  $('chOpenDetail').addEventListener('click', () => { if (state.pageId && typeof openPageDetail === 'function') { $('lpChatTab').classList.add('hidden'); openPageDetail(state.pageId); } });
  document.querySelectorAll('#chApparaat button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#chApparaat button').forEach((x) => x.classList.toggle('actief', x === b));
    $('chKader').classList.toggle('mobiel', b.dataset.apparaat === 'mobiel');
  }));

  document.querySelectorAll('#lpTabNav .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const actief = btn.dataset.lpTab === 'chat';
      $('lpChatTab').classList.toggle('hidden', !actief);
      if (actief && !state.geladen) { state.geladen = true; laadKlanten(); }
      else if (actief && state.pageId) laadVoorbeeld();
    });
  });
})();
