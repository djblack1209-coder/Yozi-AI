import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../brand/logo-2026-11-10/yozi-logo-blue-bg.png', import.meta.url));
const output = new URL('../../src-tauri/icons/icon.icns', import.meta.url);
// PNG slots also cover the two small non-Retina icons that legacy channel encoding can damage.
const slots = {
  icp4: [16, 1],
  ic11: [32, 2],
  icp5: [32, 1],
  ic12: [64, 2],
  ic07: [128, 1],
  ic13: [256, 2],
  ic08: [256, 1],
  ic14: [512, 2],
  ic09: [512, 1],
  ic10: [1024, 2]
};

function chunk(type, payload) {
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, 'ascii');
  header.writeUInt32BE(header.length + payload.length, 4);
  return Buffer.concat([header, payload]);
}

const scratch = mkdtempSync(join(tmpdir(), 'yozi-dock-'));
try {
  const icons = Object.entries(slots).map(([type, [size, scale]]) => {
    const file = join(scratch, `${type}.png`);
    const pixels = String(size);
    const dpi = String(72 * scale);
    // AppKit reads each PNG's density to recover the intended point size.
    execFileSync('sips', ['-z', pixels, pixels, '-s', 'dpiWidth', dpi, '-s', 'dpiHeight', dpi, source, '--out', file]);
    return chunk(type, readFileSync(file));
  });
  writeFileSync(output, chunk('icns', Buffer.concat(icons)));
} finally {
  rmSync(scratch, { recursive: true });
}
