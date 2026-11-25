// Houdt de SEO titel en beschrijving binnen de lengte van het sjabloon. De AI schrijft er soms een paar tekens
// overheen. Vroeger bleef de pagina dan hangen: de controle vond hem schoon (Klaar voor live), maar live zetten
// weigerde hem. Nu kappen we te lange teksten netjes af, zonder halve woorden.

// Kort een metatitel in tot maximaal `max` tekens. Eerst valt het merk achter de streep weg of wordt het korter,
// daarna pas worden woorden afgekapt.
function kortTitelIn(titel, max) {
  const tekst = String(titel || '').trim();
  if (!max || tekst.length <= max) return tekst;
  const delen = tekst.split(/\s+[|–—-]\s+/);
  if (delen.length > 1) {
    const hoofd = delen.slice(0, -1).join(' | ');
    const merk = delen[delen.length - 1];
    // Eerst het merk korter: alleen het eerste woord (Hirs Installaties wordt Hirs).
    const kortMerk = merk.split(/\s+/)[0];
    if ((hoofd + ' | ' + kortMerk).length <= max) return hoofd + ' | ' + kortMerk;
    if (hoofd.length <= max) return hoofd;
    return kapAf(hoofd, max);
  }
  return kapAf(tekst, max);
}

// Kort een beschrijving in tot maximaal `max` tekens, bij voorkeur aan het einde van een zin.
function kortBeschrijvingIn(tekst, max) {
  const t = String(tekst || '').trim();
  if (!max || t.length <= max) return t;
  const zinnen = t.match(/[^.!?]+[.!?]+(\s|$)/g) || [];
  let uit = '';
  for (const z of zinnen) {
    if ((uit + z).trim().length > max) break;
    uit += z;
  }
  uit = uit.trim();
  return uit.length >= Math.floor(max * 0.6) ? uit : kapAf(t, max);
}

function kapAf(tekst, max) {
  if (tekst.length <= max) return tekst;
  const stuk = tekst.slice(0, max + 1);
  const spatie = stuk.lastIndexOf(' ');
  const kort = (spatie > max * 0.6 ? stuk.slice(0, spatie) : tekst.slice(0, max)).replace(/[\s,;:|–—-]+$/, '');
  return kort;
}

// Past slotData.metaTitle en slotData.metaDescription aan op de seoRegels van het sjabloon. Geeft terug wat er
// is aangepast, zodat het scherm dat kan melden. Verandert slotData op zijn plek.
function pasMetaLengteToe(slotData, seoRegels) {
  const aangepast = [];
  if (!slotData || !seoRegels) return aangepast;
  if (typeof seoRegels.metaTitleMax === 'number' && typeof slotData.metaTitle === 'string') {
    const nieuw = kortTitelIn(slotData.metaTitle, seoRegels.metaTitleMax);
    if (nieuw !== slotData.metaTitle) { aangepast.push({ veld: 'metaTitle', van: slotData.metaTitle.length, naar: nieuw.length }); slotData.metaTitle = nieuw; }
  }
  if (typeof seoRegels.metaDescriptionMax === 'number' && typeof slotData.metaDescription === 'string') {
    const nieuw = kortBeschrijvingIn(slotData.metaDescription, seoRegels.metaDescriptionMax);
    if (nieuw !== slotData.metaDescription) { aangepast.push({ veld: 'metaDescription', van: slotData.metaDescription.length, naar: nieuw.length }); slotData.metaDescription = nieuw; }
  }
  return aangepast;
}

module.exports = { kortTitelIn, kortBeschrijvingIn, pasMetaLengteToe };
