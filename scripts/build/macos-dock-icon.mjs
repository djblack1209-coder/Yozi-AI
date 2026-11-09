import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../brand/logo-2026-11-10/yozi-logo-blue-bg.png', import.meta.url));
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

const scratch = mkdtempSync(join(tmpdir(), 'yozi-dock-'));
try {
  const rendered = new Map();
  for (const size of new Set(Object.values(slots))) {
    const file = join(scratch, `${size}.png`);
    if (size === 1024) rendered.set(size, readFileSync(source));
    else {
      execFileSync('sips', ['-z', String(size), String(size), source, '--out', file]);
      rendered.set(size, readFileSync(file));
    }
  }
  const icons = Object.entries(slots).map(([type, size]) => chunk(type, rendered.get(size)));
  writeFileSync(output, chunk('icns', Buffer.concat(icons)));
} finally {
  rmSync(scratch, { recursive: true });
}
