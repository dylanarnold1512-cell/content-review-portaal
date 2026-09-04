#!/usr/bin/env node
// Installeert de meegeleverde git-hooks (scripts/git-hooks/*) in .git/hooks/. Draait automatisch
// via de "prepare"-npm-script (dus bij elke "npm install"), zodat de pre-push-tests (zie
// besluiten.md, "Geautomatiseerde tests", 04-09-2026) altijd actief zijn zonder dat iemand dit
// handmatig hoeft te onthouden of uit te voeren. Faalt bewust NOOIT hard: op een omgeving zonder
// .git-map (bv. Render bij het deployen) is er simpelweg niks te installeren, en dat mag de rest
// van "npm install" niet blokkeren.
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const gitDir = path.join(projectRoot, '.git');
const hooksDir = path.join(gitDir, 'hooks');
const sourceDir = path.join(__dirname, 'git-hooks');

if (!fs.existsSync(gitDir)) {
  process.exit(0);
}

try {
  fs.mkdirSync(hooksDir, { recursive: true });
  for (const hookName of fs.readdirSync(sourceDir)) {
    const src = path.join(sourceDir, hookName);
    const dest = path.join(hooksDir, hookName);
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o755);
    console.log(`Git-hook geïnstalleerd: ${hookName}`);
  }
} catch (err) {
  // Nooit "npm install" laten falen op iets wat puur een gemaksfunctie is.
  console.warn(`Git-hooks installeren is niet gelukt (${err.message}) - niet blokkerend.`);
}
