// Maakt van een vast maandrapport een nette PDF voor de klant. Alleen tekenen, er wordt niets herberekend
// behalve de AI cijfers van die maand, die uit de wekelijkse metingen komen.
const PDFDocument = require('pdfkit');

const KLEUR = { tekst: '#14142b', zacht: '#6b6f85', lijn: '#e4e6ef', vlak: '#f5f6fa', merk: '#ff3951', goed: '#1d8a4e', ai: '#6d4bd8' };
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

// De standaard PDF lettertypes kennen alleen Latijnse tekens. Andere tekens vallen weg in plaats van rommel te tonen.
function schoon(t) {
  return String(t === null || t === undefined ? '' : t).replace(/[^\x09\x0A\x20-\x7E -ÿ‘’“”–—…€•]/g, '');
}
const nl = (n) => Number(n).toLocaleString('nl-NL');
const nl1 = (n) => Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function datumLang(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  return `${Number(m[3])} ${MAANDEN[Number(m[2]) - 1]} ${m[1]}`;
}

function vorigeMaand(maand) {
  const m = /^(\d{4})-(\d{2})$/.exec(maand || '');
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 2, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

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

// Zelfde aantal zoekwoorden als het document in het portaal (public/rapport-document.js).
const ZOEKWOORDEN = 15;

function gedaanZin(gd) {
  return require('../../public/rapport-document').gedaanZin(gd);
}

function samenvoegZoekwoorden(blogs) {
  return require('../../public/zoekwoorden').samenvoegen(blogs, 'vertoningen');
}

function verschilTekst(nu, vorig) {
  if (vorig === null || vorig === undefined) return '';
  if (!vorig) return nu > 0 ? `+${nl(nu)} t.o.v. vorige maand` : 'gelijk aan vorige maand';
  const p = Math.round(((nu - vorig) / vorig) * 100);
  return p === 0 ? 'gelijk aan vorige maand' : `${p > 0 ? '+' : ''}${p}% t.o.v. vorige maand`;
}

// Zelfde aantal en tekst als in het document in het portaal (public/rapport-document.js).
const AI_VRAGEN_IN_PDF = 8;
function aiPlatformTelling(v) {
  const delen = [];
  if (v.chatgpt) delen.push(`ChatGPT ${v.chatgpt} keer`);
  if (v.gemini) delen.push(`Gemini ${v.gemini} keer`);
  let t = delen.join(', ');
  if (v.geciteerd) t += `. Jullie website ${v.geciteerd} keer als bron`;
  return t;
}

function bouwPdf({ rapport: r, klantNaam, ai }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 56, left: 48, right: 48 }, bufferPages: true,
      info: { Title: `Maandrapport ${schoon(r.label)}`, Author: 'Blogr. door Advertisr.' } });
    const delen = [];
    doc.on('data', (d) => delen.push(d));
    doc.on('end', () => resolve(Buffer.concat(delen)));
    doc.on('error', reject);

    const L = doc.page.margins.left;
    const W = doc.page.width - L - doc.page.margins.right;
    const ruimte = (h) => { if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage(); };
    const tekst = (t, o = {}) => {
      doc.font(o.vet ? 'Helvetica-Bold' : 'Helvetica').fontSize(o.maat || 10).fillColor(o.kleur || KLEUR.tekst);
      doc.text(schoon(t), o.x === undefined ? L : o.x, o.y === undefined ? doc.y : o.y, { width: o.breed || W, lineGap: o.regel === undefined ? 2 : o.regel, align: o.uitlijn || 'left' });
    };
    const hoogte = (t, maat, breed, vet) => { doc.font(vet ? 'Helvetica-Bold' : 'Helvetica').fontSize(maat); return doc.heightOfString(schoon(t), { width: breed, lineGap: 2 }); };
    let nummer = 0;
    const kop = (t, uitleg) => {
      ruimte(60);
      doc.moveDown(0.9);
      nummer += 1;
      tekst(`${nummer}. ${t}`, { vet: true, maat: 13 });
      if (uitleg) tekst(uitleg, { maat: 9, kleur: KLEUR.zacht });
      doc.moveTo(L, doc.y + 4).lineTo(L + W, doc.y + 4).strokeColor(KLEUR.lijn).lineWidth(1).stroke();
      doc.y += 12;
    };

    // Kop van het rapport
    const yLogo = doc.y;
    doc.font('Helvetica-Bold').fontSize(18).fillColor(KLEUR.tekst).text('Blogr', L, yLogo, { continued: true }).fillColor(KLEUR.merk).text('.');
    tekst('door Advertisr.', { maat: 8.5, kleur: KLEUR.zacht });
    tekst('Maandrapport', { maat: 9, kleur: KLEUR.zacht, x: L, y: yLogo + 2, uitlijn: 'right' });
    tekst(r.label.charAt(0).toUpperCase() + r.label.slice(1), { vet: true, maat: 10, x: L, uitlijn: 'right' });
    doc.y = yLogo + 36;
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor(KLEUR.tekst).lineWidth(1.5).stroke();
    doc.y += 18;
    if (klantNaam) tekst(String(klantNaam).toUpperCase(), { vet: true, maat: 9, kleur: KLEUR.merk });
    doc.moveDown(0.2);
    tekst(`Maandrapport ${r.label}`, { vet: true, maat: 24 });
    const periode = r.periodeStart && r.periodeEind ? `Periode ${datumLang(r.periodeStart)} tot en met ${datumLang(r.periodeEind)}` : `Periode ${r.label}`;
    tekst(`${periode}${r.aangemaakt ? `  |  vastgelegd op ${datumLang(r.aangemaakt)}` : ''}`, { maat: 10, kleur: KLEUR.zacht });
    doc.moveDown(0.8);

    // Statusbalk
    const t = r.totalen || {};
    const vNu = t.vertoningen || 0;
    const regel = vNu > 0 ? `In ${r.label} stonden jullie blogs ${nl(vNu)} keer in Google` : `In ${r.label} werden jullie blogs nog niet getoond in Google`;
    const zin = r.voortgang || 'Dit rapport ligt vast. De cijfers veranderen niet meer.';
    const hStatus = hoogte(regel, 14, W - 32, true) + hoogte(zin, 10, W - 32) + 28;
    ruimte(hStatus + 10);
    const y0 = doc.y;
    doc.roundedRect(L, y0, W, hStatus, 8).fill(KLEUR.vlak);
    doc.circle(L + 16, y0 + 20, 4).fill(KLEUR.goed);
    tekst(regel, { vet: true, maat: 14, x: L + 28, y: y0 + 13, breed: W - 44 });
    tekst(zin, { maat: 10, kleur: KLEUR.zacht, x: L + 28, breed: W - 44 });
    doc.y = y0 + hStatus + 14;

    // Kerncijfers
    const g = ai ? { nu: aiMaand(ai, r.maand), vorig: aiMaand(ai, vorigeMaand(r.maand)) } : null;
    const tegels = [
      { l: 'Keer getoond in Google', w: nl(vNu), s: verschilTekst(vNu, t.vertoningen_vorig) },
      { l: 'Bezoekers vanuit Google', w: nl(t.clicks || 0), s: verschilTekst(t.clicks || 0, t.clicks_vorig) }
    ];
    if (t.paginaweergaven !== null && t.paginaweergaven !== undefined) tegels.push({ l: 'Paginaweergaven', w: nl(t.paginaweergaven), s: 'Google Analytics' });
    if (t.hk_positie_gemiddeld !== null && t.hk_positie_gemiddeld !== undefined) tegels.push({ l: 'Positie hoofdzoekwoorden', w: nl1(t.hk_positie_gemiddeld), s: 'Lager is beter' });
    if (g && g.nu) tegels.push({ l: 'AI noemt jullie', w: `${g.nu.percentage}%`, s: g.vorig ? `${g.vorig.percentage}% vorige maand` : 'van de antwoorden' });
    const perRij = tegels.length > 4 ? 3 : tegels.length;
    const tb = (W - (perRij - 1) * 10) / perRij;
    for (let i = 0; i < tegels.length; i += perRij) {
      // Een label over twee regels schuift het getal omlaag, zodat niets over elkaar valt.
      const rij = tegels.slice(i, i + perRij);
      const labelH = Math.max(...rij.map((x) => hoogte(x.l, 8.5, tb - 20)));
      const subH = Math.max(...rij.map((x) => hoogte(x.s, 8, tb - 20)));
      const h = 9 + labelH + 4 + 24 + subH + 8;
      ruimte(h + 10);
      const y = doc.y;
      rij.forEach((x, k) => {
        const tx = L + k * (tb + 10);
        doc.roundedRect(tx, y, tb, h, 8).lineWidth(1).strokeColor(KLEUR.lijn).stroke();
        tekst(x.l, { maat: 8.5, kleur: KLEUR.zacht, x: tx + 10, y: y + 9, breed: tb - 20 });
        tekst(x.w, { vet: true, maat: 20, x: tx + 10, y: y + 9 + labelH + 4, breed: tb - 20 });
        tekst(x.s, { maat: 8, kleur: KLEUR.zacht, x: tx + 10, y: y + 9 + labelH + 4 + 24, breed: tb - 20 });
      });
      doc.y = y + h + 10;
    }

    // Terugblik
    kop(`Terugblik op ${r.label}`);
    if (r.terugblik && r.terugblik.length) {
      r.terugblik.forEach((a) => { ruimte(hoogte(a, 10, W) + 8); tekst(a, { maat: 10.5, regel: 3 }); doc.moveDown(0.5); });
    } else tekst('Voor deze maand is geen toelichting beschikbaar.', { kleur: KLEUR.zacht });

    // Nieuwe blogs
    kop(`Wat we deden in ${r.label}`);
    const gedaan = gedaanZin(r.gedaan);
    if (gedaan) { tekst(gedaan.charAt(0).toUpperCase() + gedaan.slice(1), { maat: 10.5, regel: 3 }); doc.moveDown(0.5); }
    ruimte(30);
    tekst('Nieuwe blogs', { vet: true, maat: 10.5 });
    doc.moveDown(0.3);
    if (r.nieuweBlogs && r.nieuweBlogs.length) {
      r.nieuweBlogs.forEach((b) => { const x = `${b.titel}${b.datum ? ` (${datumLang(b.datum)})` : ''}`; ruimte(hoogte(x, 10, W - 14) + 6); const y = doc.y; doc.circle(L + 3, y + 5, 1.8).fill(KLEUR.tekst); tekst(x, { x: L + 14, y, breed: W - 14 }); doc.moveDown(0.25); });
    } else tekst('Er zijn deze maand geen nieuwe blogs live gegaan.', { kleur: KLEUR.zacht });

    // Blogs met cijfers
    const metCijfers = (r.blogs || []).filter((b) => (b.vertoningen || 0) > 0 || (b.clicks || 0) > 0)
      .slice().sort((a, b) => (b.vertoningen || 0) - (a.vertoningen || 0) || (b.clicks || 0) - (a.clicks || 0));
    kop('Blogs met de meeste vertoningen');
    if (!metCijfers.length) tekst('Geen blogs met cijfers in deze maand.', { kleur: KLEUR.zacht });
    else {
      const cB = W - 150;
      ruimte(24);
      let y = doc.y;
      tekst('BLOG', { vet: true, maat: 8, kleur: KLEUR.zacht, y, breed: cB });
      tekst('GETOOND', { vet: true, maat: 8, kleur: KLEUR.zacht, x: L + cB, y, breed: 70, uitlijn: 'right' });
      tekst('BEZOEKERS', { vet: true, maat: 8, kleur: KLEUR.zacht, x: L + cB + 70, y, breed: 80, uitlijn: 'right' });
      doc.y = y + 14;
      metCijfers.forEach((b) => {
        const h = Math.max(hoogte(b.titel, 10, cB - 10), 12) + 10;
        ruimte(h);
        y = doc.y;
        doc.moveTo(L, y).lineTo(L + W, y).strokeColor(KLEUR.lijn).lineWidth(0.5).stroke();
        tekst(b.titel, { x: L, y: y + 5, breed: cB - 10 });
        tekst(nl(b.vertoningen || 0), { x: L + cB, y: y + 5, breed: 70, uitlijn: 'right' });
        tekst(nl(b.clicks || 0), { x: L + cB + 70, y: y + 5, breed: 80, uitlijn: 'right' });
        doc.y = y + h;
      });
      const zonder = (r.blogs || []).length - metCijfers.length;
      if (zonder > 0) { doc.moveDown(0.5); tekst(`${zonder} ${zonder === 1 ? 'blog had' : 'blogs hadden'} deze maand geen vertoningen of bezoekers.`, { maat: 8.5, kleur: KLEUR.zacht }); }
    }

    // Zoekwoorden
    const zwAlle = samenvoegZoekwoorden(r.blogs);
    const zw = zwAlle.slice(0, ZOEKWOORDEN);
    if (zw.length) {
      kop(`Zoekwoorden in ${r.label}`, 'Waar mensen op zochten toen ze jullie blogs in Google zagen.');
      const cQ = W - 210;
      ruimte(24);
      let zy = doc.y;
      tekst('ZOEKWOORD', { vet: true, maat: 8, kleur: KLEUR.zacht, y: zy, breed: cQ });
      tekst('GETOOND', { vet: true, maat: 8, kleur: KLEUR.zacht, x: L + cQ, y: zy, breed: 70, uitlijn: 'right' });
      tekst('BEZOEKERS', { vet: true, maat: 8, kleur: KLEUR.zacht, x: L + cQ + 70, y: zy, breed: 70, uitlijn: 'right' });
      tekst('POSITIE', { vet: true, maat: 8, kleur: KLEUR.zacht, x: L + cQ + 140, y: zy, breed: 70, uitlijn: 'right' });
      doc.y = zy + 14;
      zw.forEach((x) => {
        const h = Math.max(hoogte(x.q, 10, cQ - 10), 12) + 10;
        ruimte(h);
        zy = doc.y;
        doc.moveTo(L, zy).lineTo(L + W, zy).strokeColor(KLEUR.lijn).lineWidth(0.5).stroke();
        tekst(x.q, { x: L, y: zy + 5, breed: cQ - 10 });
        tekst(nl(x.i), { x: L + cQ, y: zy + 5, breed: 70, uitlijn: 'right' });
        tekst(nl(x.c), { x: L + cQ + 70, y: zy + 5, breed: 70, uitlijn: 'right' });
        tekst(x.p === null ? '-' : nl1(x.p), { x: L + cQ + 140, y: zy + 5, breed: 70, uitlijn: 'right', vet: x.p !== null && x.p <= 10, kleur: x.p !== null && x.p <= 10 ? KLEUR.goed : KLEUR.tekst });
        doc.y = zy + h;
      });
      if (zwAlle.length > zw.length) { doc.moveDown(0.5); tekst(`De ${zw.length} zoekwoorden die het vaakst getoond werden, van ${zwAlle.length} in totaal.`, { maat: 8.5, kleur: KLEUR.zacht }); }
    }

    // AI zichtbaarheid
    if (ai && ai.beschikbaar !== false) {
      kop(`AI zichtbaarheid in ${r.label}`, 'Hoe vaak ChatGPT en Gemini jullie merk noemen bij vragen die jullie klanten stellen.');
      if (!g || !g.nu) {
        tekst('In deze maand is nog niet gemeten. We stellen elke week dezelfde vragen aan ChatGPT en Gemini.', { kleur: KLEUR.zacht });
      } else {
        let vergelijking = 'Er is nog geen vorige maand om mee te vergelijken.';
        if (g.vorig) {
          const d = g.nu.percentage - g.vorig.percentage;
          vergelijking = d === 0 ? `Even hoog als de maand ervoor (${g.vorig.percentage}%).` : `${Math.abs(d)} procentpunt ${d > 0 ? 'hoger' : 'lager'} dan de maand ervoor (${g.vorig.percentage}%).`;
        }
        const klein = g.nu.antwoorden < 100 ? ' Het gaat om een beperkt aantal antwoorden, dus kleine verschillen zeggen nog weinig.' : '';
        tekst(`AI noemde jullie merk in ${g.nu.percentage}% van de antwoorden. ${vergelijking}${klein}`, { vet: true, maat: 10.5, regel: 3 });
        doc.moveDown(0.6);
        const namen = {};
        (ai.platformen || []).forEach((p) => { if (p && p.id) namen[p.id] = p.label || p.id; });
        Object.keys(g.nu.per).forEach((id) => {
          ruimte(30);
          const x = g.nu.per[id];
          const pct = x.antwoorden ? Math.round((x.genoemd / x.antwoorden) * 100) : 0;
          const y = doc.y;
          tekst(namen[id] || id, { vet: true, maat: 10, breed: 90 });
          doc.roundedRect(L + 100, y + 3, W - 170, 7, 3.5).fill(KLEUR.vlak);
          if (pct > 0) doc.roundedRect(L + 100, y + 3, Math.max(7, (W - 170) * Math.min(100, pct) / 100), 7, 3.5).fill(KLEUR.ai);
          tekst(`${pct}%`, { vet: true, maat: 10, x: L + W - 60, y, breed: 60, uitlijn: 'right' });
          tekst(`${x.genoemd} van ${x.antwoorden} antwoorden`, { maat: 8.5, kleur: KLEUR.zacht, x: L + 100, y: y + 14, breed: W - 170 });
          doc.y = y + 30;
        });
        tekst(`${g.nu.weken} ${g.nu.weken === 1 ? 'meting' : 'metingen'} in ${r.label}, ${g.nu.antwoorden} antwoorden in totaal.`, { maat: 8.5, kleur: KLEUR.zacht });
        const vragen = Array.isArray(ai.vragenMaand) ? ai.vragenMaand : null;
        if (vragen && !vragen.length) {
          doc.moveDown(0.5);
          tekst(`In ${r.label} noemde AI jullie merk bij geen van de vragen.`, { kleur: KLEUR.zacht });
        } else if (vragen) {
          doc.moveDown(0.6);
          ruimte(40);
          tekst('Bij deze vragen noemde AI jullie merk', { vet: true, maat: 10.5, regel: 3 });
          doc.moveDown(0.3);
          vragen.slice(0, AI_VRAGEN_IN_PDF).forEach((v, i) => {
            const sub = aiPlatformTelling(v);
            ruimte(hoogte(v.vraag, 10, W - 18) + hoogte(sub, 8.5, W - 18) + 8);
            const y = doc.y;
            tekst(`${i + 1}.`, { maat: 10, kleur: KLEUR.zacht, x: L, y, breed: 16 });
            doc.y = y;
            tekst(v.vraag, { maat: 10, x: L + 18, breed: W - 18 });
            tekst(sub, { maat: 8.5, kleur: KLEUR.zacht, x: L + 18, breed: W - 18 });
            doc.moveDown(0.35);
          });
          const rest = vragen.length - Math.min(vragen.length, AI_VRAGEN_IN_PDF);
          tekst(rest > 0 ? `En bij ${rest} ${rest === 1 ? 'andere vraag' : 'andere vragen'}. Alle antwoorden staan in het tabblad AI zichtbaarheid van het portaal.` : 'De antwoorden zelf staan in het tabblad AI zichtbaarheid van het portaal.', { maat: 8.5, kleur: KLEUR.zacht });
        }
      }
    }

    // Effecten
    const items = (r.effecten && r.effecten.items) || [];
    if (items.length) {
      kop('Wat hebben we gedaan en wat was het effect', `Metingen die in ${r.label} zijn gedaan. Het zijn gemeten cijfers uit Google. Ze laten niet zien wat de oorzaak was.`);
      items.forEach((i) => {
        const regels = (i.regels || []).join(' ');
        ruimte(hoogte(i.titel, 10, W, true) + hoogte(regels, 9.5, W) + 30);
        tekst(`${i.soortLabel || ''}${i.datum ? `  |  ${datumLang(i.datum)}` : ''}`, { maat: 8.5, kleur: KLEUR.zacht });
        tekst(i.titel, { vet: true });
        if (regels) tekst(regels, { maat: 9.5 });
        doc.moveDown(0.6);
      });
    }

    // Vooruitblik
    kop('Vooruitblik');
    if (!r.vooruitblik || !r.vooruitblik.length) tekst('Nog geen onderbouwde kansen. Zodra Search Console genoeg data heeft, staat hier wat we gaan oppakken.', { kleur: KLEUR.zacht });
    else r.vooruitblik.forEach((p) => {
      ruimte(hoogte(p.titel, 10, W, true) + hoogte(p.tekst, 9.5, W) + 16);
      tekst(p.titel, { vet: true });
      tekst(p.tekst, { maat: 9.5, kleur: KLEUR.zacht });
      doc.moveDown(0.6);
    });

    doc.moveDown(0.8);
    ruimte(30);
    tekst(`${r.bron || ''}${r.aangemaakt ? `. Vastgelegd op ${datumLang(r.aangemaakt)}. Deze cijfers staan vast en veranderen niet meer.` : ''}`, { maat: 8, kleur: KLEUR.zacht });

    // Voettekst op elke pagina
    const bereik = doc.bufferedPageRange();
    for (let i = 0; i < bereik.count; i++) {
      doc.switchToPage(i);
      const ond = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = doc.page.height - 34;
      doc.moveTo(L, y - 6).lineTo(L + W, y - 6).strokeColor(KLEUR.lijn).lineWidth(0.5).stroke();
      doc.font('Helvetica').fontSize(8).fillColor(KLEUR.zacht);
      doc.text(schoon(`${klantNaam ? klantNaam + '  |  ' : ''}Maandrapport ${r.label}`), L, y, { width: W / 2, lineBreak: false });
      doc.text(`Pagina ${i + 1} van ${bereik.count}`, L + W / 2, y, { width: W / 2, align: 'right', lineBreak: false });
      doc.page.margins.bottom = ond;
    }
    doc.end();
  });
}

module.exports = { bouwPdf, aiMaand, vorigeMaand };
