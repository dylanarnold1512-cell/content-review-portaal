// Maandrapport als document: de opmaak van het rapport dat de klant in het venster opent.
// Alleen tekenen, er wordt niets herberekend behalve de AI cijfers van die maand (uit de wekelijkse metingen).
// Los van het scherm, zodat het in Node testbaar is. Alles wat uit data komt gaat door esc().
(function () {
  const F = (typeof window !== 'undefined' && window.PortaalFormat) || require('./portaal-format');
  const Z = () => (typeof window !== 'undefined' && window.Zoekwoorden) || require('./zoekwoorden');

  const esc = (v) => String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const heeft = (v) => v !== null && v !== undefined;
  const hoofdletter = (t) => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);

  // Hoeveel zoekwoorden het document toont. Zelfde aantal als de PDF.
  const ZOEKWOORDEN_IN_DOCUMENT = 15;

  function vorigeMaand(maand) {
    const m = /^(\d{4})-(\d{2})$/.exec(maand || '');
    if (!m) return '';
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 2, 1));
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }

  function volgendeMaandVan(maand) {
    const m = /^(\d{4})-(\d{2})$/.exec(maand || '');
    if (!m) return '';
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1));
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }

  // Het rapport dat nog komt: de maand na het nieuwste rapport. Het wordt op de 4e van de maand daarna vastgelegd.
  // vandaag: 'YYYY-MM-DD'. Geeft null als er nog geen rapport is of de datum niet klopt.
  function volgendRapport(nieuwsteMaand, vandaag) {
    const maand = volgendeMaandVan(nieuwsteMaand);
    const nu = /^(\d{4}-\d{2})-\d{2}/.exec(String(vandaag || ''));
    if (!maand || !nu) return null;
    if (maand > nu[1]) return null;
    const verschijnt = volgendeMaandVan(maand) + '-04';
    return { maand, label: F.maand(maand), loopt: maand === nu[1], verschijnt, verschijntTekst: F.datumLang(verschijnt).replace(/ \d{4}$/, '') };
  }

  // Telt de wekelijkse AI metingen die in een kalendermaand beginnen.
  function aiMaand(ai, maand) {
    if (!ai || !Array.isArray(ai.trend)) return null;
    const weken = ai.trend.filter((w) => w && String(w.weekStart || '').slice(0, 7) === maand);
    if (!weken.length) return null;
    const per = {};
    let antwoorden = 0;
    let genoemd = 0;
    weken.forEach((w) => {
      Object.keys(w.platformen || {}).forEach((id) => {
        const x = w.platformen[id] || {};
        per[id] = per[id] || { antwoorden: 0, genoemd: 0 };
        per[id].antwoorden += x.antwoorden || 0;
        per[id].genoemd += x.genoemd || 0;
        antwoorden += x.antwoorden || 0;
        genoemd += x.genoemd || 0;
      });
    });
    if (!antwoorden) return null;
    return { weken: weken.length, antwoorden, genoemd, percentage: Math.round((genoemd / antwoorden) * 100), per };
  }

  // null als AI zichtbaarheid niet aan staat. Anders { ai, nu, vorig, vragen } waarbij nu leeg kan zijn (nog niet gemeten).
  // vragen: de vragen waarbij AI het merk in die maand noemde (null als die niet geladen konden worden).
  // Heeft het rapport een vaste snapshot (r.ai is dan een object of null), dan komen de AI cijfers daaruit en niet uit de live data.
  function aiGegevens(ai, r, vragen) {
    if (!r) return null;
    if (r.ai !== undefined) {
      const s = r.ai;
      if (!s) return null;
      return { ai: { platformen: s.platformen || [] }, nu: s.status === 'gemeten' ? s.nu : null, vorig: s.vorig || null, vragen: Array.isArray(s.vragen) ? s.vragen : [], vast: s };
    }
    if (!ai || ai.beschikbaar === false) return null;
    return { ai, nu: aiMaand(ai, r.maand), vorig: aiMaand(ai, vorigeMaand(r.maand)), vragen: Array.isArray(vragen) ? vragen : null };
  }

  // De teksten van het AI blok, gedeeld door het document en de PDF. Geeft null als AI niet aan stond.
  function aiTeksten(g, label) {
    if (!g) return null;
    const v = g.vast;
    if (!g.nu) {
      const leeg = v
        ? (v.wekenOnvolledig > 0
          ? `In ${label} zijn de metingen niet compleet gelukt, daarom staat er geen percentage. Dat zegt niets over hoe vaak AI jullie merk noemt.`
          : `In ${label} is nog niet gemeten. We stellen elke week dezelfde vragen aan ChatGPT en Gemini.`)
        : 'In deze maand is nog niet gemeten. We stellen elke week dezelfde vragen aan ChatGPT en Gemini. De metingen staan in het volgende rapport.';
      return { leeg };
    }
    let vergelijking = v ? 'Er is nog geen vorige maand met dezelfde vragen om mee te vergelijken.' : 'Er is nog geen vorige maand om mee te vergelijken.';
    if (g.vorig) {
      const d = g.nu.percentage - g.vorig.percentage;
      vergelijking = d === 0 ? `Even hoog als de maand ervoor (${g.vorig.percentage}%).` : `${Math.abs(d)} procentpunt ${d > 0 ? 'hoger' : 'lager'} dan de maand ervoor (${g.vorig.percentage}%).`;
    }
    const klein = g.nu.antwoorden < 100 ? ' Het gaat om een beperkt aantal antwoorden, dus kleine verschillen zeggen nog weinig.' : '';
    const basis = v && v.reeks === 'kern' && v.aantalKernvragen
      ? `Het percentage gaat over de ${v.aantalKernvragen} vaste vragen die we elke week stellen, zodat de maanden te vergelijken zijn.`
      : '';
    const bron = heeft(g.nu.geciteerd) && g.nu.geciteerd > 0 ? `Jullie eigen website werd ${keerTekst(g.nu.geciteerd)} als bron in een antwoord getoond.` : '';
    const noot = `${g.nu.weken} ${g.nu.weken === 1 ? 'meetweek' : 'meetweken'} in ${label}, ${g.nu.antwoorden} antwoorden in totaal.`;
    const lijstNoot = v ? 'De lijst toont ook de vragen die per maand wisselen. In het tabblad AI zichtbaarheid staan de hele antwoorden, ook welke andere bedrijven genoemd worden.' : '';
    return { hoofd: `AI noemde jullie merk in ${g.nu.percentage}% van de antwoorden.`, vergelijking, klein, basis, bron, noot, lijstNoot };
  }

  // Hoeveel vragen het rapport bij naam noemt. Zelfde aantal als de PDF.
  const AI_VRAGEN_IN_DOCUMENT = 8;

  function keerTekst(n) { return `${n} keer`; }

  // "ChatGPT 2 keer, Gemini 1 keer". Platformen zonder vermelding vallen weg.
  function platformTelling(v) {
    const delen = [];
    if (v.chatgpt) delen.push('ChatGPT ' + keerTekst(v.chatgpt));
    if (v.gemini) delen.push('Gemini ' + keerTekst(v.gemini));
    let t = delen.join(', ');
    if (v.geciteerd) t += `. Jullie website ${keerTekst(v.geciteerd)} als bron`;
    return t;
  }

  function aiVragenHtml(vragen, label, lijstNoot) {
    if (!Array.isArray(vragen)) return '';
    if (!vragen.length) return `<p class="rd-zacht">In ${esc(label)} noemde AI jullie merk bij geen van de vragen.</p>`;
    const getoond = vragen.slice(0, AI_VRAGEN_IN_DOCUMENT);
    const rest = vragen.length - getoond.length;
    return `<div class="rd-ai-vragen"><p><strong>Bij deze vragen noemde AI jullie merk</strong></p><ol>${getoond.map((v) => `<li><span class="rd-ai-vraag">${esc(v.vraag)}</span><span class="rd-ai-vraag-sub">${esc(platformTelling(v))}</span></li>`).join('')}</ol>${rest > 0 ? `<p class="rd-noot">En bij ${rest} ${rest === 1 ? 'andere vraag' : 'andere vragen'}. Alle antwoorden staan in het tabblad AI zichtbaarheid.</p>` : '<p class="rd-noot">De antwoorden zelf staan in het tabblad AI zichtbaarheid.</p>'}${lijstNoot ? `<p class="rd-noot">${esc(lijstNoot)}</p>` : ''}</div>`;
  }

  function kernzin(r) {
    const v = (r && r.totalen && r.totalen.vertoningen) || 0;
    return v > 0 ? `In ${r.label} stonden jullie blogs ${F.getal(v)} keer in Google` : `In ${r ? r.label : ''} werden jullie blogs nog niet getoond in Google`;
  }

  // De cijfers bovenaan, in dezelfde volgorde als voorheen in het tabblad.
  function kerncijfers(r, g) {
    const t = (r && r.totalen) || {};
    const vNu = t.vertoningen || 0;
    const vorig = (v) => (heeft(v) ? F.getal(v) + ' in de maand ervoor' : '');
    const lijst = [
      { label: 'Keer getoond in Google', waarde: F.getal(vNu), verschil: F.verschil(vNu, t.vertoningen_vorig), sub: vorig(t.vertoningen_vorig) },
      { label: 'Bezoekers vanuit Google', waarde: F.getal(t.clicks || 0), verschil: F.verschil(t.clicks || 0, t.clicks_vorig), sub: vorig(t.clicks_vorig) }
    ];
    if (heeft(t.paginaweergaven)) lijst.push({ label: 'Paginaweergaven', waarde: F.getal(t.paginaweergaven), sub: 'Gemeten in Google Analytics' });
    if (heeft(t.hk_positie_gemiddeld)) lijst.push({ label: 'Positie hoofdzoekwoorden', waarde: F.decimaal(t.hk_positie_gemiddeld, 1), sub: 'Gemiddelde positie. Lager is beter.' });
    if (g && g.nu) lijst.push({ label: 'AI noemt jullie', waarde: g.nu.percentage + '%', sub: g.vorig ? `${g.vorig.percentage}% in de maand ervoor` : 'van de antwoorden', ai: true });
    return lijst;
  }

  // Een zin met aantallen van wat er in de maand is gedaan. Leeg als er niets te melden is.
  function gedaanZin(gd) {
    if (!gd) return '';
    const delen = [];
    if (gd.nieuweBlogs) delen.push(gd.nieuweBlogs + (gd.nieuweBlogs === 1 ? ' nieuwe blog' : ' nieuwe blogs'));
    if (gd.aangevuld) delen.push(gd.aangevuld + (gd.aangevuld === 1 ? ' bestaande blog aangevuld' : ' bestaande blogs aangevuld'));
    if (gd.internelinks) delen.push(gd.internelinks + (gd.internelinks === 1 ? ' interne link toegevoegd' : ' interne links toegevoegd'));
    if (gd.faq) delen.push(gd.faq + (gd.faq === 1 ? ' vraag uit AI antwoorden als FAQ toegevoegd' : ' vragen uit AI antwoorden als FAQ toegevoegd'));
    if (!delen.length) return '';
    return (delen.length > 1 ? delen.slice(0, -1).join(', ') + ' en ' + delen[delen.length - 1] : delen[0]) + '.';
  }

  function euro(n) {
    return '€ ' + F.getal(Math.round(n));
  }

  // "Ze nemen contact op": nooit een kale nul. Is er niets gemeten of staat de meting nog niet aan, dan staat er waarom.
  // Geeft gewone tekst terug: { punten: [...], alinea: [...], noot }.
  function opbrengstBlokken(r) {
    const m = r.meting;
    const noot = 'Een blog levert vaak niet direct een aanvraag op. Mensen lezen eerst, vergelijken en nemen later contact op. We tellen daarom ook aanvragen en boekingen van mensen die eerder een blog lazen. Het zijn gemeten cijfers uit Google Analytics. Ze laten niet zien wat de oorzaak was.';
    if (!m) {
      return { punten: [], alinea: [`Voor ${r.label} is de meting van aanvragen en boekingen niet vastgelegd. Dat zegt niets over wat de blogs deze maand hebben bijgedragen. We meten dit pas zodra de meting aan staat en leggen het dan elke maand vast.`], noot };
    }
    const w = m.woorden || { lead: ['aanvraag', 'aanvragen'], boeking: ['boeking', 'boekingen'] };
    const regel = (n, enk, mv) => `${F.getal(n)} ${n === 1 ? enk : mv}`;
    const punten = [];
    const nul = [];
    const voeg = (n, tekst, nulTekst) => {
      if (!heeft(n)) return;
      if (n > 0) punten.push(hoofdletter(tekst)); else if (nulTekst) nul.push(nulTekst);
    };
    if (m.eerderActief) {
      voeg(m.eerderLeads, `${regel(m.eerderLeads || 0, w.lead[0], w.lead[1])} van mensen die eerder een blog lazen`, `geen ${w.lead[1]} na het lezen van een blog`);
      voeg(m.eerderBoekingen, `${regel(m.eerderBoekingen || 0, w.boeking[0], w.boeking[1])} van mensen die eerder een blog lazen`, `geen ${w.boeking[1]} na het lezen van een blog`);
    }
    voeg(m.leadsAi, `${regel(m.leadsAi || 0, w.lead[0], w.lead[1])} van bezoekers die via een AI assistent kwamen`, '');
    voeg(m.boekingenAi, `${regel(m.boekingenAi || 0, w.boeking[0], w.boeking[1])} van bezoekers die via een AI assistent kwamen`, '');
    const alinea = [];
    if (nul.length) {
      const opsomming = nul.length > 1 ? nul.slice(0, -1).join(', ') + ' en ' + nul[nul.length - 1] : nul[0];
      alinea.push(`${punten.length ? 'Verder waren er' : 'Er waren'} ${opsomming} in ${r.label}. De meting liep wel, er is in deze maand alleen niets gebeurd wat we kunnen tellen.`);
    }
    if (!punten.length && !nul.length) alinea.push(`De meting liep in ${r.label}, maar er zijn nog geen cijfers om te tonen. Zodra er aanvragen of boekingen na het lezen van een blog komen, staan ze hier.`);
    return { punten, alinea, noot };
  }

  function periodeTekst(r) {
    if (r.periodeStart && r.periodeEind) return `Periode ${F.datumLang(r.periodeStart)} tot en met ${F.datumLang(r.periodeEind)}`;
    return `Periode ${r.label}`;
  }

  // Het rapport als hoofdstukken, in dezelfde volgorde als het Google tabblad: gevonden worden, doorklikken, contact
  // opnemen, wat wij deden en wat we gaan doen. Alleen met de vaste cijfers van de maand van het rapport.
  // Elk hoofdstuk heeft blokken zonder opmaak, zodat het document en de PDF precies hetzelfde tonen.
  // Bloksoorten: p, zacht, noot, subkop, lijst, cijfers, tabel, ai, vragen, punten.
  function hoofdstukken(r, g) {
    const t = (r && r.totalen) || {};
    const go = r.google || null;
    const m = r.meting || null;
    const label = r.label;
    const uit = [];
    // Wat al op de voorkant staat, herhalen we niet in de hoofdstukken.
    const voorkant = new Set(kerncijfers(r, g).map((c) => c.label));
    const tegels = (lijst) => {
      const rest = lijst.filter((c) => !voorkant.has(c.label));
      return rest.length ? [{ type: 'cijfers', items: rest }] : [];
    };

    // 0. In het kort
    uit.push({
      titel: 'In het kort',
      lead: '',
      blokken: r.terugblik && r.terugblik.length
        ? r.terugblik.map((a) => ({ type: 'p', tekst: a }))
        : [{ type: 'zacht', tekst: 'Voor deze maand is geen toelichting beschikbaar.' }]
    });

    // 1. Jullie worden gevonden
    const gevonden = [];
    const c1 = [{ label: 'Keer getoond in Google', waarde: F.getal(t.vertoningen || 0), verschil: F.verschil(t.vertoningen || 0, t.vertoningen_vorig), sub: heeft(t.vertoningen_vorig) ? F.getal(t.vertoningen_vorig) + ' in de maand ervoor' : '' }];
    if (go && go.blogsGemeten > 0) {
      c1.push({ label: 'Blogs in Google', waarde: `${F.getal(go.blogsGetoond)} van ${F.getal(go.blogsGemeten)}`, sub: 'Werden deze maand getoond' });
      c1.push({ label: 'Op pagina 1', waarde: `${F.getal(go.blogsPaginaEen)} ${go.blogsPaginaEen === 1 ? 'blog' : 'blogs'}`, sub: 'Voor het hoofdzoekwoord' });
    }
    if (heeft(t.hk_positie_gemiddeld)) c1.push({ label: 'Positie hoofdzoekwoorden', waarde: F.decimaal(t.hk_positie_gemiddeld, 1), sub: 'Gemiddelde positie. Lager is beter.' });
    if (go && go.merk && go.merk.vertoningen > 0) c1.push({ label: 'Zoekopdrachten op jullie naam', waarde: F.getal(go.merk.vertoningen), verschil: F.verschil(go.merk.vertoningen, go.merk.vertoningenVorig), sub: heeft(go.merk.vertoningenVorig) ? F.getal(go.merk.vertoningenVorig) + ' in de maand ervoor' : 'Hele site' });
    gevonden.push(...tegels(c1));

    const zw = Z().samenvoegen(r.blogs || [], 'vertoningen');
    if (zw.length) {
      const getoond = zw.slice(0, ZOEKWOORDEN_IN_DOCUMENT);
      gevonden.push({ type: 'subkop', tekst: 'Zoekwoorden' });
      gevonden.push({ type: 'zacht', tekst: 'Waar mensen op zochten toen ze jullie blogs in Google zagen. Een lage positie is beter.' });
      gevonden.push({
        type: 'tabel',
        kolommen: [{ label: 'Zoekwoord' }, { label: 'Getoond', num: true }, { label: 'Bezoekers', num: true }, { label: 'Positie', num: true }],
        rijen: getoond.map((x) => [{ tekst: x.q }, { tekst: F.getal(x.i) }, { tekst: F.getal(x.c) }, x.p === null || x.p === undefined ? { tekst: 'geen meting', zacht: true } : { tekst: F.decimaal(x.p, 1), goed: x.p <= 10 }])
      });
      if (zw.length > getoond.length) gevonden.push({ type: 'noot', tekst: `De ${getoond.length} zoekwoorden die het vaakst getoond werden, van ${zw.length} in totaal.` });
    }

    const at = aiTeksten(g, label);
    if (at) {
      gevonden.push({ type: 'subkop', tekst: 'In de antwoorden van ChatGPT en Gemini' });
      if (at.leeg) {
        gevonden.push({ type: 'zacht', tekst: at.leeg });
      } else {
        const namen = {};
        (g.ai.platformen || []).forEach((p) => { if (p && p.id) namen[p.id] = p.label || p.id; });
        gevonden.push({ type: 'p', tekst: at.hoofd, vet: true, vervolg: `${at.vergelijking}${at.klein}` });
        gevonden.push({
          type: 'ai',
          rijen: Object.keys(g.nu.per).map((id) => {
            const x = g.nu.per[id];
            return { naam: namen[id] || id, pct: x.antwoorden ? Math.round((x.genoemd / x.antwoorden) * 100) : 0, sub: `${x.genoemd} van ${x.antwoorden} antwoorden` };
          })
        });
        if (at.basis) gevonden.push({ type: 'p', tekst: at.basis });
        if (at.bron) gevonden.push({ type: 'p', tekst: at.bron });
        gevonden.push({ type: 'noot', tekst: at.noot });
        if (Array.isArray(g.vragen)) {
          if (!g.vragen.length) gevonden.push({ type: 'zacht', tekst: `In ${label} noemde AI jullie merk bij geen van de vragen.` });
          else {
            const lijst = g.vragen.slice(0, AI_VRAGEN_IN_DOCUMENT);
            const rest = g.vragen.length - lijst.length;
            gevonden.push({ type: 'p', tekst: 'Bij deze vragen noemde AI jullie merk', vet: true });
            gevonden.push({ type: 'vragen', items: lijst.map((v) => ({ vraag: v.vraag, sub: platformTelling(v) })) });
            gevonden.push({ type: 'noot', tekst: rest > 0 ? `En bij ${rest} ${rest === 1 ? 'andere vraag' : 'andere vragen'}. Alle antwoorden staan in het tabblad AI zichtbaarheid.` : 'De antwoorden zelf staan in het tabblad AI zichtbaarheid.' });
            if (at.lijstNoot) gevonden.push({ type: 'noot', tekst: at.lijstNoot });
          }
        }
      }
    }
    uit.push({ titel: 'Jullie worden gevonden', lead: `Hoe vaak jullie in ${label} te zien waren in Google${at ? ' en in de antwoorden van AI assistenten' : ''}.`, blokken: gevonden });

    // 2. Mensen klikken door
    const klik = [];
    const c2 = [{ label: 'Bezoekers vanuit Google', waarde: F.getal(t.clicks || 0), verschil: F.verschil(t.clicks || 0, t.clicks_vorig), sub: heeft(t.clicks_vorig) ? F.getal(t.clicks_vorig) + ' in de maand ervoor' : '' }];
    if (heeft(t.paginaweergaven)) c2.push({ label: 'Paginaweergaven', waarde: F.getal(t.paginaweergaven), sub: 'Gemeten in Google Analytics' });
    if (go && go.waarde && go.waarde.bedrag > 0) c2.push({ label: 'Waarde van de bezoekers uit Google', waarde: euro(go.waarde.bedrag), sub: 'Wat dezelfde klikken via Google Ads ongeveer hadden gekost' });
    if (m && heeft(m.sessiesAi) && m.sessiesAi > 0) c2.push({ label: 'Bezoeken via AI assistenten', waarde: F.getal(m.sessiesAi), sub: heeft(go && go.aiBezoekenBlogs) ? `Op de hele site, waarvan ${F.getal(go.aiBezoekenBlogs)} op een blog` : 'Op de hele site', ai: true });
    klik.push(...tegels(c2));
    if (go && go.waarde && go.waarde.bedrag > 0 && heeft(go.waarde.dekking) && go.waarde.dekking < 100) {
      klik.push({ type: 'noot', tekst: `De waarde is berekend over ${F.getal(go.waarde.klikkenMetPrijs)} van de ${F.getal(go.waarde.klikken)} klikken waarvan de klikprijs bekend is.` });
    }
    const blogs = r.blogs || [];
    const metCijfers = blogs.filter((b) => (b.vertoningen || 0) > 0 || (b.clicks || 0) > 0)
      .slice().sort((a, b) => (b.vertoningen || 0) - (a.vertoningen || 0) || (b.clicks || 0) - (a.clicks || 0));
    klik.push({ type: 'subkop', tekst: 'Blogs met de meeste vertoningen' });
    if (metCijfers.length) {
      klik.push({ type: 'tabel', kolommen: [{ label: 'Blog' }, { label: 'Getoond', num: true }, { label: 'Bezoekers', num: true }], rijen: metCijfers.map((b) => [{ tekst: b.titel, url: b.url || '' }, { tekst: F.getal(b.vertoningen || 0) }, { tekst: F.getal(b.clicks || 0) }]) });
    } else {
      klik.push({ type: 'zacht', tekst: 'Geen blogs met cijfers in deze maand. Zodra Google een blog toont, staat hij hier.' });
    }
    const zonder = blogs.length - metCijfers.length;
    if (zonder > 0) klik.push({ type: 'noot', tekst: `${zonder} ${zonder === 1 ? 'blog had' : 'blogs hadden'} deze maand geen vertoningen of bezoekers.` });
    uit.push({ titel: 'Mensen klikken door', lead: `Hoeveel mensen in ${label} doorklikten naar jullie site, en welke blogs het meest gezien werden.`, blokken: klik });

    // 3. Ze nemen contact op
    const o = opbrengstBlokken(r);
    const contact = [];
    if (o.punten.length) contact.push({ type: 'lijst', items: o.punten });
    o.alinea.forEach((a) => contact.push({ type: 'p', tekst: a }));
    contact.push({ type: 'noot', tekst: o.noot });
    uit.push({ titel: 'Ze nemen contact op', lead: `Aanvragen en boekingen in ${label} van mensen die eerder een blog lazen of via AI kwamen.`, blokken: contact });

    // 4. Wat wij deden
    const deden = [];
    const zin = gedaanZin(r.gedaan);
    if (zin) deden.push({ type: 'p', tekst: hoofdletter(zin) });
    deden.push({ type: 'subkop', tekst: 'Nieuwe blogs' });
    const nieuwe = r.nieuweBlogs || [];
    if (nieuwe.length) deden.push({ type: 'lijst', genummerd: true, items: nieuwe.map((b) => b.titel), datums: nieuwe.map((b) => (b.datum ? F.datumLang(b.datum) : '')) });
    else deden.push({ type: 'zacht', tekst: 'Er zijn deze maand geen nieuwe blogs live gegaan.' });
    const faq = (r.gedaan && r.gedaan.faqVoorbeelden) || [];
    if (faq.length) {
      deden.push({ type: 'subkop', tekst: 'Vragen uit AI antwoorden toegevoegd als FAQ' });
      deden.push({ type: 'lijst', items: faq.map((f) => (f.pagina ? `${f.vraag} (op ${f.pagina})` : f.vraag)) });
      if (r.gedaan.faq > faq.length) deden.push({ type: 'noot', tekst: `En ${r.gedaan.faq - faq.length} andere vragen.` });
    }
    const items = (r.effecten && r.effecten.items) || [];
    if (items.length) {
      deden.push({ type: 'subkop', tekst: 'Wat het effect was' });
      deden.push({ type: 'zacht', tekst: `Metingen die in ${label} zijn gedaan. Het zijn gemeten cijfers uit Google. Ze laten niet zien wat de oorzaak was.` });
      deden.push({ type: 'punten', items: items.map((i) => ({ meta: `${i.soortLabel || ''}${i.datum ? ` · ${F.datumLang(i.datum)}` : ''}`, titel: i.titel, regels: i.regels || [] })) });
    }
    uit.push({ titel: 'Wat wij deden', lead: `Wat we in ${label} aan de blogs en de site deden, en wat we daarvan merkten.`, blokken: deden });

    // 5. Wat we gaan doen
    const vooruit = r.vooruitblik || [];
    uit.push({
      titel: 'Wat we gaan doen',
      lead: 'De kansen die we nu in de cijfers zien en die we de komende maand oppakken.',
      blokken: vooruit.length
        ? [{ type: 'punten', items: vooruit.map((p) => ({ titel: p.titel, regels: [p.tekst] })) }]
        : [{ type: 'zacht', tekst: 'Nog geen onderbouwde kansen. Zodra Search Console genoeg data heeft, staat hier wat we gaan oppakken.' }]
    });

    return uit;
  }

  // Welke hoofdstukken op welke A4 pagina staan in het document (indexen in hoofdstukken()).
  const PAGINA_INDELING = [[0], [1], [2, 3], [4, 5]];

  function blokHtml(b) {
    switch (b.type) {
      case 'p': return `<p>${b.vet ? `<strong>${esc(b.tekst)}</strong>` : esc(b.tekst)}${b.vervolg ? ' ' + esc(b.vervolg) : ''}</p>`;
      case 'zacht': return `<p class="rd-zacht">${esc(b.tekst)}</p>`;
      case 'noot': return `<p class="rd-noot">${esc(b.tekst)}</p>`;
      case 'subkop': return `<h4 class="rd-subkop">${esc(b.tekst)}</h4>`;
      case 'lijst': {
        const tag = b.genummerd ? 'ol' : 'ul';
        return `<${tag} class="rd-lijst">${b.items.map((x, i) => `<li>${esc(x)}${b.datums && b.datums[i] ? ` <span class="rd-zacht">(${esc(b.datums[i])})</span>` : ''}</li>`).join('')}</${tag}>`;
      }
      case 'cijfers': return `<div class="rd-cijfers rd-cijfers-${b.items.length}">${b.items.map(cijferHtml).join('')}</div>`;
      case 'tabel': return `<div class="rd-tabel-wrap"><table class="rd-tabel"><thead><tr>${b.kolommen.map((k) => `<th${k.num ? ' class="rd-num"' : ''}>${esc(k.label)}</th>`).join('')}</tr></thead><tbody>${b.rijen.map((rij) => `<tr>${rij.map((c, i) => {
        const inhoud = c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.tekst)}</a>` : c.zacht ? `<span class="rd-zacht">${esc(c.tekst)}</span>` : c.goed !== undefined ? `<span class="rd-pos${c.goed ? ' rd-pos-goed' : ''}">${esc(c.tekst)}</span>` : esc(c.tekst);
        return `<td${b.kolommen[i] && b.kolommen[i].num ? ' class="rd-num"' : ''}>${inhoud}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>`;
      case 'ai': return `<div class="rd-ai">${b.rijen.map((x) => `<div class="rd-ai-rij"><div class="rd-ai-naam">${esc(x.naam)}</div><div class="rd-ai-balk"><span style="width:${Math.min(100, x.pct)}%"></span></div><div class="rd-ai-pct">${x.pct}%</div><div class="rd-ai-sub">${esc(x.sub)}</div></div>`).join('')}</div>`;
      case 'vragen': return `<div class="rd-ai-vragen"><ol>${b.items.map((v) => `<li><span class="rd-ai-vraag">${esc(v.vraag)}</span><span class="rd-ai-vraag-sub">${esc(v.sub)}</span></li>`).join('')}</ol></div>`;
      case 'punten': return b.items.map((i) => `<div class="rd-punt">${i.meta ? `<div class="rd-punt-meta">${esc(i.meta)}</div>` : ''}<div class="rd-punt-titel">${esc(i.titel)}</div>${(i.regels || []).map((x) => `<div class="rd-punt-tekst">${esc(x)}</div>`).join('')}</div>`).join('');
      default: return '';
    }
  }

  function cijferHtml(c) {
    return `<div class="rd-cijfer"><div class="rd-cijfer-label">${esc(c.label)}</div><div class="rd-cijfer-waarde${c.ai ? ' rd-ai-kleur' : ''}">${esc(c.waarde)}</div>${c.verschil || c.sub ? `<div class="rd-cijfer-sub">${c.verschil ? `<span class="rd-verschil rd-verschil-${esc(c.verschil.toon)}">${esc(c.verschil.tekst)}</span> ` : ''}${esc(c.sub || '')}</div>` : ''}</div>`;
  }

  // Oude naam, nog gebruikt in tests en elders: de opbrengst als HTML.
  function opbrengstHtml(r) {
    const o = opbrengstBlokken(r);
    return (o.punten.length ? `<ul class="rd-lijst">${o.punten.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '') +
      o.alinea.map((a) => `<p>${esc(a)}</p>`).join('') + `<p class="rd-noot">${esc(o.noot)}</p>`;
  }

  function logo() {
    return '<div class="rd-logo"><span class="rd-logo-naam">Blogr<i>.</i></span><span class="rd-logo-door">door <b>Advertisr.</b></span></div>';
  }

  // Het hele document: een of meer A4 pagina's. klant is de klantnaam zoals in de kop van het portaal.
  function documentHtml(r, g, klant) {
    const hs = hoofdstukken(r, g);
    const paginas = PAGINA_INDELING.map((idx) => idx.map((i) => ({ h: hs[i], nr: i })).filter((x) => x.h)).filter((p) => p.length);
    const totaal = paginas.length;
    const titelMaand = hoofdletter(r.label);
    const voet = (i) => `<footer class="rd-voet"><span>${esc(klant || '')}${klant ? ' · ' : ''}Maandrapport ${esc(r.label)}</span><span>Pagina ${i + 1} van ${totaal}</span></footer>`;
    const cijfers = kerncijfers(r, g);
    const kop = `<header class="rd-kop">${logo()}<div class="rd-kop-rechts">Maandrapport<b>${esc(titelMaand)}</b></div></header><div class="rd-streep"></div>
      <div class="rd-titelblok">${klant ? `<div class="rd-klant">${esc(klant)}</div>` : ''}<h2 class="rd-titel">Maandrapport ${esc(r.label)}</h2>
      <div class="rd-meta">${esc(periodeTekst(r))}${r.aangemaakt ? ` · Vastgelegd op ${esc(F.datumLang(r.aangemaakt))}` : ''}</div></div>
      <div class="rd-kernzin"><span class="rd-stip" aria-hidden="true"></span><div><strong>${esc(kernzin(r))}.</strong>${r.voortgang ? `<span>${esc(r.voortgang)}</span>` : ''}</div></div>
      <div class="rd-cijfers rd-cijfers-${cijfers.length}">${cijfers.map(cijferHtml).join('')}</div>`;
    const kleineKop = `<header class="rd-kop rd-kop-klein">${logo()}<div class="rd-kop-rechts">Maandrapport<b>${esc(titelMaand)}</b></div></header><div class="rd-streep rd-streep-dun"></div>`;
    const bron = `<p class="rd-bron">${esc(r.bron || '')}${r.bron && r.aangemaakt ? '. ' : ''}${r.aangemaakt ? `Vastgelegd op ${esc(F.datumLang(r.aangemaakt))}. Deze cijfers staan vast en veranderen niet meer.` : ''}</p>`;
    return paginas.map((secties, i) => {
      const inhoud = secties.map(({ h, nr }) => `<section class="rd-sectie"><h3 class="rd-sectie-titel">${nr ? `<span class="rd-nr">${nr}.</span> ` : ''}${esc(h.titel)}</h3>${h.lead ? `<p class="rd-uitleg">${esc(h.lead)}</p>` : ''}<div class="rd-tekst">${h.blokken.map(blokHtml).join('')}</div></section>`).join('');
      return `<article class="rd-pagina" aria-label="Pagina ${i + 1} van ${totaal}">${i === 0 ? kop : kleineKop}<div class="rd-inhoud">${inhoud}${i === totaal - 1 ? bron : ''}</div>${voet(i)}</article>`;
    }).join('');
  }

  // Een klein voorbeeld van de eerste pagina, voor de kaarten in het overzicht.
  function miniatuur(r, cijfers) {
    const c = Array.isArray(cijfers) ? cijfers.slice(0, 2) : [];
    const vakjes = c.length
      ? c.map((x) => `<div class="rp-mini-vak"><b>${esc(x.waarde)}</b><span>${esc(x.label)}</span></div>`).join('')
      : '<div class="rp-mini-vak rp-mini-leeg"></div><div class="rp-mini-vak rp-mini-leeg"></div>';
    return `<div class="rp-mini" aria-hidden="true"><div class="rp-mini-kop"><span class="rp-mini-logo">Blogr<i>.</i></span><span class="rp-mini-maand">${esc(String(r.label || '').toUpperCase())}</span></div><div class="rp-mini-streep"></div><div class="rp-mini-titel">Maandrapport ${esc(r.label)}</div><div class="rp-mini-vakken">${vakjes}</div><i class="rp-mini-regel"></i><i class="rp-mini-regel" style="width:88%"></i><i class="rp-mini-regel" style="width:74%"></i><i class="rp-mini-regel" style="width:92%;margin-top:6px"></i><i class="rp-mini-regel" style="width:66%"></i><span class="rp-mini-voet"></span></div>`;
  }

  const api = { aiTeksten, hoofdstukken, blokHtml, PAGINA_INDELING, opbrengstBlokken, opbrengstHtml, documentHtml, miniatuur, kerncijfers, kernzin, gedaanZin, volgendRapport, aiMaand, aiGegevens, aiVragenHtml, platformTelling, vorigeMaand, volgendeMaandVan, ZOEKWOORDEN_IN_DOCUMENT, AI_VRAGEN_IN_DOCUMENT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.RapportDocument = api;
})();
