// Effecten: wat is er gedaan en wat was het gemeten effect. De data komt uit de
// n8n tabel effecten (nieuwe blogs, gevuld door BA - Shared - Effect Meting) en
// uit de tabel verbeteringen (blogs waar tekst aan is toegevoegd, gevuld door
// BA - Shared - Verbeteren Voorstel en Verbeteren Meting). Het portaal toont
// alleen gemeten cijfers. Er staan geen beloftes en geen oorzaken in de tekst.

const nl = (n) => Number(n).toLocaleString('nl-NL');
const nl1 = (n) => Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

function parse(tekst) {
  try {
    const v = JSON.parse(tekst || '');
    return v && typeof v === 'object' ? v : null;
  } catch (err) {
    return null;
  }
}

const FASE = {
  28: 'In de eerste 28 dagen',
  56: 'In dag 29 tot en met 56',
  90: 'In dag 63 tot en met 90'
};

// Zonder maand: de laatste meting die er is. Met maand (YYYY-MM): de laatste
// meting die in die maand is gedaan, zodat een maandrapport vastligt.
function laatsteMeting(rij, maand) {
  for (const n of [90, 56, 28]) {
    const m = parse(rij['meting_' + n]);
    if (!m) continue;
    if (maand && String(m.gemeten_op || '').slice(0, 7) !== maand) continue;
    return { dagen: n, m };
  }
  return null;
}

function aiRegel(ai) {
  if (!ai || ai.status !== 'gemeten' || !ai.voor || !ai.na) return null;
  return `Bij het onderwerp "${ai.cluster}" noemden AI antwoorden het merk ${ai.na.genoemd} keer in ${ai.na.antwoorden} antwoorden. In de weken voor deze blog was dat ${ai.voor.genoemd} keer in ${ai.voor.antwoorden} antwoorden. Dit zegt iets over het hele onderwerp, niet alleen over deze blog.`;
}

function blogItem(rij, maand) {
  const meting = laatsteMeting(rij, maand);
  const regels = [];
  if (!meting) {
    regels.push('De eerste meting volgt 31 dagen na publicatie.');
  } else {
    const m = meting.m;
    const v = num(m.vertoningen) || 0;
    const c = num(m.clicks) || 0;
    if (v === 0) {
      regels.push(`${FASE[meting.dagen]} is deze blog niet getoond in Google.`);
    } else {
      const bezoek = c > 0 ? `, met ${nl(c)} ${c === 1 ? 'bezoek' : 'bezoeken'} vanuit Google` : '';
      const pos = num(m.positie) !== null ? ` Gemiddelde positie: ${nl1(m.positie)}.` : '';
      regels.push(`${FASE[meting.dagen]} is deze blog ${nl(v)} keer getoond${bezoek}.${pos}`);
    }
    if (m.hoofdzoekwoord && num(m.hoofdzoekwoord.positie) !== null) {
      regels.push(`Voor "${m.hoofdzoekwoord.q}" stond de blog gemiddeld op positie ${nl1(m.hoofdzoekwoord.positie)}.`);
    }
    const ai = aiRegel(m.ai);
    if (ai) regels.push(ai);
  }
  return {
    soort: 'nieuwe_blog',
    soortLabel: 'Nieuwe blog',
    titel: rij.blog_titel || rij.blog_pad,
    url: rij.blog_url || '',
    datum: rij.actiedatum,
    gemetenNa: meting ? meting.dagen : null,
    regels
  };
}

function verbeterItem(rij, maand) {
  const datum = String(rij.geplaatst_op || rij.besluit_op || '').slice(0, 10);
  const meting = laatsteMeting(rij, maand);
  const regels = [`Er is tekst toegevoegd aan deze bestaande blog${rij.status === 'gedeeltelijk' ? ' (gedeeltelijk geplaatst)' : ''}.`];
  if (!meting) {
    regels.push('De eerste meting volgt 31 dagen na de aanpassing.');
  } else {
    const m = meting.m;
    const voor = m.blog_voor;
    const na = m.blog;
    if (voor && na && num(voor.vertoningen) > 0) {
      regels.push(`${meting.dagen} dagen na de aanpassing: ${nl(na.vertoningen)} keer getoond, tegenover ${nl(voor.vertoningen)} in de periode ervoor.`);
      if (num(voor.positie) > 0 && num(na.positie) > 0) {
        regels.push(`Gemiddelde positie: van ${nl1(voor.positie)} naar ${nl1(na.positie)}.`);
      }
    } else if (na) {
      regels.push(`${meting.dagen} dagen na de aanpassing: ${nl(na.vertoningen)} keer getoond.`);
    }
  }
  return {
    soort: 'verbetering',
    soortLabel: 'Blog aangevuld',
    titel: rij.blog_titel || rij.blog_pad,
    url: rij.blog_url || '',
    datum,
    gemetenNa: meting ? meting.dagen : null,
    regels
  };
}

// Interne link: er is in andere blogs een link toegevoegd naar deze pagina. De
// periode voor de link staat in details.voor, de meting daarna komt van Effect Meting.
function linkItem(rij, maand) {
  const det = parse(rij.details) || {};
  const aantal = Number(det.aantal) > 0 ? Number(det.aantal) : 1;
  const meting = laatsteMeting(rij, maand);
  const regels = [`Er ${aantal === 1 ? 'is 1 link' : 'zijn ' + aantal + ' links'} toegevoegd in ${aantal === 1 ? 'een andere blog' : 'andere blogs'} naar deze pagina.`];
  if (!meting) {
    regels.push('De eerste meting volgt 31 dagen na de link.');
  } else {
    const m = meting.m;
    const na = num(m.vertoningen) || 0;
    const voor = det.voor && det.voor.betrouwbaar ? det.voor : null;
    if (voor && num(voor.vertoningen) > 0) {
      regels.push(`${meting.dagen} dagen na de link: ${nl(na)} keer getoond, tegenover ${nl(voor.vertoningen)} in de 28 dagen ervoor.`);
      if (num(voor.positie) > 0 && num(m.positie) > 0) regels.push(`Gemiddelde positie: van ${nl1(voor.positie)} naar ${nl1(m.positie)}.`);
    } else if (na === 0) {
      regels.push(`${FASE[meting.dagen]} is deze pagina niet getoond in Google.`);
    } else {
      regels.push(`${FASE[meting.dagen]} is deze pagina ${nl(na)} keer getoond.`);
    }
  }
  return {
    soort: 'interne_link',
    soortLabel: 'Interne link toegevoegd',
    titel: rij.blog_titel || rij.blog_pad,
    url: rij.blog_url || '',
    datum: rij.actiedatum,
    gemetenNa: meting ? meting.dagen : null,
    regels
  };
}

function bouwEffecten(effRijen, verbRijen, maand) {
  const blogs = (effRijen || []).filter((r) => r && r.soort === 'nieuwe_blog');
  const verbeteringen = (verbRijen || []).filter((r) => r && (r.status === 'geplaatst' || r.status === 'gedeeltelijk'));
  const links = (effRijen || []).filter((r) => r && r.soort === 'interne_link');
  let items = blogs.map((r) => blogItem(r, maand)).concat(verbeteringen.map((r) => verbeterItem(r, maand)), links.map((r) => linkItem(r, maand)));
  // In een maandrapport staan alleen metingen die in die maand zijn gedaan.
  if (maand) items = items.filter((i) => i.gemetenNa);
  // Eerst wat al gemeten is, daarbinnen nieuwste eerst. Nog niet gemeten onderaan.
  items.sort((a, b) => {
    const ma = a.gemetenNa ? 0 : 1;
    const mb = b.gemetenNa ? 0 : 1;
    if (ma !== mb) return ma - mb;
    return String(b.datum || '') < String(a.datum || '') ? -1 : 1;
  });
  return {
    items,
    gemeten: items.filter((i) => i.gemetenNa).length,
    nogTeMeten: items.filter((i) => !i.gemetenNa).length
  };
}

module.exports = { bouwEffecten, blogItem, verbeterItem, linkItem };
