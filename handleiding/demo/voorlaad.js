// Start het portaal met een verzonnen demoklant en een nepbron voor n8n, zodat de handleiding
// schermen kan tonen met mooie cijfers. Raakt nooit echte klantgegevens. Gebruik: zie maak-schermen.js
const http = require('http');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const d = require('./demo-data');

process.env.N8N_API_KEY = 'demo';
process.env.PORTAL_PASSWORD_DEMO = 'demo';
process.env.SESSION_SECRET = 'demo-sessie';
delete process.env.NOTION_TOKEN_ADMIN;

const TABELLEN = {
  caOsvqDNlG79IjTA: [d.overzichtRij()],
  HfpN6rbJMStyOvyj: d.blogRijen(),
  oAD7tfxMzT8hWsao: d.wekenRijen(),
  ZO8PIIwot7d0ODgX: d.conversieRijen(),
  XPI7gsMhDIEoBc8o: d.conversieTotalen(),
  PO71b1z9NwtgTFoO: d.aiRijen(),
  uLdHsmHxDy1A0HU2: d.rapportRijen()
};

const nep = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const m = /\/data-tables\/([^/]+)\/rows/.exec(u.pathname);
  let rijen = m ? (TABELLEN[m[1]] || []) : [];
  try {
    const f = JSON.parse(u.searchParams.get('filter') || '{}');
    for (const fl of f.filters || []) if (fl.condition === 'eq') rijen = rijen.filter((r) => r[fl.columnName] === fl.value);
  } catch (e) { /* geen filter */ }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ data: rijen, nextCursor: null }));
});
nep.listen(5999);
process.env.N8N_BASE_URL = 'http://127.0.0.1:5999';

const cfg = require(path.join(root, 'src/config/clients.js'));
cfg.clients.push({
  id: d.SLUG, naam: d.NAAM, producten: 'Blogr.', notionTokenEnv: 'NOTION_TOKEN_DEMO', performanceV2: true, databaseId: 'demo',
  reviewEnabled: true, performanceEnabled: true, ideaEnrichmentEnabled: false, merkprofiel: true, aiZichtbaarheid: true, loginPasswordEnv: 'PORTAL_PASSWORD_DEMO',
  fields: { title: 'Titel', status: 'Status', category: 'Cluster', publishDate: 'Publicatiedatum', customerNotes: 'Opmerkingen', wordpressPostId: 'WP post ID', liveUrl: 'Live URL', mainKeyword: 'Hoofdkeyword', secondaryKeywords: 'Secundaire keywords', searchIntent: 'Zoekintentie', cluster: 'Cluster', seoTitle: 'SEO Meta Title', seoDescription: 'SEO Meta Description', slug: 'Slug' },
  statusValues: { review: 'Ter review', approved: 'Goedgekeurd', rejected: 'Afgewezen', published: 'Gepubliceerd', idea: 'Idee', planned: 'Gepland', generating: 'In generatie' }
});

const notion = require(path.join(root, 'src/services/notion.js'));
const alle = () => d.items();
notion.listItems = async (id, status) => alle().filter((i) => !status || i.status === status);
notion.listAllPages = async () => alle();
notion.getItemDetail = async (id, pageId) => {
  const i = alle().find((x) => x.id === pageId) || alle()[0];
  const t = d.BLOG_TEKST[i.id] || d.BLOG_TEKST['review-1'];
  const html = `<p>${t[0]}</p><h3>${t[1]}</h3><p>${t[2]}</p><h3>${t[3]}</h3><p>${t[4]}</p><h3>${t[5]}</h3><p>${t[6]}</p>`;
  return { ...i, contentHtml: html };
};
notion.getPerformanceLog = async () => [];
