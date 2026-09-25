// LP Fabriek: structured data (JSON-LD) voor de dienst en het werkgebied van een landingspagina (25-09-2026).
//
// Aanleiding (SEO/GEO controle): Yoast levert al de basis (WebPage, Organization, BreadcrumbList) en wij voegden
// alleen FAQPage toe. Voor zoekmachines en AI-antwoorden (GEO) is het nuttig dat ook duidelijk staat WELKE
// dienst de pagina aanbiedt, WIE dat doet en VOOR WELK gebied. Dit wordt hier volledig deterministisch uit
// bestaande gegevens gemaakt (titel, metabeschrijving, aanbodkaarten, plaatsnaam uit de invoer, klantprofiel):
// de AI verzint hier niets (bronprincipe).

function zonderLinkOpmaak(tekst) {
  return String(tekst || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
}

// Zoekt in de invoer van de pagina naar een plaats (sleutel bevat plaats, stad, gemeente, locatie of regio).
function vindPlaats(invoer) {
  if (!invoer || typeof invoer !== 'object') return '';
  for (const [sleutel, waarde] of Object.entries(invoer)) {
    if (/plaats|stad|gemeente|locatie|regio/i.test(sleutel) && typeof waarde === 'string' && waarde.trim()) {
      return waarde.trim();
    }
  }
  return '';
}

function siteUrl(profile) {
  const uitEnv = profile && profile.wordpress && process.env[profile.wordpress.urlEnv];
  const url = (profile && profile.bedrijf && profile.bedrijf.url) || uitEnv || '';
  return String(url).replace(/\/$/, '');
}

function bouwProvider(profile) {
  if (!profile) return null;
  const site = siteUrl(profile);
  // Yoast zet zelf een Organization met dit vaste id op de pagina. Verwijzen we daarnaar, dan hoort onze dienst
  // bij DAT bedrijf (een entiteit) in plaats van een tweede, losse organisatie.
  if (profile.seo && /yoast/i.test(profile.seo.plugin || '') && site) {
    return { '@id': `${site}/#organization` };
  }
  const b = profile.bedrijf;
  if (!b || !b.naam) return null;
  const provider = { '@type': 'Organization', name: b.naam };
  if (site) provider.url = site;
  if (b.telefoon) provider.telephone = b.telefoon;
  if (b.email) provider.email = b.email;
  if (b.adres && b.adres.straat) {
    provider.address = {
      '@type': 'PostalAddress',
      streetAddress: b.adres.straat,
      postalCode: b.adres.postcode || undefined,
      addressLocality: b.adres.plaats || undefined,
      addressCountry: b.adres.land || 'NL'
    };
  }
  return provider;
}

function bouwServiceSchema({ slotData, invoer, profile }) {
  const data = slotData || {};
  const naam = zonderLinkOpmaak(data.heroTitle);
  if (!naam) return null;
  const schema = { '@context': 'https://schema.org', '@type': 'Service', name: naam };
  const beschrijving = zonderLinkOpmaak(data.metaDescription);
  if (beschrijving) schema.description = beschrijving;
  const provider = bouwProvider(profile);
  if (provider) schema.provider = provider;
  const plaats = vindPlaats(invoer);
  if (plaats) schema.areaServed = { '@type': 'City', name: plaats };
  if (Array.isArray(data.offerItems)) {
    const soorten = data.offerItems.map((i) => zonderLinkOpmaak(i && i.title)).filter(Boolean);
    if (soorten.length) schema.serviceType = soorten;
  }
  return schema;
}

module.exports = { bouwServiceSchema, vindPlaats, zonderLinkOpmaak };
