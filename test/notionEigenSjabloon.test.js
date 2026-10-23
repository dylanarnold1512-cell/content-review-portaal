// De vierde sectie "Eigen sjabloon" (pagina's gebouwd met chat) mag de drie vaste secties nooit raken, en een gewone
// pagina blijft drie blokken houden. Getest met een nep Notion client in het geheugen.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const paginas = new Map();
// Notion geeft bij het lezen plain_text terug; bij het schrijven sturen we text.content.
function metPlainText(code) {
  if (!code || !Array.isArray(code.rich_text)) return code;
  return { ...code, rich_text: code.rich_text.map((r) => ({ ...r, plain_text: r.text ? r.text.content : '' })) };
}
let teller = 0;
class NepClient {
  constructor() {
    this.pages = {
      create: async ({ properties }) => { const id = `p${++teller}`; paginas.set(id, { properties, blokken: [] }); return { id }; },
      retrieve: async ({ page_id }) => ({ id: page_id, properties: {}, last_edited_time: '', created_time: '' })
    };
    this.blocks = {
      delete: async ({ block_id }) => { for (const p of paginas.values()) p.blokken = p.blokken.filter((b) => b.id !== block_id); },
      update: async ({ block_id, code }) => { for (const p of paginas.values()) { const b = p.blokken.find((x) => x.id === block_id); if (b) b.code = metPlainText(code); } },
      children: {
        list: async ({ block_id }) => ({ results: paginas.get(block_id).blokken, has_more: false }),
        append: async ({ block_id, children }) => { const p = paginas.get(block_id); children.forEach((c) => p.blokken.push({ id: `b${++teller}`, ...c, ...(c.code ? { code: metPlainText(c.code) } : {}) })); }
      }
    };
  }
}
const clientPad = require.resolve('@notionhq/client');
require.cache[clientPad] = { id: clientPad, filename: clientPad, loaded: true, exports: { Client: NepClient } };
process.env.NOTION_TOKEN_ADMIN = 'test';
const lpNotion = require(path.join('..', 'src', 'lp', 'notion'));

test('gewone pagina houdt drie blokken, sjabloon is null', async () => {
  const page = await lpNotion.createPage({ klant: 'macbouw', blueprint: 'locatie', titel: 'Test', invoer: { a: 1 } });
  assert.equal(paginas.get(page.id).blokken.filter((b) => b.type === 'code').length, 3);
  assert.equal(page.sjabloon, null);
  const na = await lpNotion.updateSection(page.id, 'content', { slotData: { heroTitle: 'x' } });
  assert.equal(na.content.slotData.heroTitle, 'x');
  assert.deepEqual(na.invoer, { a: 1 });
  assert.equal(paginas.get(page.id).blokken.filter((b) => b.type === 'code').length, 3);
});

test('chatpagina: vier blokken, content bijwerken laat het sjabloon staan', async () => {
  const page = await lpNotion.createPage({ klant: 'macbouw', blueprint: 'chat', titel: 'Chat', invoer: {}, content: { slotData: { heroTitle: 'a' } }, sjabloon: { blueprint: { templateFormat: 'slots' }, berichten: [{ rol: 'dylan', tekst: 'hoi' }] } });
  assert.equal(page.sjabloon.berichten[0].tekst, 'hoi');
  const na = await lpNotion.updateSection(page.id, 'content', { slotData: { heroTitle: 'b' } });
  assert.equal(na.content.slotData.heroTitle, 'b');
  assert.equal(na.sjabloon.berichten[0].tekst, 'hoi');
  const na2 = await lpNotion.updateSection(page.id, 'sjabloon', { blueprint: { templateFormat: 'slots' }, berichten: [] });
  assert.deepEqual(na2.sjabloon.berichten, []);
  assert.equal(na2.content.slotData.heroTitle, 'b');
});

test('sjabloon toevoegen aan een bestaande pagina met drie blokken', async () => {
  const page = await lpNotion.createPage({ klant: 'macbouw', blueprint: 'chat', titel: 'Oud', invoer: { x: 1 } });
  const na = await lpNotion.updateSection(page.id, 'sjabloon', { blueprint: { templateFormat: 'slots' }, berichten: [] });
  assert.equal(paginas.get(page.id).blokken.filter((b) => b.type === 'code').length, 4);
  assert.deepEqual(na.invoer, { x: 1 });
  assert.ok(na.sjabloon);
});
