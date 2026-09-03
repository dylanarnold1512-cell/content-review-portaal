// Register van LP Fabriek klanten. Analoog aan blocks/index.js: hier een
// klant bijzetten (profiel + feiten) om 'm beschikbaar te maken, verder niks
// elders aanpassen. JMB komt hier bij in bouwstap 5.
//
// Blueprints staan HIER NIET MEER (voorheen src/lp/clients/*/blueprints/*.js)
// — die zijn verhuisd naar de Notion-database "Sjablonen" (src/lp/templates.js),
// zodat ze via het portaal zelf ontworpen/aangepast kunnen worden zonder
// deploy. Zie besluiten.md, "Verduidelijking: tweestappenproces per klant".

const roots = {
  profile: require('./roots/profile'),
  feiten: require('./roots/feiten').feiten
};

const clients = { roots };

function getLpClient(clientId) {
  const client = clients[clientId];
  if (!client) throw new Error(`Onbekende LP Fabriek klant: ${clientId}`);
  return client;
}

module.exports = { clients, getLpClient };
