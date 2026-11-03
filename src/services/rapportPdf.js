// Maakt van een vast maandrapport een nette PDF voor de klant. Alleen tekenen: de hoofdstukken en cijfers komen uit
// hetzelfde model als het document in het portaal (public/rapport-document.js). Oude rapporten zonder snapshot
// rekenen de AI cijfers van die maand nog uit de wekelijkse metingen (aiMaand).
const PDFDocument = require('pdfkit');

const KLEUR = { tekst: '#14142b', zacht: '#6b6f85', lijn: '#e4e6ef', vlak: '#f5f6fa', merk: '#ff3951', goed: '#1d8a4e', ai: '#6d4bd8' };
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

// De standaard PDF lettertypes kennen alleen Latijnse tekens. Andere tekens vallen weg in plaats van rommel te tonen.
function schoon(t) {
  return String(t === null || t === undefined ? '' : t).replace(/[^\x09\x0A\x20-\x7E -ÿ‘’“”–—…€•]/g, '');
}
const nl = (n) => Number(n).toLocaleString('nl-NL');

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
      // Genoeg ruimte voor de kop en het begin van het hoofdstuk, zodat een kop niet alleen onderaan een pagina staat.
      ruimte(120);
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

    // Kerncijfers en hoofdstukken komen uit hetzelfde model als het document in het portaal (public/rapport-document.js).
    const D = require('../../public/rapport-document');
    const g = D.aiGegevens(ai, r, ai && ai.vragenMaand);

    const tegelRij = (lijst) => {
      const tegels = lijst.map((c) => ({ l: c.label, w: c.waarde, s: [c.verschil ? c.verschil.tekst : '', c.sub || ''].filter(Boolean).join(' ') }));
      const perRij = tegels.length > 4 ? 3 : Math.max(1, tegels.length);
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
    };
    tegelRij(D.kerncijfers(r, g));

    const bolletje = (x, nr) => {
      ruimte(hoogte(x, 10, W - 18) + 6);
      const y = doc.y;
      if (nr) tekst(`${nr}.`, { maat: 10, kleur: KLEUR.zacht, x: L, y, breed: 16 });
      else doc.circle(L + 3, y + 5, 1.8).fill(KLEUR.tekst);
      tekst(x, { x: L + (nr ? 18 : 14), y, breed: W - (nr ? 18 : 14) });
      doc.moveDown(0.25);
    };

    const tabel = (b) => {
      const n = b.kolommen.length;
      const numBreed = 70;
      const eerste = W - (n - 1) * numBreed;
      const xVan = (i) => (i === 0 ? L : L + eerste + (i - 1) * numBreed);
      const breed = (i) => (i === 0 ? eerste - 10 : numBreed);
      ruimte(24);
      let y = doc.y;
      b.kolommen.forEach((k, i) => tekst(k.label.toUpperCase(), { vet: true, maat: 8, kleur: KLEUR.zacht, x: xVan(i), y, breed: breed(i), uitlijn: k.num ? 'right' : 'left' }));
      doc.y = y + 14;
      b.rijen.forEach((rij) => {
        const h = Math.max(hoogte(rij[0].tekst, 10, eerste - 10), 12) + 10;
        ruimte(h);
        y = doc.y;
        doc.moveTo(L, y).lineTo(L + W, y).strokeColor(KLEUR.lijn).lineWidth(0.5).stroke();
        rij.forEach((c, i) => tekst(c.zacht ? '-' : c.tekst, { x: xVan(i), y: y + 5, breed: breed(i), uitlijn: b.kolommen[i] && b.kolommen[i].num ? 'right' : 'left', vet: Boolean(c.goed), kleur: c.goed ? KLEUR.goed : KLEUR.tekst }));
        doc.y = y + h;
      });
      doc.moveDown(0.4);
    };

    const blok = (b) => {
      switch (b.type) {
        case 'p':
          ruimte(hoogte(b.tekst, 10.5, W, b.vet) + 8); tekst(b.tekst, { maat: 10.5, regel: 3, vet: b.vet });
          if (b.vervolg) tekst(b.vervolg, { maat: 10.5, regel: 3 });
          doc.moveDown(0.5); break;
        case 'zacht': ruimte(hoogte(b.tekst, 10, W) + 6); tekst(b.tekst, { kleur: KLEUR.zacht }); doc.moveDown(0.4); break;
        case 'noot': ruimte(hoogte(b.tekst, 8.5, W) + 6); tekst(b.tekst, { maat: 8.5, kleur: KLEUR.zacht }); doc.moveDown(0.4); break;
        case 'subkop': ruimte(40); doc.moveDown(0.4); tekst(b.tekst, { vet: true, maat: 11 }); doc.moveDown(0.3); break;
        case 'lijst': b.items.forEach((x, i) => bolletje(`${x}${b.datums && b.datums[i] ? ` (${b.datums[i]})` : ''}`, b.genummerd ? i + 1 : 0)); doc.moveDown(0.3); break;
        case 'cijfers': tegelRij(b.items); break;
        case 'tabel': tabel(b); break;
        case 'ai':
          b.rijen.forEach((x) => {
            ruimte(30);
            const y = doc.y;
            tekst(x.naam, { vet: true, maat: 10, breed: 90 });
            doc.roundedRect(L + 100, y + 3, W - 170, 7, 3.5).fill(KLEUR.vlak);
            if (x.pct > 0) doc.roundedRect(L + 100, y + 3, Math.max(7, (W - 170) * Math.min(100, x.pct) / 100), 7, 3.5).fill(KLEUR.ai);
            tekst(`${x.pct}%`, { vet: true, maat: 10, x: L + W - 60, y, breed: 60, uitlijn: 'right' });
            tekst(x.sub, { maat: 8.5, kleur: KLEUR.zacht, x: L + 100, y: y + 14, breed: W - 170 });
            doc.y = y + 30;
          });
          break;
        case 'vragen':
          b.items.forEach((v, i) => {
            ruimte(hoogte(v.vraag, 10, W - 18) + hoogte(v.sub, 8.5, W - 18) + 8);
            const y = doc.y;
            tekst(`${i + 1}.`, { maat: 10, kleur: KLEUR.zacht, x: L, y, breed: 16 });
            doc.y = y;
            tekst(v.vraag, { maat: 10, x: L + 18, breed: W - 18 });
            tekst(v.sub, { maat: 8.5, kleur: KLEUR.zacht, x: L + 18, breed: W - 18 });
            doc.moveDown(0.35);
          });
          break;
        case 'punten':
          b.items.forEach((i) => {
            const regels = (i.regels || []).join(' ');
            ruimte(hoogte(i.titel, 10, W, true) + hoogte(regels, 9.5, W) + 30);
            if (i.meta) tekst(i.meta.replace(' · ', '  |  '), { maat: 8.5, kleur: KLEUR.zacht });
            tekst(i.titel, { vet: true });
            if (regels) tekst(regels, { maat: 9.5, kleur: KLEUR.zacht });
            doc.moveDown(0.6);
          });
          break;
        default: break;
      }
    };

    D.hoofdstukken(r, g).forEach((h, i) => {
      if (i === 0) {
        ruimte(60); doc.moveDown(0.9);
        tekst(h.titel, { vet: true, maat: 13 });
        doc.moveTo(L, doc.y + 4).lineTo(L + W, doc.y + 4).strokeColor(KLEUR.lijn).lineWidth(1).stroke();
        doc.y += 12;
      } else kop(h.titel, h.lead);
      h.blokken.forEach(blok);
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
