// Getallen en datums voor het hele portaal, op één plek en altijd Nederlands.
// Eerder schreef elk tabblad zijn eigen cijfers (2207 en 2.207, 9.3 en 9,3, 2027-01-26 en 26 jan).
// Alles wat de klant leest als getal of datum loopt vanaf Fase 7 hierlangs.
// Bewust zonder Intl, zodat de uitkomst overal gelijk is (browser, Node, tests).
(function () {
  const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  const MAANDEN_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  function isGetal(n) {
    return typeof n === 'number' && Number.isFinite(n);
  }

  // 2207 wordt "2.207", 1234567 wordt "1.234.567", min één wordt "-1".
  function getal(n) {
    if (!isGetal(n)) return '';
    const afgerond = Math.round(n);
    const min = afgerond < 0 ? '-' : '';
    return min + String(Math.abs(afgerond)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // Met komma: decimaal(9.3) is "9,3", decimaal(19, 1) is "19,0".
  function decimaal(n, cijfers) {
    if (!isGetal(n)) return '';
    const d = cijfers == null ? 1 : cijfers;
    const vast = Math.abs(n).toFixed(d);
    const delen = vast.split('.');
    const heel = delen[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const nul = Number(vast) === 0;
    return (n < 0 && !nul ? '-' : '') + (delen[1] ? heel + ',' + delen[1] : heel);
  }

  // Gemiddelde positie in Google, altijd met één decimaal.
  function positie(n) {
    return decimaal(n, 1);
  }

  // Een aandeel als geheel percentage: procent(5.6) is "6%". Geeft een vraagstreep bij geen cijfer.
  function procent(n) {
    if (!isGetal(n)) return '';
    return String(Math.round(n)) + '%';
  }

  // Het verschil tussen nu en een periode eerder, in woorden die een klant begrijpt.
  // Bij kleine aantallen is een percentage misleidend (van 2 naar 5 is "+150%"), dus dan het
  // absolute verschil. Bij een positie is lager beter: lagerIsBeter draait dan de kleur om.
  // Geeft { tekst, toon } met toon 'goed', 'slecht' of 'gelijk'. Zonder vergelijking: null.
  function verschil(nu, voor, opties) {
    if (!isGetal(nu) || !isGetal(voor)) return null;
    const o = opties || {};
    const delta = nu - voor;
    if (delta === 0) return { tekst: 'gelijk', toon: 'gelijk' };
    const beter = o.lagerIsBeter ? delta < 0 : delta > 0;
    const toon = beter ? 'goed' : 'slecht';
    const teken = delta > 0 ? '+' : '-';
    const klein = Math.max(Math.abs(nu), Math.abs(voor)) < 20 || voor === 0;
    if (o.decimalen != null) return { tekst: teken + decimaal(Math.abs(delta), o.decimalen), toon };
    if (klein) return { tekst: teken + getal(Math.abs(delta)), toon };
    return { tekst: teken + String(Math.round(Math.abs(delta) / Math.abs(voor) * 100)) + '%', toon };
  }

  // Leest 2026-10-20, 2026-10-20T00:00:00.000+02:00 of een Date. Geeft { j, m, d } of null.
  // Bij een tekst met datum erin telt alleen de datum zelf, zodat een tijdzone de dag niet verschuift.
  function deel(waarde) {
    if (!waarde) return null;
    if (waarde instanceof Date) {
      if (Number.isNaN(waarde.getTime())) return null;
      return { j: waarde.getFullYear(), m: waarde.getMonth() + 1, d: waarde.getDate() };
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(waarde));
    if (!m) return null;
    const j = Number(m[1]);
    const mnd = Number(m[2]);
    const d = Number(m[3]);
    if (mnd < 1 || mnd > 12 || d < 1 || d > 31) return null;
    return { j, m: mnd, d };
  }

  // 20 okt
  function datumKort(waarde) {
    const x = deel(waarde);
    return x ? x.d + ' ' + MAANDEN_KORT[x.m - 1] : '';
  }

  // 20 okt 2026, of 26 jan 2027
  function datumMetJaar(waarde) {
    const x = deel(waarde);
    return x ? x.d + ' ' + MAANDEN_KORT[x.m - 1] + ' ' + x.j : '';
  }

  // 20 oktober 2026
  function datumLang(waarde) {
    const x = deel(waarde);
    return x ? x.d + ' ' + MAANDEN[x.m - 1] + ' ' + x.j : '';
  }

  // "2026-09" of een datum wordt "september 2026".
  function maand(waarde) {
    const m = /^(\d{4})-(\d{2})/.exec(String(waarde || ''));
    if (!m) return '';
    const nr = Number(m[2]);
    if (nr < 1 || nr > 12) return '';
    return MAANDEN[nr - 1] + ' ' + m[1];
  }

  // De dag van de week voor een planning: "ma", "di", enzovoort.
  function dagNaam(waarde) {
    const x = deel(waarde);
    if (!x) return '';
    const dag = new Date(Date.UTC(x.j, x.m - 1, x.d)).getUTCDay();
    return ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'][dag];
  }

  const api = { getal, decimaal, positie, procent, verschil, datumKort, datumMetJaar, datumLang, maand, dagNaam };
  if (typeof window !== 'undefined') window.PortaalFormat = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
