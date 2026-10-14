// Zijbalk van het portaal (Fase 7): welke groepen zichtbaar zijn, de teller bij Blogs, het mobiele menu
// en een eigen adres per tabblad (#blogs, #google). Het wisselen van tabblad zelf blijft switchTab() in app.js.
// De kleine rekenfuncties staan los van het scherm zodat ze getest kunnen worden.
(function () {
  const TITELS = {
    overzicht: 'Overzicht',
    blogs: 'Blogs',
    prestaties: 'Google',
    aiZichtbaarheid: 'AI zichtbaarheid',
    rapportages: 'Maandrapporten',
    merkprofiel: 'Merkprofiel',
    kennisdocument: 'Kennisdocument',
    paginas: 'Landingspagina\'s'
  };
  // Het adres gebruikt de woorden die de klant in het menu ziet, niet onze interne namen.
  const ADRES = {
    overzicht: 'overzicht',
    blogs: 'blogs',
    prestaties: 'google',
    aiZichtbaarheid: 'ai',
    rapportages: 'maandrapporten',
    merkprofiel: 'merkprofiel',
    kennisdocument: 'kennisdocument',
    paginas: 'paginas'
  };

  function hashVoorTab(tab) {
    return ADRES[tab] || '';
  }

  function tabUitHash(hash) {
    const woord = String(hash || '').replace(/^#/, '').toLowerCase();
    if (!woord) return null;
    const gevonden = Object.keys(ADRES).find((tab) => ADRES[tab] === woord);
    return gevonden || null;
  }

  // "Basecamp Utrecht" wordt "BU", "PPExport" wordt "PP", een lege naam wordt een streepje.
  function initialen(naam) {
    const woorden = String(naam || '').trim().split(/\s+/).filter(Boolean);
    if (!woorden.length) return '–';
    if (woorden.length === 1) return woorden[0].slice(0, 2).toUpperCase();
    return (woorden[0][0] + woorden[1][0]).toUpperCase();
  }

  // Aantal blogs dat wacht op de klant. Geen tekst bij nul, zodat er geen lege teller staat.
  function telWachtendOpReview(items, statusValues) {
    if (!Array.isArray(items) || !statusValues || !statusValues.review) return 0;
    return items.filter((i) => i && i.status === statusValues.review).length;
  }

  function tellerTekst(aantal) {
    return aantal > 0 ? String(aantal) : '';
  }

  const api = { hashVoorTab, tabUitHash, initialen, telWachtendOpReview, tellerTekst, TITELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  let actieveTab = 'overzicht';
  let gebruikerKlikte = false;
  let wachtOpTab = null;
  // Het tabblad uit het adres waarmee de pagina werd geopend. Het portaal opent eerst het Overzicht en gaat
  // pas daarna naar dit tabblad, dus het adres mag in de tussentijd niet worden overschreven.
  let gevraagdBijStart = tabUitHash(location.hash);

  const zij = () => document.getElementById('pSide');
  const scrim = () => document.getElementById('pScrim');
  const menuknop = () => document.getElementById('pMenuknop');

  function sluitMenu() {
    if (zij()) zij().classList.remove('open');
    if (scrim()) scrim().classList.remove('open');
    if (menuknop()) menuknop().setAttribute('aria-expanded', 'false');
  }

  function wisselMenu() {
    const open = !zij().classList.contains('open');
    zij().classList.toggle('open', open);
    scrim().classList.toggle('open', open);
    menuknop().setAttribute('aria-expanded', String(open));
  }

  // Een groep zonder zichtbare onderdelen verdwijnt, ook met het label. Zo ziet een klant zonder
  // Google cijfers of AI meting geen lege kop "Resultaten".
  function werkGroepenBij() {
    document.querySelectorAll('#tabNav .p-nav-groep').forEach((groep) => {
      const zichtbaar = Array.from(groep.querySelectorAll('.p-nav-item')).some((k) => !k.classList.contains('hidden'));
      groep.classList.toggle('hidden', !zichtbaar);
    });
  }

  function knopZichtbaar(tab) {
    const knop = document.querySelector('#tabNav .p-nav-item[data-tab="' + tab + '"]');
    return Boolean(knop) && !knop.classList.contains('hidden');
  }

  // Wordt aangeroepen door switchTab() in app.js bij elke tabwissel.
  window.portaalTabGewijzigd = function (tab) {
    actieveTab = tab;
    document.querySelectorAll('#tabNav .p-nav-item').forEach((k) => {
      if (k.dataset.tab === tab) k.setAttribute('aria-current', 'page');
      else k.removeAttribute('aria-current');
    });
    const titel = document.getElementById('pMobielTab');
    if (titel) titel.textContent = TITELS[tab] || '';
    const woord = hashVoorTab(tab);
    const adresBewaren = gevraagdBijStart && !gebruikerKlikte;
    if (woord && !adresBewaren && typeof history !== 'undefined' && location.hash !== '#' + woord) {
      try { history.replaceState(history.state, '', location.pathname + location.search + '#' + woord); } catch (e) { /* adres blijft dan zoals het was */ }
    }
    sluitMenu();
  };

  window.portaalVulKop = function (naam) {
    const av = document.getElementById('clientAvatar');
    if (av) av.textContent = initialen(naam);
    const m = document.getElementById('pMobielKlant');
    if (m) m.textContent = naam || '';
  };

  window.portaalVulTellers = function (state) {
    const teller = document.getElementById('blogsTeller');
    if (!teller) return;
    const tekst = tellerTekst(telWachtendOpReview(state && state.items, state && state.statusValues));
    teller.textContent = tekst;
    teller.classList.toggle('hidden', !tekst);
  };

  // Opent het tabblad uit het adres (#google) zodra het in het menu staat. Menu-onderdelen die pas na het
  // laden verschijnen (Merkprofiel, AI zichtbaarheid) worden hier ook gehaald: zodra het onderdeel zichtbaar
  // wordt en de klant nog nergens op klikte, gaat het portaal naar de gevraagde plek.
  window.portaalVraagTabUitAdres = function () {
    const tab = gevraagdBijStart;
    gevraagdBijStart = null;
    if (!tab || tab === actieveTab || typeof window.switchTab !== 'function') return;
    if (knopZichtbaar(tab)) { window.switchTab(tab); return; }
    wachtOpTab = tab;
  };

  function start() {
    const nav = document.getElementById('tabNav');
    if (!nav) return;
    nav.addEventListener('click', () => { gebruikerKlikte = true; wachtOpTab = null; });
    new MutationObserver(() => {
      werkGroepenBij();
      if (wachtOpTab && !gebruikerKlikte && knopZichtbaar(wachtOpTab) && typeof window.switchTab === 'function') {
        const tab = wachtOpTab;
        wachtOpTab = null;
        window.switchTab(tab);
      }
    }).observe(nav, { attributes: true, attributeFilter: ['class'], subtree: true });
    werkGroepenBij();

    const knop = menuknop();
    if (knop) knop.addEventListener('click', wisselMenu);
    const doek = scrim();
    if (doek) doek.addEventListener('click', sluitMenu);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sluitMenu(); });

    // Terug en vooruit in de browser: het adres bepaalt het tabblad.
    window.addEventListener('hashchange', () => {
      const tab = tabUitHash(location.hash);
      if (tab && tab !== actieveTab && knopZichtbaar(tab) && typeof window.switchTab === 'function') window.switchTab(tab);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
