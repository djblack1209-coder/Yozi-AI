import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../src/assets/brand/logo/current/dock.svg', import.meta.url));
const output = new URL('../../src-tauri/icons/icon.icns', import.meta.url);
// PNG slots also cover the two small non-Retina icons that legacy channel encoding can damage.
const slots = {
  icp4: 16,
  ic11: 32,
  icp5: 32,
  ic12: 64,
  ic07: 128,
  ic13: 256,
  ic08: 256,
  ic14: 512,
  ic09: 512,
  ic10: 1024
};

function chunk(type, payload) {
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, 'ascii');
  header.writeUInt32BE(header.length + payload.length, 4);
  return Buffer.concat([header, payload]);
}

const rendered = new Map();
for (const size of new Set(Object.values(slots))) {
  const pixels = String(size);
  rendered.set(size, execFileSync('rsvg-convert', ['-w', pixels, '-h', pixels, source]));
}
const icons = Object.entries(slots).map(([type, size]) => chunk(type, rendered.get(size)));
writeFileSync(output, chunk('icns', Buffer.concat(icons)));
