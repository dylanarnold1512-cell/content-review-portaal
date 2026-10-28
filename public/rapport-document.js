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
  function aiGegevens(ai, r, vragen) {
    if (!ai || ai.beschikbaar === false || !r) return null;
    return { ai, nu: aiMaand(ai, r.maand), vorig: aiMaand(ai, vorigeMaand(r.maand)), vragen: Array.isArray(vragen) ? vragen : null };
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

  function aiVragenHtml(vragen, label) {
    if (!Array.isArray(vragen)) return '';
    if (!vragen.length) return `<p class="rd-zacht">In ${esc(label)} noemde AI jullie merk bij geen van de vragen.</p>`;
    const getoond = vragen.slice(0, AI_VRAGEN_IN_DOCUMENT);
    const rest = vragen.length - getoond.length;
    return `<div class="rd-ai-vragen"><p><strong>Bij deze vragen noemde AI jullie merk</strong></p><ol>${getoond.map((v) => `<li><span class="rd-ai-vraag">${esc(v.vraag)}</span><span class="rd-ai-vraag-sub">${esc(platformTelling(v))}</span></li>`).join('')}</ol>${rest > 0 ? `<p class="rd-noot">En bij ${rest} ${rest === 1 ? 'andere vraag' : 'andere vragen'}. Alle antwoorden staan in het tabblad AI zichtbaarheid.</p>` : '<p class="rd-noot">De antwoorden zelf staan in het tabblad AI zichtbaarheid.</p>'}</div>`;
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
    return delen.length ? delen.join(' en ') + '.' : '';
  }

  function periodeTekst(r) {
    if (r.periodeStart && r.periodeEind) return `Periode ${F.datumLang(r.periodeStart)} tot en met ${F.datumLang(r.periodeEind)}`;
    return `Periode ${r.label}`;
  }

  function sectie(titel, inhoud, uitleg) {
    return { titel, uitleg: uitleg || '', inhoud };
  }

  // Alle onderdelen van het rapport, verdeeld over pagina's. Een pagina zonder onderdelen valt weg.
  // Pagina 1 is de voorkant (kop, cijfers, terugblik), pagina 2 wat er gedaan is en de blogs, pagina 3 de rest.
  function onderdelen(r, g) {
    const p1 = [];
    const p2 = [];
    const p3 = [];

    const terug = r.terugblik && r.terugblik.length
      ? r.terugblik.map((a) => `<p>${esc(a)}</p>`).join('')
      : '<p class="rd-zacht">Voor deze maand is geen toelichting beschikbaar.</p>';
    p1.push(sectie(`Terugblik op ${r.label}`, terug));

    const zin = gedaanZin(r.gedaan);
    const nieuwe = r.nieuweBlogs || [];
    const lijst = nieuwe.length
      ? `<ol class="rd-lijst">${nieuwe.map((b) => `<li>${esc(b.titel)}${b.datum ? ` <span class="rd-zacht">(${esc(F.datumLang(b.datum))})</span>` : ''}</li>`).join('')}</ol>`
      : '<p class="rd-zacht">Er zijn deze maand geen nieuwe blogs live gegaan.</p>';
    p2.push(sectie(`Wat we deden in ${r.label}`, (zin ? `<p>${esc(hoofdletter(zin))}</p>` : '') + `<h4 class="rd-subkop">Nieuwe blogs</h4>${lijst}`));

    const blogs = r.blogs || [];
    const metCijfers = blogs.filter((b) => (b.vertoningen || 0) > 0 || (b.clicks || 0) > 0)
      .slice().sort((a, b) => (b.vertoningen || 0) - (a.vertoningen || 0) || (b.clicks || 0) - (a.clicks || 0));
    const zonder = blogs.length - metCijfers.length;
    const blogTabel = metCijfers.length
      ? `<div class="rd-tabel-wrap"><table class="rd-tabel"><thead><tr><th>Blog</th><th class="rd-num">Getoond</th><th class="rd-num">Bezoekers</th></tr></thead><tbody>${metCijfers.map((b) => `<tr><td>${b.url ? `<a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.titel)}</a>` : esc(b.titel)}</td><td class="rd-num">${esc(F.getal(b.vertoningen || 0))}</td><td class="rd-num">${esc(F.getal(b.clicks || 0))}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="rd-zacht">Geen blogs met cijfers in deze maand. Zodra Google een blog toont, staat hij hier.</p>';
    const zonderTekst = zonder > 0 ? `<p class="rd-noot">${zonder} ${zonder === 1 ? 'blog had' : 'blogs hadden'} deze maand geen vertoningen of bezoekers.</p>` : '';
    p2.push(sectie('Blogs met de meeste vertoningen', blogTabel + zonderTekst));

    const zw = Z().samenvoegen(blogs, 'vertoningen');
    if (zw.length) {
      const getoond = zw.slice(0, ZOEKWOORDEN_IN_DOCUMENT);
      const pos = (p) => (p === null || p === undefined ? '<span class="rd-zacht">geen meting</span>' : `<span class="rd-pos${p <= 10 ? ' rd-pos-goed' : ''}">${esc(F.decimaal(p, 1))}</span>`);
      const tabel = `<div class="rd-tabel-wrap"><table class="rd-tabel"><thead><tr><th>Zoekwoord</th><th class="rd-num">Getoond</th><th class="rd-num">Bezoekers</th><th class="rd-num">Positie</th></tr></thead><tbody>${getoond.map((x) => `<tr><td>${esc(x.q)}</td><td class="rd-num">${esc(F.getal(x.i))}</td><td class="rd-num">${esc(F.getal(x.c))}</td><td class="rd-num">${pos(x.p)}</td></tr>`).join('')}</tbody></table></div>`;
      const meer = zw.length > getoond.length ? `<p class="rd-noot">De ${getoond.length} zoekwoorden die het vaakst getoond werden, van ${zw.length} in totaal.</p>` : '';
      p3.push(sectie(`Zoekwoorden in ${r.label}`, tabel + meer, 'Waar mensen op zochten toen ze jullie blogs in Google zagen. Een lage positie is beter.'));
    }

    if (g) {
      if (!g.nu) {
        p3.push(sectie(`AI zichtbaarheid in ${r.label}`, '<p class="rd-zacht">In deze maand is nog niet gemeten. We stellen elke week dezelfde vragen aan ChatGPT en Gemini. De metingen staan in het volgende rapport.</p>'));
      } else {
        const namen = {};
        (g.ai.platformen || []).forEach((p) => { if (p && p.id) namen[p.id] = p.label || p.id; });
        let vergelijking = 'Er is nog geen vorige maand om mee te vergelijken.';
        if (g.vorig) {
          const d = g.nu.percentage - g.vorig.percentage;
          vergelijking = d === 0 ? `Even hoog als de maand ervoor (${g.vorig.percentage}%).` : `${Math.abs(d)} procentpunt ${d > 0 ? 'hoger' : 'lager'} dan de maand ervoor (${g.vorig.percentage}%).`;
        }
        const klein = g.nu.antwoorden < 100 ? ' Het gaat om een beperkt aantal antwoorden, dus kleine verschillen zeggen nog weinig.' : '';
        const rijen = Object.keys(g.nu.per).map((id) => {
          const x = g.nu.per[id];
          const pct = x.antwoorden ? Math.round((x.genoemd / x.antwoorden) * 100) : 0;
          return `<div class="rd-ai-rij"><div class="rd-ai-naam">${esc(namen[id] || id)}</div><div class="rd-ai-balk"><span style="width:${Math.min(100, pct)}%"></span></div><div class="rd-ai-pct">${pct}%</div><div class="rd-ai-sub">${x.genoemd} van ${x.antwoorden} antwoorden</div></div>`;
        }).join('');
        p3.push(sectie(`AI zichtbaarheid in ${r.label}`,
          `<p><strong>AI noemde jullie merk in ${g.nu.percentage}% van de antwoorden.</strong> ${esc(vergelijking)}${esc(klein)}</p><div class="rd-ai">${rijen}</div><p class="rd-noot">${g.nu.weken} ${g.nu.weken === 1 ? 'meting' : 'metingen'} in ${esc(r.label)}, ${g.nu.antwoorden} antwoorden in totaal.</p>${aiVragenHtml(g.vragen, r.label)}`,
          'Hoe vaak ChatGPT en Gemini jullie merk noemen bij vragen die jullie klanten stellen.'));
      }
    }

    const items = (r.effecten && r.effecten.items) || [];
    if (items.length) {
      p3.push(sectie('Wat hebben we gedaan en wat was het effect',
        items.map((i) => `<div class="rd-punt"><div class="rd-punt-meta">${esc(i.soortLabel || '')}${i.datum ? ` · ${esc(F.datumLang(i.datum))}` : ''}</div><div class="rd-punt-titel">${esc(i.titel)}</div>${(i.regels || []).map((x) => `<div class="rd-punt-tekst">${esc(x)}</div>`).join('')}</div>`).join(''),
        `Metingen die in ${r.label} zijn gedaan. Het zijn gemeten cijfers uit Google. Ze laten niet zien wat de oorzaak was.`));
    }

    const vooruit = r.vooruitblik || [];
    p3.push(sectie('Vooruitblik', vooruit.length
      ? vooruit.map((p) => `<div class="rd-punt"><div class="rd-punt-titel">${esc(p.titel)}</div><div class="rd-punt-tekst">${esc(p.tekst)}</div></div>`).join('')
      : '<p class="rd-zacht">Nog geen onderbouwde kansen. Zodra Search Console genoeg data heeft, staat hier wat we gaan oppakken.</p>'));

    return [p1, p2, p3].filter((p) => p.length);
  }

  function logo() {
    return '<div class="rd-logo"><span class="rd-logo-naam">Blogr<i>.</i></span><span class="rd-logo-door">door <b>Advertisr.</b></span></div>';
  }

  // Het hele document: een of meer A4 pagina's. klant is de klantnaam zoals in de kop van het portaal.
  function documentHtml(r, g, klant) {
    const paginas = onderdelen(r, g);
    const totaal = paginas.length;
    const titelMaand = hoofdletter(r.label);
    let nr = 0;
    const voet = (i) => `<footer class="rd-voet"><span>${esc(klant || '')}${klant ? ' · ' : ''}Maandrapport ${esc(r.label)}</span><span>Pagina ${i + 1} van ${totaal}</span></footer>`;
    const cijfers = kerncijfers(r, g);
    const kop = `<header class="rd-kop">${logo()}<div class="rd-kop-rechts">Maandrapport<b>${esc(titelMaand)}</b></div></header><div class="rd-streep"></div>
      <div class="rd-titelblok">${klant ? `<div class="rd-klant">${esc(klant)}</div>` : ''}<h2 class="rd-titel">Maandrapport ${esc(r.label)}</h2>
      <div class="rd-meta">${esc(periodeTekst(r))}${r.aangemaakt ? ` · Vastgelegd op ${esc(F.datumLang(r.aangemaakt))}` : ''}</div></div>
      <div class="rd-kernzin"><span class="rd-stip" aria-hidden="true"></span><div><strong>${esc(kernzin(r))}.</strong>${r.voortgang ? `<span>${esc(r.voortgang)}</span>` : ''}</div></div>
      <div class="rd-cijfers rd-cijfers-${cijfers.length}">${cijfers.map((c) => `<div class="rd-cijfer"><div class="rd-cijfer-label">${esc(c.label)}</div><div class="rd-cijfer-waarde${c.ai ? ' rd-ai-kleur' : ''}">${esc(c.waarde)}</div>${c.verschil || c.sub ? `<div class="rd-cijfer-sub">${c.verschil ? `<span class="rd-verschil rd-verschil-${esc(c.verschil.toon)}">${esc(c.verschil.tekst)}</span> ` : ''}${esc(c.sub || '')}</div>` : ''}</div>`).join('')}</div>`;
    const kleineKop = `<header class="rd-kop rd-kop-klein">${logo()}<div class="rd-kop-rechts">Maandrapport<b>${esc(titelMaand)}</b></div></header><div class="rd-streep rd-streep-dun"></div>`;
    const bron = `<p class="rd-bron">${esc(r.bron || '')}${r.bron && r.aangemaakt ? '. ' : ''}${r.aangemaakt ? `Vastgelegd op ${esc(F.datumLang(r.aangemaakt))}. Deze cijfers staan vast en veranderen niet meer.` : ''}</p>`;
    return paginas.map((secties, i) => {
      const inhoud = secties.map((s) => {
        nr += 1;
        return `<section class="rd-sectie"><h3 class="rd-sectie-titel"><span class="rd-nr">${nr}.</span> ${esc(s.titel)}</h3>${s.uitleg ? `<p class="rd-uitleg">${esc(s.uitleg)}</p>` : ''}<div class="rd-tekst">${s.inhoud}</div></section>`;
      }).join('');
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

  const api = { documentHtml, miniatuur, kerncijfers, kernzin, gedaanZin, volgendRapport, aiMaand, aiGegevens, aiVragenHtml, platformTelling, vorigeMaand, volgendeMaandVan, ZOEKWOORDEN_IN_DOCUMENT, AI_VRAGEN_IN_DOCUMENT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.RapportDocument = api;
})();
