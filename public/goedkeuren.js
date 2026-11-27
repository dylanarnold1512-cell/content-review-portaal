// De knop Goedkeuren zegt wanneer de blog dan live gaat (27-11-2026). Het moment zelf komt van de server
// (src/services/publicatieMoment.js, de enige plek met die regel) als { moment, tekst }. Hier staan alleen de zinnen.
(function () {
  const inAmsterdam = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' });
  const Format = () => (typeof window !== 'undefined' ? window.PortaalFormat : require('./portaal-format'));

  function knopTekst(live) {
    return live && live.tekst ? 'Goedkeuren, ' + live.tekst + ' live' : 'Goedkeuren';
  }

  // De zin onder de knop. Staat de blog later gepland, dan zeggen we dat goedkeuren hem eerder online zet.
  function uitlegTekst(live, publicatiedatum) {
    if (!live || !live.tekst) return '';
    let zin = 'Keur je deze blog goed, dan staat hij ' + live.tekst + ' op je website.';
    const gepland = String(publicatiedatum || '').slice(0, 10);
    const liveDag = live.moment ? inAmsterdam().format(new Date(live.moment)) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(gepland) && liveDag && gepland > liveDag) {
      zin += ' Dat is eerder dan de geplande datum van ' + Format().datumLang(gepland) + '.';
    }
    return zin;
  }

  function goedgekeurdTekst(live) {
    return live && live.tekst ? 'Goedgekeurd. Deze blog gaat ' + live.tekst + ' live.' : '';
  }

  // ---------- In het blogdetail ----------
  let timer = null;
  let huidig = null;
  // Net goedgekeurd: de bevestiging bovenaan in beeld brengen, want de klant staat onderaan bij de knop.
  let netGoedgekeurdId = null;
  function netGoedgekeurd(itemId) { netGoedgekeurdId = itemId; }

  function tekenen(item) {
    const knop = document.getElementById('approveBtn');
    const uitleg = document.getElementById('goedkeurUitleg');
    const klaar = document.getElementById('goedgekeurdMelding');
    if (knop) knop.textContent = knopTekst(item.liveNaGoedkeuren);
    if (uitleg) uitleg.textContent = uitlegTekst(item.liveNaGoedkeuren, item.publicatiedatum);
    if (klaar) klaar.textContent = goedgekeurdTekst(item.liveNaGoedkeuren);
    return Boolean(knop || klaar);
  }

  // Blijft het scherm open staan, dan klopt "vandaag om 11:00" na 11:00 of na middernacht niet meer.
  // Dan halen we het moment opnieuw op. De rest van de pagina (opmerkingen van de klant) blijft staan.
  function plan() {
    clearTimeout(timer);
    if (!huidig || !huidig.item.liveNaGoedkeuren) return;
    const nu = new Date();
    const middernacht = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() + 1).getTime();
    const moment = Date.parse(huidig.item.liveNaGoedkeuren.moment) || middernacht;
    huidig.geldigTot = Math.min(moment, middernacht);
    timer = setTimeout(ververs, Math.max(0, huidig.geldigTot - nu.getTime()) + 2000);
  }

  async function ververs() {
    const voor = huidig;
    if (!voor) return;
    try {
      const vers = await voor.ophalen();
      if (huidig !== voor) return;
      voor.item = vers;
      if (tekenen(vers)) plan();
    } catch (err) { /* volgende keer opnieuw */ }
  }

  function toon(item, ophalen) {
    huidig = { item, ophalen, geldigTot: 0 };
    if (tekenen(item)) plan();
    const klaar = document.getElementById('goedgekeurdMelding');
    if (klaar && netGoedgekeurdId === item.id) {
      netGoedgekeurdId = null;
      klaar.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  const api = { knopTekst, uitlegTekst, goedgekeurdTekst };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.Goedkeuren = Object.assign({ toon, netGoedgekeurd }, api);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && huidig && huidig.geldigTot && Date.now() >= huidig.geldigTot) ververs();
    });
  }
})();
