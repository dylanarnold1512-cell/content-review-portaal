// Een nieuwe pagina doet de eerste stappen zelf: het onderwerp wordt ingevuld, alle feiten van de klant staan aan
// (feitenDefaults.js) en de AI schrijft de tekst op de achtergrond. De beheerder controleert en zet live.

// Tekst voor "Waar gaat deze pagina over?". Een zelf getypte tekst wint altijd.
function onderwerpTekst(invoer, titel) {
  const inv = invoer || {};
  const eigen = String(inv._watGaatDezePaginaOver || '').trim();
  if (eigen) return eigen;
  const dienst = String(inv.dienstFocus || inv.dienst || '').trim();
  const plaats = String(inv.plaatsnaam || inv.plaats || '').trim();
  const werkgebied = String(inv.werkgebied || '').trim();
  const reden = String(((inv.plan || {}).reden) || '').trim();
  const kop = String(inv.onderwerp || titel || '').trim();
  const delen = [];
  if (dienst && plaats) delen.push(`Pagina over ${dienst} in ${plaats}.`);
  else if (kop) delen.push(`Pagina over ${kop}.`);
  else if (dienst || plaats) delen.push(`Pagina over ${dienst || plaats}.`);
  if (werkgebied && werkgebied !== plaats) delen.push(`Werkgebied: ${werkgebied}.`);
  if (reden) delen.push(reden.replace(/[.!?]*$/, '.'));
  return delen.join(' ').replace(/\s*[–—]\s*/g, ', ').trim();
}

// Zet het onderwerp in de invoer als het er nog niet staat.
function metOnderwerp(invoer, titel) {
  const inv = { ...(invoer || {}) };
  if (!String(inv._watGaatDezePaginaOver || '').trim()) {
    const tekst = onderwerpTekst(inv, titel);
    if (tekst) inv._watGaatDezePaginaOver = tekst;
  }
  return inv;
}

// Eenvoudige wachtrij in het geheugen: een taak tegelijk, zodat OpenAI en WordPress niet overspoeld worden.
function maakWachtrij() {
  const status = new Map();
  let keten = Promise.resolve();
  return {
    zet(pageId, taak) {
      status.set(pageId, { status: 'wacht' });
      keten = keten.then(async () => {
        status.set(pageId, { status: 'bezig' });
        try {
          await taak();
          status.delete(pageId);
        } catch (err) {
          status.set(pageId, { status: 'fout', fout: err.message });
        }
      });
      return keten;
    },
    status(pageId) { return status.get(pageId) || null; }
  };
}

module.exports = { onderwerpTekst, metOnderwerp, maakWachtrij };
