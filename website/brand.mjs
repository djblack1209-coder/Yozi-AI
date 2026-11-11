// Website brand slots: one map from each published path to its source file.
// Pudding derivatives originate in brand/logo-2026-11-10.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const project = join(dirname(fileURLToPath(import.meta.url)), "..");

export const BRAND_FILES = Object.freeze({
  "favicon.svg": "website/brand/favicon.svg",
  "favicon.ico": "public/website/favicon.ico",
  "brand/mark.png": "src/static/images/logo.png",
  "brand/email-logo.gif": "brand/logo-2026-11-10/yozi-email-logo.gif",
  "brand/email-logo.png": "brand/logo-2026-11-10/yozi-email-logo.png",
  // Compatibility URLs serve the same transparent portrait.
  "brand/mark.svg": "src/assets/brand/logo/current/mark.svg",
  "brand/mark-reverse.svg": "src/assets/brand/logo/current/mark-reverse.svg",
  "brand/icon-16.png": "public/website/icon-16.png",
  "brand/icon-32.png": "public/website/icon-32.png",
  "brand/icon-48.png": "public/website/icon-48.png",
  "brand/apple-touch-icon.png": "website/brand/apple-touch-icon.png",
  "brand/icon-192.png": "website/brand/icon-192.png",
  "brand/icon-512.png": "website/brand/icon-512.png",
  "brand/icon-512-maskable.png": "website/brand/icon-512-maskable.png",
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
