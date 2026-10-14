// De Pagr. omgeving is een tabblad in de admin: wie admin is, mag ook de LP routes gebruiken (14-10-2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const { requireLpInternal } = require('../src/middleware/auth');

function draai(session) {
  let status = null; let doorgelaten = false;
  const res = { status(c) { status = c; return this; }, json() { return this; } };
  requireLpInternal({ session }, res, () => { doorgelaten = true; });
  return { status, doorgelaten };
}

test('admin mag de LP routes gebruiken, zonder apart LP wachtwoord', () => {
  assert.equal(draai({ isAdmin: true }).doorgelaten, true);
});

test('het oude aparte LP wachtwoord bestaat niet meer', () => {
  assert.equal(draai({ isLpInternal: true }).doorgelaten, false);
});

test('zonder login of met alleen een klantlogin geen toegang', () => {
  assert.deepEqual(draai({}), { status: 401, doorgelaten: false });
  assert.deepEqual(draai({ isLoggedIn: true }), { status: 401, doorgelaten: false });
  assert.deepEqual(draai(undefined), { status: 401, doorgelaten: false });
});
