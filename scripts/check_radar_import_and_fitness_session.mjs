import assert from 'node:assert/strict';
import { build } from '../player-web/node_modules/esbuild/lib/main.js';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../player-web/src/', import.meta.url));
const storage = new Map();
globalThis.sessionStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
globalThis.window = { sessionStorage };
const reactMock = {
  name: 'hook-runtime',
  setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const {useState,useRef,useMemo,useEffect}=globalThis.hooks;' }));
  }
};
async function load(source, plugins = []) {
  const result = await build({ stdin: { contents: source, resolveDir: root, loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', plugins });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

// Run the real controller with dependency-aware effects, including automatic version saves.
let slots = [], index = 0, effects = [], dirty = false;
const changed = (prev, next) => !prev || !next || prev.length !== next.length || prev.some((v, i) => !Object.is(v, next[i]));
globalThis.hooks = {
  useState(initial) {
    const i = index++;
    if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
    return [slots[i], value => {
      const next = typeof value === 'function' ? value(slots[i]) : value;
      if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; }
    }];
  },
  useRef(initial) { const i = index++; return slots[i] ?? (slots[i] = { current: initial }); },
  useMemo(fn, deps) {
    const i = index++;
    if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, value: fn() };
    return slots[i].value;
  },
  useEffect(fn, deps) {
    const i = index++;
    if (!slots[i] || changed(slots[i].deps, deps)) { slots[i] = { deps }; effects.push(fn); }
  }
};
const { useRadarEditorController } = await load('export {useRadarEditorController} from "./hooks/useRadarEditorController";', [reactMock]);
const cache = new Map();
const options = {
  readStorage: (k, fallback) => cache.has(k) ? structuredClone(cache.get(k)) : fallback,
  writeStorage: (k, v) => cache.set(k, structuredClone(v)),
  writeStorageWithResult: (k, v) => { cache.set(k, structuredClone(v)); return { ok: true }; },
  toCsv: () => '', isHydrated: true, resolveSelectedPlayerName: () => ''
};
function render() {
  let controller;
  for (let pass = 0; pass < 15; pass++) {
    index = 0; effects = []; dirty = false;
    controller = useRadarEditorController(options);
    effects.forEach(effect => effect());
    if (!dirty) return controller;
  }
  throw new Error('controller did not settle');
}
let editor = render();
editor.setTitle('Saved player A'); editor = render();
editor.setSaveName('A version'); editor = render();
editor.handleSavePreset(); editor = render();
const savedId = editor.selectedPresetId;
const saved = structuredClone(editor.presets.find(p => p.id === savedId));
editor.importSnapshotAsDraft({ ...editor.getSnapshot(), title: 'Imported player B', rows: [{ metric: 'New', value: 90, group: 'Test', order: 1 }] });
editor = render();
assert.equal(editor.selectedPresetId, 'draft');
assert.equal(editor.title, 'Imported player B');
assert.equal(editor.rows[0].metric, 'New');
assert.deepEqual(editor.presets.find(p => p.id === savedId), saved);
editor.handleSwitchPreset(savedId); editor = render();
assert.equal(editor.title, saved.payload.title);
assert.deepEqual(editor.rows, saved.payload.rows);
const beforeCsv = structuredClone(editor.presets);
await editor.onCsvFileChange({ target: { files: [{ text: async () => 'metric,value,group,order\nCSV metric,72,Test,1' }], value: 'file.csv' } });
editor = render();
assert.equal(editor.selectedPresetId, 'draft');
assert.equal(editor.rows[0].metric, 'CSV metric');
assert.deepEqual(editor.presets, beforeCsv);
editor.handleSwitchPreset(savedId); editor = render();
await editor.onCsvFileChange({ target: { files: [{ text: async () => 'bad header\ninvalid' }], value: 'bad.csv' } });
editor = render();
assert.equal(editor.selectedPresetId, savedId);
assert.deepEqual(editor.presets.find(p => p.id === savedId).payload, saved.payload);
// Existing explicit editing of a saved version continues to auto-save as before.
editor.setSubtitle('Manual edit'); editor = render();
assert.equal(editor.presets.find(p => p.id === savedId).payload.subtitle, 'Manual edit');
console.log('PASS: player snapshot and CSV imports detach to draft; saved versions survive, invalid imports preserve selection, existing manual version editing remains unchanged.');

const session = await load('export * from "./pages/fitness-analysis/fitnessHistorySession"; export {setStorageScope} from "./utils/storageScope";');
session.setStorageScope('player');
const settings = { selected: '["Team","Player"]', search: 'zeca', competition: '中超', start: '2026-07-01', end: '2026-08-31', fields: ['总距离 (米)', '冲刺次数'] };
session.saveFitnessHistorySettings(settings);
assert.deepEqual(session.readFitnessHistorySettings(), settings);
session.setStorageScope('guest');
assert.equal(session.readFitnessHistorySettings().selected, '');
session.setStorageScope('player');
assert.deepEqual(session.readFitnessHistorySettings(), settings);
session.saveFitnessHistorySettings({ ...settings, fields: [] });
assert.deepEqual(session.readFitnessHistorySettings().fields, []);
storage.set('player_web_fitness_history_settings_session_v1::player', JSON.stringify({ selected: 3, fields: [null, 'x', 'x'], start: '2026-02-30', end: '2026-99-01' }));
assert.deepEqual(session.readFitnessHistorySettings(), { selected: '', search: '', competition: '', fields: ['x'], start: '', end: '' });
storage.set('player_web_fitness_history_settings_session_v1::player', '{broken');
assert.equal(session.readFitnessHistorySettings().fields, null);
globalThis.sessionStorage.setItem = () => { throw new Error('blocked storage'); };
assert.doesNotThrow(() => session.saveFitnessHistorySettings(settings));
console.log('PASS: fitness settings restore per account/tab; custom and empty indicator selections survive; invalid dates/corrupt storage safely fall back.');
