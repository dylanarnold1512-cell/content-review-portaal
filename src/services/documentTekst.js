// Tekst-extractie voor het Kennisdocument-tabblad: een klant of Dylan kan een
// Word- of PDF-bestand uploaden in plaats van alles zelf te moeten typen. Zet
// alleen om naar platte tekst, geen opmaak — het kennisdocument wordt toch
// alleen als losse tekst in de schrijf-prompt gebruikt (zie n8n-workflows).

const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

const CONTENT_TYPE_MAP = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'txt'
};

function bepaalType(filename, contentType) {
  const ext = (filename || '').toLowerCase().split('.').pop();
  if (ext === 'docx') return 'docx';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'txt' || ext === 'md') return 'txt';
  if (ext === 'doc') return 'doc';
  if (CONTENT_TYPE_MAP[contentType]) return CONTENT_TYPE_MAP[contentType];
  return null;
}

async function extraheerTekst({ filename, contentType, buffer }) {
  const type = bepaalType(filename, contentType);
  if (type === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }
  if (type === 'pdf') {
    const result = await pdfParse(buffer);
    return result.text.trim();
  }
  if (type === 'txt') {
    return buffer.toString('utf8').trim();
  }
  if (type === 'doc') {
    throw new Error(
      'Het oude .doc-formaat wordt niet ondersteund. Sla het bestand op als .docx of .pdf en upload opnieuw.'
    );
  }
  throw new Error('Onbekend bestandstype — upload een .docx, .pdf of .txt bestand.');
}

module.exports = { extraheerTekst, bepaalType };
