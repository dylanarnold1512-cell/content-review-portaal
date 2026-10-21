const test = require('node:test');
const assert = require('node:assert/strict');
const { listSiteBlogs } = require('../src/lp/wordpress');

function profiel(extra) {
  return { id: 'x', wordpress: { urlEnv: 'T_WP_URL', usernameEnv: 'T_WP_USER', appPasswordEnv: 'T_WP_PASS', ...extra } };
}

test('listSiteBlogs filtert op blogCategorie en geeft niets terug als de categorie ontbreekt', async () => {
  process.env.T_WP_URL = 'https://example.test';
  process.env.T_WP_USER = 'u';
  process.env.T_WP_PASS = 'p';
  const origFetch = global.fetch;
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes('/categories')) {
      return { ok: true, json: async () => (String(url).includes('slug=kennisbank') ? [{ id: 42 }] : []) };
    }
    return { ok: true, json: async () => [{ id: 1, link: 'https://example.test/blog/', title: { rendered: 'Blog' }, excerpt: { rendered: '<p>Tekst</p>' } }] };
  };
  try {
    const met = await listSiteBlogs({ profile: profiel({ blogCategorie: 'kennisbank' }) });
    assert.equal(met.length, 1);
    assert.ok(urls.some((u) => u.includes('/posts?') && u.includes('categories=42')));
    const zonder = await listSiteBlogs({ profile: profiel({ blogCategorie: 'bestaat-niet' }) });
    assert.deepEqual(zonder, []);
    const alles = await listSiteBlogs({ profile: profiel({}) });
    assert.equal(alles.length, 1);
    assert.ok(!urls[urls.length - 1].includes('categories='));
  } finally {
    global.fetch = origFetch;
  }
});
