// Register van LP Fabriek klanten. Analoog aan blocks/index.js: hier een
// klant bijzetten (profiel + feiten + blueprints) om 'm beschikbaar te maken,
// verder niks elders aanpassen. JMB komt hier bij in bouwstap 5.

const roots = {
  profile: require('./roots/profile'),
  feiten: require('./roots/feiten').feiten,
  blueprints: {
    'roots-event': require('./roots/blueprints/event')
  }
};

const clients = { roots };

function getLpClient(clientId) {
  const client = clients[clientId];
  if (!client) throw new Error(`Onbekende LP Fabriek klant: ${clientId}`);
  return client;
}

function getBlueprint(clientId, blueprintId) {
  const client = getLpClient(clientId);
  const blueprint = client.blueprints[blueprintId];
  if (!blueprint) throw new Error(`Onbekende blueprint "${blueprintId}" voor klant "${clientId}"`);
  return blueprint;
}

module.exports = { clients, getLpClient, getBlueprint };
