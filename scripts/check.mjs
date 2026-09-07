import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {VEHICLES, VEHICLE_CATEGORIES} from '../outputs/source/vehicle-catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = ['preview.mjs', 'export-offline.mjs', 'scripts/check.mjs', ...fs.readdirSync(path.join(root, 'outputs/source')).filter(name => name.endsWith('.mjs')).map(name => 'outputs/source/' + name)];
for (const file of code) execFileSync(process.execPath, ['--check', path.join(root, file)], {stdio: 'inherit'});

const metadata = JSON.parse(fs.readFileSync(path.join(root, 'outputs/assets/models/metadata.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'outputs/index.html'), 'utf8');
const selectedModels = [...html.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(selectedModels, VEHICLES.map(vehicle => vehicle.id), 'Model selector differs from catalog.');
assert.equal(new Set(selectedModels).size, selectedModels.length, 'Duplicate model IDs.');
assert.equal(metadata.length, VEHICLES.filter(vehicle => vehicle.url).length);

for (const vehicle of VEHICLES) {
  assert.ok(VEHICLE_CATEGORIES[vehicle.category], `Unknown category: ${vehicle.id}`);
  if (!vehicle.url) continue;
  const data = fs.readFileSync(path.resolve(root, 'outputs', vehicle.url));
  const record = metadata.find(model => model.id === vehicle.id);
  assert.ok(record, `Missing metadata: ${vehicle.id}`);
  assert.equal(data.toString('ascii', 0, 4), 'glTF');
  assert.equal(data.readUInt32LE(4), 2);
  assert.equal(data.readUInt32LE(8), data.length);
  assert.equal(data.length, record.bytes);
  const jsonLength = data.readUInt32LE(12);
  assert.equal(data.readUInt32LE(16), 0x4e4f534a);
  const json = JSON.parse(data.toString('utf8', 20, 20 + jsonLength));
  const binaryLength = data.readUInt32LE(20 + jsonLength);
  assert.equal(data.readUInt32LE(24 + jsonLength), 0x004e4942);
  assert.equal(28 + jsonLength + binaryLength, data.length);
  assert.ok(json.buffers.every(buffer => !buffer.uri), `External geometry: ${vehicle.id}`);
  assert.ok((json.images || []).every(image => !image.uri && Number.isInteger(image.bufferView)), `External image: ${vehicle.id}`);
  for (const view of json.bufferViews) assert.ok((view.byteOffset || 0) + view.byteLength <= binaryLength, `Invalid buffer view: ${vehicle.id}`);
}

const draco = fs.readFileSync(path.join(root, 'outputs/assets/draco/draco_decoder.wasm'));
assert.equal(draco.subarray(0, 4).toString('hex'), '0061736d');
for (const name of ['draco_decoder.js', 'draco_wasm_wrapper.js']) assert.ok(fs.statSync(path.join(root, 'outputs/assets/draco', name)).size > 0);
for (const name of ['gravel_stones_diff_2k.jpg', 'gravel_stones_nor_gl_2k.jpg', 'gravel_stones_rough_2k.jpg']) {
  const data = fs.readFileSync(path.join(root, 'outputs/assets', name));
  assert.equal(data.subarray(0, 3).toString('hex'), 'ffd8ff');
}
console.log(`Verified JavaScript syntax, ${VEHICLES.length} catalog entries, ${metadata.length} local GLBs, decoder files, and terrain textures.`);
