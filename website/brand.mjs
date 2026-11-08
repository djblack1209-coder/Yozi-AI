// Website brand slots: one map from each published path to its source file.
// The logo source is src/assets/brand/logo/current (Study Index, see its manifest.json);
// the PNG icons and the share image are rendered from it into website/brand and website/media.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const project = join(dirname(fileURLToPath(import.meta.url)), "..");

export const BRAND_FILES = Object.freeze({
  // Official path with a dark-scheme fill, so dark browser tab strips show the white reverse.
  "favicon.svg": "website/brand/favicon.svg",
  "brand/mark.svg": "src/assets/brand/logo/current/mark.svg",
  "brand/mark-reverse.svg": "src/assets/brand/logo/current/mark-reverse.svg",
  "brand/apple-touch-icon.png": "website/brand/apple-touch-icon.png",
  "brand/icon-192.png": "website/brand/icon-192.png",
  "brand/icon-512.png": "website/brand/icon-512.png",
  // Legacy URL kept for existing consumers; it serves the current mark.
  "brand/kitten.png": "website/brand/icon-512.png",
  "media/yozi-hero-share.jpg": "website/media/yozi-hero-share.jpg",
});

export const brandSource = (published) => join(project, BRAND_FILES[published]);

// Content-versioned URL, so the long asset cache picks up a changed mark at once.
export function brandUrl(published, base = "") {
  const version = createHash("sha256").update(readFileSync(brandSource(published))).digest("hex").slice(0, 8);
  return `${base}/${published}?v=${version}`;
}
