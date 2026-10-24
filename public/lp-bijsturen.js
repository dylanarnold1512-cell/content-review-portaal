// Bijsturen met chat op het paginascherm (24-10-2026, fase 2 van de paginabouwer). Werkt voor elke pagina: een pagina
// met een vast sjabloon krijgt alleen tekstwijzigingen, een pagina die met chat is gebouwd ook opbouw en vormgeving.
// Gebruikt lpApi, lpState, refreshPreview, renderContentJson uit lp.js.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let bezig = false;

  function tekenBerichten(berichten, extra) {
    const lijst = $('pdChatBerichten');
    const alle = (berichten || []).slice(-12);
    lijst.innerHTML = alle.map((b) => `<div class="pd-chat-bericht ${b.rol === 'ai' ? 'ai' : 'dylan'}">${esc(b.tekst)}</div>`).join('')
      + (extra ? `<div class="pd-chat-bericht ai ${extra.soort || ''}">${esc(extra.tekst)}</div>` : '');
    lijst.classList.toggle('hidden', !alle.length && !extra);
    lijst.scrollTop = lijst.scrollHeight;
  }

  window.pdChatToon = function (page) {
    if (!$('pdChatKaart') || !page) return;
    const campagne = (page.invoer && page.invoer._soort === 'campagne') || page.blueprint === 'campagne';
    const eigen = page.sjabloon && page.sjabloon.blueprint;
    $('pdChatUitleg').textContent = eigen
      ? 'Deze pagina heeft een eigen ontwerp. Vraag in gewone woorden wat er anders moet, ook aan de opbouw of vormgeving.'
      : `Vraag in gewone woorden wat er anders moet aan de tekst. ${campagne ? 'De AI schrijft volgens de regels voor campagnepagina\'s.' : 'De AI houdt rekening met SEO en GEO.'} De opbouw en vormgeving horen bij het sjabloon.`;
    $('pdChatStatus').textContent = '';
    tekenBerichten((page.sjabloon && page.sjabloon.berichten) || []);
  };

  async function wachtOpTaak(taakId) {
    for (let i = 0; i < 150; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const t = await lpApi('/chat/taak/' + encodeURIComponent(taakId));
      if (t.status !== 'bezig') return t;
    }
    throw new Error('Het duurt langer dan verwacht. Ververs de pagina over een minuut.');
  }

  async function verstuur() {
    const page = lpState.currentPage;
    const tekst = $('pdChatTekst').value.trim();
    if (!page || !tekst || bezig) return;
    bezig = true;
    $('pdChatVerstuur').disabled = true;
    const eerder = (page.sjabloon && page.sjabloon.berichten) || [];
    tekenBerichten([...eerder, { rol: 'dylan', tekst }], { tekst: 'Bezig...', soort: 'bezig' });
    $('pdChatStatus').textContent = 'Dit duurt meestal minder dan een minuut.';
    try {
      const { taakId } = await lpApi(`/pages/${page.id}/bijsturen`, { method: 'POST', body: JSON.stringify({ bericht: tekst }) });
      const t = await wachtOpTaak(taakId);
      if (t.status === 'fout') throw new Error(t.fout || 'Er ging iets mis.');
      $('pdChatTekst').value = '';
      const r = t.resultaat || {};
      // De pagina opnieuw ophalen: tekst, gesprek en (bij een eigen ontwerp) het sjabloon kunnen veranderd zijn.
      const { page: nieuw } = await lpApi(`/pages/${page.id}`);
      if (lpState.currentPage && lpState.currentPage.id === page.id) {
        lpState.currentPage = nieuw;
        try {
          const bp = await lpApi(`/clients/${nieuw.klant}/blueprints/${nieuw.blueprint}?pagina=${encodeURIComponent(nieuw.id)}`);
          lpState.currentPageBlueprint = bp.blueprint;
        } catch (e) { /* het oude sjabloon blijft staan */ }
        if (typeof renderContentJson === 'function') renderContentJson(nieuw, lpState.currentPageBlueprint);
        tekenBerichten(r.berichten || (nieuw.sjabloon && nieuw.sjabloon.berichten) || []);
        $('pdChatStatus').textContent = (r.waarschuwingen || []).join(' ') || (r.actie === 'geen' ? '' : 'Aangepast en bewaard.');
        if (r.actie !== 'geen' && typeof refreshPreview === 'function') await refreshPreview();
      }
    } catch (err) {
      tekenBerichten([...eerder, { rol: 'dylan', tekst }], { tekst: err.message, soort: 'fout' });
      $('pdChatStatus').textContent = '';
    } finally {
      bezig = false;
      $('pdChatVerstuur').disabled = false;
    }
  }

  if ($('pdChatVerstuur')) {
    $('pdChatVerstuur').addEventListener('click', verstuur);
    $('pdChatTekst').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); verstuur(); } });
  }
})();
