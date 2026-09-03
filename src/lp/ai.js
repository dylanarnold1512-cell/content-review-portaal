// LP Fabriek: AI-gestuurde sjabloongeneratie (bouwstap 6, bouwvolgorde-stap 3).
// Genereert op basis van Dylans input een BLUEPRINT-voorstel (de structuur-
// regels van een sjabloon, zie templates.js) plus voorbeeldBlocks (placeholder
// content, puur om meteen een live voorbeeld te tonen met de echte
// klant-branding via render.js/tokens.js). Slaat zelf niets op in Notion —
// dat gebeurt zoals voorheen via POST /api/lp/templates (zie routes/lp.js),
// nadat Dylan het voorstel heeft bekeken en eventueel gefinetuned.
//
// Gebruikt Dylans eigen OPENAI_API_KEY (nooit door Claude gezien, zelfde
// patroon als de andere credentials — zie besluiten.md "Bouwstap 6").
// Model: GPT-5.5 (overschrijfbaar via OPENAI_MODEL, voor het geval de exacte
// API-modelnaam ooit afwijkt van de productnaam).

const BLOCK_TYPES_REFERENCE = `
Beschikbare bloktypes en hun exacte data-vorm (gebruik ALLEEN deze bloktypes):
- hero: { title, intro?, cta?: { label, href }, image?: { src, alt } } — exact 1x per pagina, dit is de enige H1.
- intro: { heading?, text }
- tekstblok: { heading?, text }
- usp-grid: { heading?, items: [{ title, text }] }
- aanbod-grid: { heading?, items: [{ title, text, href?, image?: { src, alt } }] }
- doelgroep: { heading?, text, items?: string[] }
- stappen: { heading?, steps: [{ title, text }] }
- bewijs: { heading?, items: [{ stat, label }] }
- reviews: { heading?, items: [{ quote, author, meta? }] }
- praktisch: { heading?, items: [{ label, value }] }
- links: { heading?, items: [{ label, href, reason?, zusterpagina?: boolean }] }
- faq: { heading?, items: [{ question, answer }] }
- cta: { heading?, text?, cta: { label, href } }
`.trim();

const BLUEPRINT_SCHEMA_REFERENCE = `
Een blueprint (sjabloon) is een JSON-object met exact deze velden:
{
  "invoerVelden": [{ "key": string, "label": string, "verplicht": boolean }],
  "verplichteBlokken": string[],
  "optioneleBlokken": string[],
  "uniciteitsbudget": { "minimumUniekeFeiten": number, "uitgeslotenVanUniciteit": string[] },
  "linkRegels": { "minimumInterneLinks": number, "minimumNaarZusterpaginas": number, "reasonRequired": boolean },
  "ctaRegel": { "verplicht": boolean },
  "seoRegels": { "exactEenH1": boolean, "metaTitleMin": number, "metaTitleMax": number, "metaDescriptionMin": number, "metaDescriptionMax": number }
}
Regels: verplichteBlokken bevat altijd exact 1x "hero", en dan hoort seoRegels.exactEenH1 op true.
Gebruikelijke SEO-lengtes: metaTitleMin 40-50, metaTitleMax 60, metaDescriptionMin 120, metaDescriptionMax 160.
invoerVelden zijn de handmatige invoervelden die de gebruiker straks per NIEUWE PAGINA van dit type
moet invullen (bijv. event-naam, datum, locatie) — niet de vaste feiten (die komen uit de feitensheet).
`.trim();

function buildSystemPrompt() {
  return `Je bent een senior landingspagina-strateeg voor een Nederlands marketingbureau. Je ontwerpt een
SJABLOON (blueprint) voor een terugkerend paginatype — niet de inhoud van één individuele pagina. Je
kent veelvoorkomende paginatypes (evenementenpagina, dienstenpagina per locatie/vestiging, productpagina,
campagnepagina, seizoensactie, festivalpagina) en past die kennis toe op de vraag van de gebruiker.

${BLOCK_TYPES_REFERENCE}

${BLUEPRINT_SCHEMA_REFERENCE}

Antwoord ALLEEN met een JSON-object met exact twee velden, geen tekst erbuiten:
{
  "blueprint": <het blueprint-object hierboven, passend bij het gevraagde paginatype>,
  "voorbeeldBlocks": <array van { "type": ..., "data": ... } die samen de verplichteBlokken vullen met
    duidelijk herkenbare Nederlandse PLACEHOLDER-tekst (bijv. "Voorbeeld Evenement 2026"), puur om
    meteen een visueel voorbeeld te tonen — dit wordt niet opgeslagen, dus het hoeft geen echte feiten
    te bevatten>
}`;
}

async function callOpenAi({ systemPrompt, userPrompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is niet gezet — kan geen sjabloon-voorstel genereren. Zie besluiten.md, Bouwstap 6.'
    );
  }
  const model = process.env.OPENAI_MODEL || 'gpt-5.5';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.6
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI-aanroep faalde (status ${res.status}): ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI gaf geen bruikbaar antwoord terug (leeg).');
  }
  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`OpenAI-antwoord was geen geldige JSON: ${err.message}`);
  }
}

async function generateBlueprintProposal({ klant, naam, paginatype, wens }) {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = `Klant: ${klant}
Naam van dit sjabloon: ${naam}
Paginatype / referentie: ${paginatype || '(niet opgegeven)'}
Structuurwensen: ${wens || '(niet opgegeven)'}`;

  const result = await callOpenAi({ systemPrompt, userPrompt });
  if (!result || typeof result !== 'object' || !result.blueprint) {
    throw new Error('OpenAI-antwoord miste het verwachte veld "blueprint".');
  }
  return {
    blueprint: result.blueprint,
    voorbeeldBlocks: Array.isArray(result.voorbeeldBlocks) ? result.voorbeeldBlocks : []
  };
}

module.exports = { generateBlueprintProposal };
