import assert from 'node:assert/strict';
import { build } from '../player-web/node_modules/esbuild/lib/main.js';
const result = await build({ entryPoints: ['player-web/src/pages/scout-search/scoutPlayerSearch.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { buildScoutNameAliases, filterScoutPlayers } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const aliases = buildScoutNameAliases([{ en: 'Zeca', zh: '泽卡' }, { en: 'Óscar Melendo', zh: '梅伦多' }]);
const players = [
  { id: 'one', player: '泽卡', selectedRank: 3, score: 82.5 },
  { id: 'two', player: 'Óscar_Melendo', selectedRank: 27, score: 69.4 },
  { id: 'three', player: 'Zeca', selectedRank: 41, score: 64 }
];
const original = structuredClone(players);
const matches = filterScoutPlayers(players, ' zEcA ', aliases);
assert.deepEqual(matches.map(p => p.id), ['one', 'three']);
assert.equal(matches[0], players[0]);
assert.equal(matches[1].selectedRank, 41);
assert.equal(matches[1].score, 64);
assert.deepEqual(filterScoutPlayers(players, '泽卡', aliases).map(p => p.id), ['one', 'three']);
assert.equal(filterScoutPlayers(players, '梅伦多', aliases)[0].id, 'two');
assert.equal(filterScoutPlayers(players, 'oscar melendo', aliases)[0].id, 'two');
assert.equal(filterScoutPlayers(players, 'melendo', aliases)[0].id, 'two');
assert.deepEqual(filterScoutPlayers(players, 'not_a_player', aliases), []);
assert.equal(filterScoutPlayers(players, '  ', aliases), players);
assert.deepEqual(players, original);
// A hidden/excluded player outside the passed visible list must not be reintroduced.
assert.deepEqual(filterScoutPlayers([players[1]], 'zeca', aliases), []);
assert.deepEqual(filterScoutPlayers(players, '梅伦多', new Map()), []);
console.log('PASS: bilingual aliases, accents, case, whitespace, partial names, unchanged rank/score/order, empty results, clear search and visibility boundaries.');
