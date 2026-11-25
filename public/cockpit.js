// Cockpit in de admin: alle klanten op kleur, alleen de afwijkingen in beeld.
// Gebruikt adminApi, escapeHtmlAdmin, adminInitialen en gaNaar uit admin.js.
(function () {
  const KLEUR = {
    rood: { label: 'Direct aandacht', pil: 'p-pil-fout' },
    oranje: { label: 'Let op', pil: 'p-pil-let-op' },
    groen: { label: 'Draait goed', pil: 'p-pil-goed' },
    uit: { label: 'Uit', pil: 'p-pil-neutraal' }
  };

  const SOORT = { techniek: 'Techniek', kwaliteit: 'Kwaliteit', blog: 'Blog', data: 'Data', klant: 'Klant' };

  function tellingen(data) {
    const t = { rood: 0, oranje: 0, groen: 0, uit: 0 };
    for (const k of (data && data.klanten) || []) t[k.kleur] = (t[k.kleur] || 0) + 1;
    return t;
  }

  // Teller in het menu: het aantal meldingen (rood en oranje) in de lijst van de cockpit, dus exact het getal bij Alles.
  // De steekproef heeft zijn eigen teller in zijn kaart en telt hier niet mee.
  function aandacht(data) {
    if (!data) return 0;
    const tel = (lijst) => (lijst || []).filter((s) => s.niveau === 'rood' || s.niveau === 'oranje').length;
    return tel(data.gedeeld && data.gedeeld.signalen) + (data.klanten || []).reduce((n, k) => n + tel(k.signalen), 0);
  }

  function tijd(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }


  // Wat een melding betekent en wat jij eraan doet. De eerste regel die past wint, daarna de standaard per soort.
  const UITLEG = [
    { re: /(staat|staan) op Fout/, wat: 'De workflow kon dit blog niet afmaken. In Notion staat bij het blog een foutmelding.', doe: 'Open het blog in Notion en lees Laatste foutmelding. Vraag Claude de oorzaak te zoeken. Zet het blog daarna terug op Gepland, dan schrijft de workflow het opnieuw.' },
    { re: /hangt|hangen/, wat: 'De workflow is begonnen met schrijven en nooit klaar gekomen. Het blog blijft op In generatie staan en wordt niet meer opgepakt.', doe: 'Kijk in n8n of de run is gestopt. Zet het blog terug op Gepland met een datum van vandaag, dan gaat het opnieuw.' },
    { re: /niet geschreven terwijl de datum/, wat: 'Deze blogs stonden gepland, de datum is voorbij en er is niets geschreven.', doe: 'Controleer of de Blog Generatie van deze klant draait en of de klant niet gepauzeerd staat. Zet de datum op vandaag.' },
    { re: /Geen blog gepland/, wat: 'Er staat niets meer in de planning voor de komende weken. Straks komt er dus geen blog meer uit.', doe: 'Keur nieuwe onderwerpen goed bij Ideeën, of draai de Topic Generator van deze klant.' },
    { re: /Laatste publicatie was/, wat: 'Er is al lang geen blog meer gepubliceerd voor deze klant.', doe: 'Kijk of er blogs gepland staan en of de Publicatie Sync draait. Meestal zit het ergens in de planning vast.' },
    { re: /mislukte run/, wat: 'Een n8n workflow is mislukt. Welke stap misging staat in de details.', doe: 'Open de run in n8n, lees bij welke stap het misging en vraag Claude de oorzaak te zoeken. Daarna de run opnieuw starten.' },
    { re: /draait niet meer/, wat: 'Een workflow heeft al lang geen geslaagde run meer gehad, terwijl hij dat dagelijks hoort te hebben.', doe: 'Open de workflow in n8n. Staat hij nog op actief en draait de trigger? Zo niet, zet hem weer aan.' },
    { re: /QA afkeuring/, wat: 'De kwaliteitscontrole keurt blogs vaker af dan normaal. De schrijfstap haalt de controle dus niet steeds.', doe: 'Lees de afkeurredenen in de details. Komt dezelfde reden terug, dan moet de prompt of het kennisdocument van deze klant worden aangepast.' },
    { re: /herschrijving/, wat: 'Een blog is na feedback van de klant herschreven en haalde de controle niet.', doe: 'Open het blog en kijk wat er is veranderd. Pas het zo nodig zelf aan voordat de klant het ziet.' },
    { re: /door jou afgekeurd/, wat: 'Je hebt blogs uit de steekproef afgekeurd.', doe: 'Lees je eigen opmerkingen terug. Komt dezelfde klacht vaker terug, pas dan de prompt aan.' },
    { re: /wees .* af/, wat: 'De klant wijst veel blogs af. Het schrijven past dus niet goed bij wat de klant wil.', doe: 'Lees de feedback in de details en bel of mail de klant. Pas daarna het kennisdocument of de toon aan.' },
    { re: /Prestatiedata is/, wat: 'De dagelijkse prestatiesync heeft de cijfers van deze klant al een tijd niet bijgewerkt.', doe: 'Kijk of de Prestatie Sync draait en of de koppeling met Search Console en GA4 nog werkt.' },
    { re: /Vertoningen|Clicks/, wat: 'Het verkeer uit Google is lager dan in de 28 dagen ervoor.', doe: 'Kijk in Search Console of een enkele pagina is weggevallen of dat het breder speelt. Pas dan geen blogs aan voordat je weet waar de daling zit.' },
    { re: /wacht.* op goedkeuring/, wat: 'De klant heeft blogs te lang laten liggen en het portaal wacht op een reactie.', doe: 'Stuur de klant een herinnering of bel even. De Ter Review Reminder doet dit ook, maar een persoonlijk bericht werkt beter.' },
    { re: /niet in het portaal/, wat: 'De klant is al lang niet ingelogd in het portaal.', doe: 'Neem contact op en vraag of ze nog tevreden zijn. Meestal is een korte check genoeg.' },
    { re: /Live URL/, wat: 'In Notion staat geen Live URL bij deze gepubliceerde blogs. Daardoor kunnen metingen en interne linking ze niet vinden.', doe: 'Vul de Live URL in bij het blog in Notion, of draai de Publicatie Sync opnieuw.' },
    { re: /SEO titel/, wat: 'Bij deze blogs ontbreekt een SEO titel of omschrijving.', doe: 'Vul ze aan in Notion en WordPress, of laat de SEO stap van de Blog Generatie opnieuw lopen.' },
    { re: /interne link/, wat: 'Deze blogs verwijzen niet naar andere pagina\'s van de site. Dat kost SEO waarde.', doe: 'Laat de Interne Linking voor deze blogs opnieuw lopen, of voeg handmatig één of twee links toe.' },
    { re: /tussenkoppen/, wat: 'Deze blogs hebben geen tussenkoppen en lezen daardoor als een lange tekst.', doe: 'Open de blogs en laat de tekst herschrijven met tussenkoppen via Feedback Revisie.' },
    { re: /afbeelding/, wat: 'Deze blogs hebben geen uitgelichte afbeelding in WordPress.', doe: 'Controleer of de beeldbank van de klant gevuld is en voeg een afbeelding toe.' },
    { re: /geblokkeerd/, wat: 'Google mag deze blogs niet indexeren of ziet een andere pagina als hoofdversie.', doe: 'Controleer in WordPress of noindex of een canonical aanstaat. Dit moet snel worden opgelost.' },
    { re: /niet in Google/, wat: 'Deze blogs staan na drie weken nog niet in Google.', doe: 'Vraag indexering aan in Search Console en kijk of de blog is gelinkt vanaf andere pagina\'s.' }
  ];
  const STANDAARD_UITLEG = {
    techniek: { wat: 'Er is iets technisch misgegaan of vastgelopen.', doe: 'Open de link naar n8n als die er is, en vraag Claude de oorzaak te zoeken.' },
    kwaliteit: { wat: 'De kwaliteit van de blogs voor deze klant wijkt af.', doe: 'Lees de details en pas zo nodig de prompt of het kennisdocument aan.' },
    blog: { wat: 'Aan gepubliceerde blogs ontbreekt iets.', doe: 'Open de blogs in de details en vul aan wat mist.' },
    data: { wat: 'De cijfers van deze klant wijken af.', doe: 'Kijk in het tabblad Prestaties van de klant waar het verschil zit.' },
    klant: { wat: 'De klant moet iets doen, of reageert niet.', doe: 'Neem contact op met de klant.' }
  };
  function uitlegVan(s) {
    const gevonden = UITLEG.find((u) => u.re.test(s.tekst || ''));
    return gevonden || STANDAARD_UITLEG[s.soort] || { wat: 'Dit vraagt aandacht.', doe: 'Open de details en beslis wat er moet gebeuren.' };
  }

  // Alle meldingen van alle klanten en de gedeelde workflows in één lijst, ernstigste eerst. Info telt niet mee.
  function meldingenVan(data) {
    if (!data) return [];
    const lijst = [];
    const voeg = (s, klant) => { if (s.niveau !== 'info') lijst.push({ ...s, klantNaam: klant.naam, klantId: klant.id || '', gedeeld: !!klant.gedeeld }); };
    for (const s of (data.gedeeld && data.gedeeld.signalen) || []) voeg(s, { naam: 'Alle klanten', gedeeld: true });
    for (const k of data.klanten || []) for (const s of k.signalen || []) voeg(s, k);
    const rang = { rood: 0, oranje: 1 };
    return lijst.map((m, i) => ({ m, i })).sort((a, b) => (rang[a.m.niveau] - rang[b.m.niveau]) || (a.i - b.i)).map((x) => x.m);
  }

  const AVATAARKLEUREN = ['#3a5fd9', '#17885a', '#6a35ff', '#9a5a00', '#c2410c', '#0e7490', '#a21caf', '#4d7c0f'];
  function avatarKleur(naam) {
    let h = 0;
    for (const c of String(naam || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return AVATAARKLEUREN[h % AVATAARKLEUREN.length];
  }

  function kopieerTekst(m) {
    const u = uitlegVan(m);
    return [
      `Cockpit melding (${m.niveau}, ${SOORT[m.soort] || m.soort}) voor ${m.klantNaam}`,
      m.tekst,
      ...(m.details && m.details.length ? ['Details:', ...m.details.map((d) => `- ${d}`)] : []),
      `Wat het betekent: ${u.wat}`,
      m.link ? `n8n: ${m.link}` : '',
      'Zoek uit wat de oorzaak is en stel een oplossing voor.'
    ].filter(Boolean).join('\n');
  }

  // Alles wat op jou wacht naast de meldingen: Pagr. pagina's, ideeën van klanten, onboarding, FAQ en backlog.
  // Een regel per klant per soort, zodat de lijst kort blijft. Elke regel weet waar je heen moet.
  function meervoud(n, een, meer) { return `${n} ${n === 1 ? een : meer}`; }
  function takenVan(bron) {
    const b = bron || {};
    const naamVan = (id, terug) => ((b.klanten || []).find((k) => k.id === id) || {}).naam || terug || id;
    const lijst = [];
    for (const k of b.pagr || []) {
      const titels = (x) => (x || []).map((p) => p.titel).filter(Boolean);
      if ((k.controleren || []).length) lijst.push({ soort: 'pagr', klantId: k.klant, klantNaam: naamVan(k.klant, k.naam), titel: k.controleren.length === 1 ? '1 pagina wacht op jouw controle' : `${k.controleren.length} pagina's wachten op jouw controle`, sub: titels(k.controleren).join(', '), naar: { view: 'klant', tab: 'pagr' } });
      if ((k.fout || []).length) lijst.push({ soort: 'pagr', klantId: k.klant, klantNaam: naamVan(k.klant, k.naam), titel: k.fout.length === 1 ? '1 pagina is mislukt' : `${k.fout.length} pagina's zijn mislukt`, sub: titels(k.fout).join(', '), naar: { view: 'klant', tab: 'pagr' }, ernstig: true });
      if (k.voorstellen) lijst.push({ soort: 'pagr', klantId: k.klant, klantNaam: naamVan(k.klant, k.naam), titel: `${meervoud(k.voorstellen, 'voorstel wacht', 'voorstellen wachten')} op akkoord`, sub: 'Plan van het systeem voor de komende maand', naar: { view: 'klant', tab: 'pagr' } });
      if (k.ideeen) lijst.push({ soort: 'pagr', klantId: k.klant, klantNaam: naamVan(k.klant, k.naam), titel: `${meervoud(k.ideeen, 'paginaidee', 'paginaideeën')} van de klant`, sub: 'Beoordelen in de werkplaats', naar: { view: 'klant', tab: 'pagr' } });
    }
    for (const [id, ideeen] of Object.entries(b.ideeen || {})) {
      if (!(ideeen || []).length) continue;
      lijst.push({ soort: 'idee', klantId: id, klantNaam: naamVan(id), titel: `${meervoud(ideeen.length, 'blogidee wacht', 'blogideeën wachten')} op jouw oordeel`, sub: ideeen.map((x) => x.titel).filter(Boolean).join(', '), naar: { view: 'klant', tab: 'ideeen' } });
    }
    for (const o of b.onboarding || []) {
      const w = (o.samenvatting && o.samenvatting.wachtOpDylan) || [];
      if (!w.length || (o.samenvatting && o.samenvatting.gereed)) continue;
      lijst.push({ soort: 'onboarding', klantId: o.portaalId || o.clientId, klantNaam: o.klant, titel: w.length === 1 ? `Onboarding: ${w[0].titel}` : `Onboarding: ${w.length} stappen wachten op jou`, sub: w.length === 1 ? (w[0].uitkomst || 'Stap ' + w[0].nr) : w.map((r) => r.titel).join(', '), naar: { view: 'klant', tab: 'onboarding' } });
    }
    const faq = b.faq || [];
    if (faq.length) lijst.push({ soort: 'faq', klantId: '', klantNaam: 'Alle klanten', titel: `${meervoud(faq.length, 'FAQ aanpassing is', 'FAQ aanpassingen zijn')} niet gelukt`, sub: faq.map((r) => r.klant).filter((x, i, a) => x && a.indexOf(x) === i).join(', '), naar: { view: 'faq' } });
    const backlog = (b.backlog || []).filter((p) => p.status === 'Wacht op Dylan');
    if (backlog.length) lijst.push({ soort: 'backlog', klantId: '', klantNaam: 'Blogr. en Pagr.', titel: `${meervoud(backlog.length, 'backlogpunt wacht', 'backlogpunten wachten')} op jou`, sub: backlog.slice(0, 3).map((p) => p.titel).join(', ') + (backlog.length > 3 ? ` en ${backlog.length - 3} meer` : ''), naar: { view: 'backlog' } });
    const volgorde = { pagr: 0, idee: 1, onboarding: 2, faq: 3, backlog: 4 };
    return lijst.map((t, i) => ({ t, i })).sort((x, y) => (Number(!x.t.ernstig) - Number(!y.t.ernstig)) || (volgorde[x.t.soort] - volgorde[y.t.soort]) || (x.i - y.i)).map((x) => x.t);
  }

  // Korte regel onder een melding: de klant, en alleen de eerste regel uit de details als die kort is. Nooit een halve zin.
  function korteSub(m) {
    const d = m.details || [];
    if (!d.length) return m.klantNaam;
    const eerste = String(d[0]);
    if (eerste.length <= 80) return `${m.klantNaam}: ${eerste}${d.length > 1 ? ` en ${d.length - 1} meer` : ''}`;
    return `${m.klantNaam}: ${d.length === 1 ? 'klik voor de details' : `${d.length} punten, klik voor de details`}`;
  }

  const model = { tellingen, aandacht, KLEUR, uitlegVan, meldingenVan, avatarKleur, kopieerTekst, takenVan, korteSub };
  if (typeof module !== 'undefined' && module.exports) { module.exports = model; return; }

  let stand = { data: null, fout: '', laden: false, filter: 'alles' };

  function datumKort(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
  }

  function avatar(naam, klein) {
    return `<span class="ck-av${klein ? ' ck-av-klein' : ''}" style="background:${avatarKleur(naam)}" aria-hidden="true">${escapeHtmlAdmin(adminInitialen(naam))}</span>`;
  }

  function meldingRij(m, i) {
    const e = escapeHtmlAdmin;
    const rood = m.niveau === 'rood';
    return `<li><button type="button" class="ck-rij" data-melding="${i}">
      ${avatar(m.klantNaam)}
      <span class="ck-rij-tekst"><b>${e(m.tekst)}</b><span>${e(korteSub(m))}</span></span>
      <span class="ck-soort">${e(SOORT[m.soort] || m.soort)}</span>
      <span class="p-pil ${rood ? 'p-pil-fout' : 'p-pil-let-op'}">${rood ? 'Rood' : 'Oranje'}</span>
      <svg class="p-i ck-pijl" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
    </button></li>`;
  }

  const TAAK_SOORT = { pagr: 'Pagr.', idee: 'Idee', onboarding: 'Onboarding', faq: 'FAQ', backlog: 'Backlog' };
  function taakRij(t, i) {
    const e = escapeHtmlAdmin;
    return `<li><button type="button" class="ck-rij" data-taak="${i}">
      ${t.klantId ? avatar(t.klantNaam) : '<span class="ck-av ck-av-alle" aria-hidden="true">A</span>'}
      <span class="ck-rij-tekst"><b>${e(t.titel)}</b><span>${e(t.klantNaam)}${t.sub ? `: ${e(t.sub.length > 110 ? t.sub.slice(0, t.sub.lastIndexOf(',', 110) > 40 ? t.sub.lastIndexOf(',', 110) : 110) + ' en meer' : t.sub)}` : ''}</span></span>
      <span class="ck-soort">${e(TAAK_SOORT[t.soort] || t.soort)}</span>
      <span class="p-pil ${t.ernstig ? 'p-pil-fout' : 'p-pil-plan'}">${t.ernstig ? 'Mislukt' : 'Te doen'}</span>
      <svg class="p-i ck-pijl" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
    </button></li>`;
  }

  function openTaak(t) {
    if (!t || !t.naar) return;
    if (t.naar.view === 'klant' && t.klantId) { gaNaar('klant', t.klantId, t.naar.tab); return; }
    if (t.naar.view === 'backlog' && window.zetBacklogFilter) window.zetBacklogFilter({ status: 'Wacht op Dylan' });
    gaNaar(t.naar.view);
  }

  function steekproefHtml(sp, klantNaam) {
    const e = escapeHtmlAdmin;
    if (!sp || !sp.blogs || !sp.blogs.length) return '';
    const zichtbaar = sp.blogs.map((b, i) => ({ b, i })).filter((x) => !klantNaam || x.b.klantNaam === klantNaam);
    if (!zichtbaar.length) return '';
    const open = zichtbaar.filter((x) => !x.b.oordeel).length;
    const rijen = zichtbaar.map(({ b, i }) => {
      const oordeel = b.oordeel
        ? `<span class="p-pil ${b.oordeel === 'goed' ? 'p-pil-goed' : 'p-pil-fout'}">${b.oordeel === 'goed' ? 'Goed' : 'Niet goed'}</span>${b.opmerking ? `<span class="ck-sp-opm">${e(b.opmerking)}</span>` : ''}`
        : `<div class="ck-sp-knoppen"><button type="button" class="p-knop" data-sp-goed="${i}">Goed</button><button type="button" class="p-knop" data-sp-niet="${i}">Niet goed</button></div>
           <div class="ck-sp-form hidden" data-sp-form="${i}"><textarea rows="2" placeholder="Wat is er niet goed? Bijvoorbeeld: te algemeen, verkeerde toon, feit klopt niet" data-sp-tekst="${i}"></textarea><button type="button" class="p-knop p-knop-hoofd" data-sp-opslaan="${i}">Opslaan</button></div>`;
      return `<li class="ck-sp-rij">
        <div class="ck-sp-info"><a href="${e(b.url)}" target="_blank" rel="noopener">${e(b.titel)}</a><span>${e(b.klantNaam)}, gepubliceerd ${e(datumKort(b.datum))}</span></div>
        <div class="ck-sp-oordeel">${oordeel}</div>
      </li>`;
    }).join('');
    return `
      <section class="ck-kaart" aria-labelledby="ckSpKop">
        <div class="ck-kaart-kop"><div><h2 id="ckSpKop">Steekproef van de week ${open ? `<span class="p-teller">${open}</span>` : ''}</h2><p>Lees er een paar, de rest vertrouw je</p></div></div>
        <ul class="ck-sp">${rijen}</ul>
      </section>`;
  }

  function perKlantHtml(klanten) {
    const e = escapeHtmlAdmin;
    const rijen = klanten.map((k) => {
      const tel = { rood: 0, oranje: 0 };
      for (const s of k.signalen || []) if (tel[s.niveau] !== undefined) tel[s.niveau]++;
      const pillen = k.kleur === 'uit'
        ? '<span class="p-pil p-pil-neutraal">Niet actief</span>'
        : (!tel.rood && !tel.oranje
          ? '<span class="p-pil p-pil-goed">Draait goed</span>'
          : `${tel.rood ? `<span class="p-pil p-pil-fout">${tel.rood} rood</span>` : ''}${tel.oranje ? `<span class="p-pil p-pil-let-op">${tel.oranje} oranje</span>` : ''}`);
      return `<li><button type="button" class="ck-kl" data-beheer="${e(k.id)}">
        ${avatar(k.naam)}
        <span class="ck-rij-tekst"><b>${e(k.naam)}</b><span>${e(k.producten === 'Geen van beide' ? 'Eigen werk' : (k.producten || ''))}</span></span>
        <span class="ck-pillen">${pillen}</span>
      </button></li>`;
    }).join('');
    return `
      <section class="ck-kaart" aria-labelledby="ckKlKop">
        <div class="ck-kaart-kop"><div><h2 id="ckKlKop">Per klant</h2><p>Aantal open meldingen</p></div></div>
        <ul class="ck-lijst">${rijen}</ul>
      </section>`;
  }

  function teken() {
    const root = document.getElementById('viewCockpit');
    if (!root) return;
    const e = escapeHtmlAdmin;
    const d = stand.data;
    const kop = `
    <div class="p-ov-kop">
      <div><h1>Cockpit</h1><p>Alles wat op jou wacht, op één plek. Wat goed gaat zie je hier niet.</p></div>
      <div class="p-ov-kop-acties ck-kop-acties">
        ${d ? kiezerHtml(d.klanten.map((k) => ({ id: k.id, naam: k.naam }))) : ''}
        ${d ? `<span class="ck-tijd">Laatst gecontroleerd om ${e(tijd(d.bijgewerkt))}</span>` : ''}
        <button type="button" class="p-knop" data-ververs ${stand.laden ? 'disabled' : ''}>${stand.laden ? 'Bezig met controleren' : 'Opnieuw controleren'}</button>
      </div>
    </div>`;
    if (!d) {
      root.innerHTML = `<div class="p-pagina">${kop}<div class="p-kaart ck-leeg">${stand.fout ? `De cockpit kon niet worden geladen: ${e(stand.fout)}` : 'Alle klanten worden gecontroleerd. Dit duurt ongeveer een halve minuut.'}</div></div>`;
      bind(root);
      return;
    }
    if (adminState.klantKeuze && !d.klanten.some((k) => k.id === adminState.klantKeuze)) adminState.klantKeuze = '';
    const keuze = adminState.klantKeuze;
    const gekozen = keuze ? d.klanten.find((k) => k.id === keuze) : null;
    const alle = meldingenVan(d).filter((m) => !keuze || m.klantId === keuze);
    const taken = takenVan(window.cockpitTakenBron ? window.cockpitTakenBron() : {}).filter((t) => !keuze || t.klantId === keuze);
    stand.meldingen = alle;
    stand.taken = taken;
    const rood = alle.filter((m) => m.niveau === 'rood').length;
    const oranje = alle.length - rood;
    const sp = ((d.steekproef && d.steekproef.blogs) || []).filter((b) => !gekozen || b.klantNaam === gekozen.naam);
    const beoordeeld = sp.filter((b) => b.oordeel).length;
    // Volgorde: eerst rood, dan wat jij moet doen, dan oranje.
    const regels = [
      ...alle.map((m, i) => ({ soort: 'melding', m, i })).filter((x) => x.m.niveau === 'rood'),
      ...taken.map((t, i) => ({ soort: 'taak', t, i })),
      ...alle.map((m, i) => ({ soort: 'melding', m, i })).filter((x) => x.m.niveau !== 'rood')
    ];
    const past = (x) => stand.filter === 'alles'
      || (stand.filter === 'doen' && x.soort === 'taak')
      || (x.soort === 'melding' && x.m.niveau === stand.filter);
    const zichtbaar = regels.filter(past);
    const knop = (id, tekst, n) => `<button type="button" class="${stand.filter === id ? 'on' : ''}" data-filter="${id}" aria-pressed="${stand.filter === id}">${tekst}${n !== undefined ? ` <span class="ck-n">${n}</span>` : ''}</button>`;
    root.innerHTML = `
    <div class="p-pagina">
      ${kop}
      <div class="ck-kpis">
        <div class="ck-kpi ck-kpi-todo"><div class="ck-kpi-l"><span class="ck-dot ck-dot-plan"></span>Te doen</div><div class="ck-kpi-v">${taken.length}</div><div class="ck-kpi-s">${taken.length ? 'pagina\'s, ideeën, onboarding en backlog' : 'niets wacht op jou'}</div></div>
        <div class="ck-kpi"><div class="ck-kpi-l"><span class="ck-dot ${rood ? 'ck-dot-rood' : 'ck-dot-groen'}"></span>Meldingen</div><div class="ck-kpi-v">${alle.length}</div><div class="ck-kpi-s">${alle.length ? `${rood} direct oppakken, ${oranje} binnenkort kijken` : 'alles draait'}</div></div>
        <div class="ck-kpi"><div class="ck-kpi-l"><span class="ck-dot ck-dot-groen"></span>Steekproef van de week</div><div class="ck-kpi-v">${beoordeeld}<small> van ${sp.length}</small></div><div class="ck-kpi-s">blogs beoordeeld</div></div>
      </div>
      ${(d.problemen || []).map((p) => `<div class="ck-probleem">${e(p)}</div>`).join('')}
      <div class="ck-kolommen">
        <section class="ck-kaart ck-hoofd" aria-labelledby="ckMKop">
          <div class="ck-kaart-kop">
            <div><h2 id="ckMKop">Om weg te werken</h2><p>Klik op een regel voor uitleg of om het meteen te doen. Is het opgelost, dan verdwijnt hij vanzelf.</p></div>
            <div class="ck-seg" role="group" aria-label="Filter">${knop('alles', 'Alles', regels.length)}${knop('doen', 'Te doen', taken.length)}${knop('rood', 'Rood', rood)}${knop('oranje', 'Oranje', oranje)}</div>
          </div>
          ${zichtbaar.length ? `<ul class="ck-lijst">${zichtbaar.map((x) => (x.soort === 'taak' ? taakRij(x.t, x.i) : meldingRij(x.m, x.i))).join('')}</ul>` : `<div class="ck-leeg">${regels.length ? 'Niets met dit filter.' : 'Niets dat op jou wacht. Alles draait.'}</div>`}
        </section>
        <div class="ck-zij">
          ${steekproefHtml(d.steekproef, gekozen && gekozen.naam)}
          ${gekozen ? '' : perKlantHtml(d.klanten)}
        </div>
      </div>
      <details class="ck-uitleg-blok"><summary>Wat wordt er gecontroleerd</summary>
        <ul>
          <li><b>Te doen:</b> Pagr. pagina's die op jouw controle wachten of mislukt zijn, voorstellen en ideeën van klanten, blogideeën ter beoordeling, onboardingstappen die op jou wachten, FAQ aanpassingen die niet gelukt zijn en backlogpunten die op jou wachten.</li>
          <li><b>Techniek:</b> blogs op Fout of vastgelopen, geplande blogs die te laat zijn, een planning die leegloopt, de laatste publicatie, mislukte n8n runs in 7 dagen, workflows die niet meer draaien, prestatiedata die niet meer wordt bijgewerkt en de kritieke punten uit de Clients tabel.</li>
          <li><b>Blog:</b> per gepubliceerde blog van de laatste 4 maanden: na 21 dagen nog niet in Google of geblokkeerd, geen interne link, geen tussenkoppen, geen SEO titel of omschrijving, geen Live URL en geen uitgelichte afbeelding.</li>
          <li><b>Kwaliteit:</b> 3 of meer QA afkeuringen in 14 dagen, herschrijvingen na feedback die de controle niet halen, en een klant die 40% of meer van de blogs afwijst (60 dagen, vanaf 3 beoordelingen).</li>
          <li><b>Data:</b> vertoningen 25% of clicks 30% lager dan de 28 dagen ervoor. Vanaf 50% is het rood. Alleen bij genoeg verkeer om iets te zeggen.</li>
          <li><b>Gedeelde workflows:</b> staat de naam van een klant in de invoer van de stap die misging, dan komt de fout ook bij die klant te staan.</li>
          <li><b>Klant:</b> blogs die langer dan 7 dagen op goedkeuring wachten en een klant die langer dan 30 dagen niet in het portaal was.</li>
        </ul>
        <p>Elke maandagochtend komt er één samenvatting in Telegram met alleen de klanten die aandacht vragen en de steekproef van die week.</p>
      </details>
    </div>`;
    bind(root);
  }

  // Popup met uitleg en actiepunt bij een melding.
  function openMelding(m) {
    const e = escapeHtmlAdmin;
    const u = uitlegVan(m);
    let dlg = document.getElementById('ckDialog');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'ckDialog';
      dlg.className = 'ck-dialog';
      dlg.setAttribute('aria-labelledby', 'ckDialoogTitel');
      document.body.appendChild(dlg);
      dlg.addEventListener('click', (ev) => { if (ev.target === dlg) dlg.close(); });
    }
    const rood = m.niveau === 'rood';
    const details = m.details && m.details.length
      ? `<div class="ck-dl-blok"><h3>Betreft</h3><ul>${m.details.map((x) => `<li>${e(x)}</li>`).join('')}</ul></div>` : '';
    dlg.innerHTML = `
      <div class="ck-dl-kop">
        ${avatar(m.klantNaam)}
        <div class="ck-dl-titel"><span class="ck-dl-klant">${e(m.klantNaam)}</span><h2 id="ckDialoogTitel">${e(m.tekst)}</h2></div>
        <button type="button" class="ck-dl-sluit" data-sluit aria-label="Sluiten"><svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      <div class="ck-dl-pillen"><span class="p-pil ${rood ? 'p-pil-fout' : 'p-pil-let-op'}">${rood ? 'Direct oppakken' : 'Binnenkort kijken'}</span><span class="ck-soort">${e(SOORT[m.soort] || m.soort)}</span></div>
      <div class="ck-dl-blok"><h3>Wat is er aan de hand</h3><p>${e(u.wat)}</p></div>
      ${details}
      <div class="ck-dl-actie"><h3>Wat moet je doen</h3><p>${e(u.doe)}</p></div>
      <div class="ck-dl-knoppen">
        ${m.link ? `<a class="p-knop" href="${e(m.link)}" target="_blank" rel="noopener">Open in n8n</a>` : ''}
        ${m.klantId ? `<button type="button" class="p-knop" data-dl-beheer="${e(m.klantId)}">Naar klant</button><button type="button" class="p-knop" data-dl-bekijk="${e(m.klantId)}">Bekijk als klant</button>` : ''}
        <button type="button" class="p-knop" data-dl-kopieer>Kopieer voor Claude</button>
        <button type="button" class="p-knop p-knop-hoofd" data-sluit>Sluiten</button>
      </div>`;
    dlg.querySelectorAll('[data-sluit]').forEach((b) => b.addEventListener('click', () => dlg.close()));
    dlg.querySelectorAll('[data-dl-beheer]').forEach((b) => b.addEventListener('click', () => { dlg.close(); gaNaar('klant', b.dataset.dlBeheer); }));
    dlg.querySelectorAll('[data-dl-bekijk]').forEach((b) => b.addEventListener('click', () => bekijkAlsKlant(b.dataset.dlBekijk)));
    dlg.querySelector('[data-dl-kopieer]').addEventListener('click', async (ev) => {
      const knop = ev.currentTarget;
      try { await navigator.clipboard.writeText(kopieerTekst(m)); knop.textContent = 'Gekopieerd'; } catch (err) { knop.textContent = 'Kopiëren lukt niet'; }
    });
    dlg.showModal();
  }

  async function bewaarOordeel(i, oordeel, opmerking) {
    const b = stand.data.steekproef.blogs[i];
    try {
      await adminApi('/cockpit/steekproef', { method: 'POST', body: JSON.stringify({ klantNaam: b.klantNaam, blogId: b.blogId, titel: b.titel, oordeel, opmerking }) });
      b.oordeel = oordeel;
      b.opmerking = opmerking || '';
      renderError('');
      teken();
    } catch (err) {
      renderError(err.message);
    }
  }

  function bind(root) {
    bindKiezer(root, teken);
    root.querySelectorAll('[data-sp-goed]').forEach((b) => b.addEventListener('click', () => bewaarOordeel(Number(b.dataset.spGoed), 'goed', '')));
    root.querySelectorAll('[data-sp-niet]').forEach((b) => b.addEventListener('click', () => {
      const form = root.querySelector(`[data-sp-form="${b.dataset.spNiet}"]`);
      form.classList.remove('hidden');
      form.querySelector('textarea').focus();
    }));
    root.querySelectorAll('[data-sp-opslaan]').forEach((b) => b.addEventListener('click', () => {
      const i = b.dataset.spOpslaan;
      bewaarOordeel(Number(i), 'niet goed', root.querySelector(`[data-sp-tekst="${i}"]`).value);
    }));
    root.querySelectorAll('[data-melding]').forEach((b) => b.addEventListener('click', () => { const m = (stand.meldingen || [])[Number(b.dataset.melding)]; if (m) openMelding(m); }));
    root.querySelectorAll('[data-taak]').forEach((b) => b.addEventListener('click', () => openTaak((stand.taken || [])[Number(b.dataset.taak)])));
    root.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { stand.filter = b.dataset.filter; teken(); }));
    root.querySelectorAll('[data-ververs]').forEach((b) => b.addEventListener('click', () => laadCockpit(true)));
    root.querySelectorAll('[data-bekijk]').forEach((b) => b.addEventListener('click', () => bekijkAlsKlant(b.dataset.bekijk)));
    root.querySelectorAll('[data-beheer]').forEach((b) => b.addEventListener('click', () => gaNaar('klant', b.dataset.beheer)));
  }

  function zetTeller() {
    const el = document.getElementById('cockpitTeller');
    if (!el) return;
    const n = aandacht(stand.data) + takenVan(window.cockpitTakenBron ? window.cockpitTakenBron() : {}).length;
    el.textContent = n ? String(n) : '';
    el.title = n ? `${n} ${n === 1 ? 'punt' : 'punten'} in de cockpit` : '';
    el.classList.toggle('hidden', !n);
  }

  async function laadCockpit(ververs) {
    if (stand.laden) return;
    stand.laden = true;
    stand.fout = '';
    if (huidig.view === 'cockpit') teken();
    try {
      stand.data = await adminApi('/cockpit' + (ververs ? '?ververs=1' : ''));
    } catch (err) {
      stand.fout = err.message;
    }
    stand.laden = false;
    zetTeller();
    if (huidig.view === 'cockpit') teken();
  }

  async function bekijkAlsKlant(clientId) {
    // Het venster gaat meteen open (anders blokkeert de browser het), daarna komt het adres.
    const venster = window.open('', '_blank');
    try {
      const r = await adminApi('/bekijk-als/' + encodeURIComponent(clientId), { method: 'POST' });
      if (venster) venster.location.href = r.url; else window.location.href = r.url;
    } catch (err) {
      if (venster) venster.close();
      renderError(err.message);
    }
  }

  window.avatarKleur = avatarKleur;
  window.cockpitMeldingRij = meldingRij;
  window.openCockpitMelding = openMelding;
  // Voor de klantpagina: de meldingen van één klant, uit dezelfde controle als de cockpit.
  window.cockpitVoorKlant = async function (id) {
    if (!stand.data && !stand.laden) await laadCockpit(false);
    for (let i = 0; i < 100 && stand.laden; i++) await new Promise((r) => setTimeout(r, 300));
    const k = stand.data && stand.data.klanten.find((x) => x.id === id);
    if (!k) return { fout: stand.fout || 'Deze klant staat niet in de cockpit.', meldingen: [], bijgewerkt: '' };
    return { fout: '', meldingen: meldingenVan({ klanten: [k], gedeeld: { signalen: [] } }), bijgewerkt: stand.data.bijgewerkt, tijd: tijd(stand.data.bijgewerkt) };
  };
  window.renderCockpit = teken;
  window.zetCockpitTeller = zetTeller;
  window.laadCockpit = laadCockpit;
  window.bekijkAlsKlant = bekijkAlsKlant;
  // Elke 10 minuten opnieuw, gelijk met de cache op de server.
  setInterval(() => { if (!document.hidden) laadCockpit(false); }, 10 * 60 * 1000);
})();
