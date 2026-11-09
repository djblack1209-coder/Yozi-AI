import { readFileSync } from "node:fs";
import { brandUrl } from "./brand.mjs";

// Legal texts live in website/legal/<doc>.<lang>.md. Both languages keep the same
// section ids and clause structure; tests/unit/website-legal.spec.js enforces it.
const source = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
export const LEGAL_VERSION = { version: "1.2", updated: "2026-11-08", effective: "2026-11-08" };
export const LEGAL_DOCS = ["privacy", "terms"];
export const LEGAL_LANGUAGES = ["zh", "en"];
const copy = {
  zh: {
    privacy: ["隐私政策", "Yozi AI 如何处理你的个人信息、学习记录与 API 密钥。"],
    terms: ["用户协议", "使用 Yozi AI 桌面 App、手机 App 和官网的协议。"],
    tabs: { privacy: "隐私政策", terms: "用户协议" },
    footer: { privacy: "隐私政策", terms: "用户协议" },
    meta: (v) => `版本 ${v.version} · ${date(v.updated)} 更新 · ${date(v.effective)} 生效`,
    home: "Yozi 首页",
    docs: "法律文件",
    toc: "目录",
    contact: "联系我们",
    skip: "跳至正文",
    language: ["en", "EN", "Switch to English"],
  },
  en: {
    privacy: ["Privacy Policy", "How Yozi AI handles your personal information, study records and API keys."],
    terms: ["Terms of Use", "The agreement for using the Yozi AI desktop app, mobile app and website."],
    tabs: { privacy: "privacy", terms: "terms" },
    footer: { privacy: "privacy policy", terms: "terms of use" },
    meta: (v) => `Version ${v.version} · updated ${date(v.updated)} · effective ${date(v.effective)}`,
    home: "Yozi home",
    docs: "legal documents",
    toc: "Contents",
    contact: "Contact us",
    skip: "skip to text",
    language: ["zh", "中", "切换到中文"],
  },
};
const date = (iso) => `<time datetime="${iso}">${iso}</time>`;
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inline = (text) =>
  escape(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');

// A deliberately small Markdown subset: "## title {#id}" sections, paragraphs,
// ordered/unordered lists nested by indentation, and pipe tables.
export function parseLegal(markdown) {
  const blocks = [];
  let paragraph = [];
  let list = null;
  let table = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "p", text: paragraph.join("") });
    if (list) blocks.push({ type: "list", items: list });
    if (table) blocks.push({ type: "table", rows: table });
    paragraph = [];
    list = null;
    table = null;
  };
  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();
    const heading = /^## (.+?) \{#([a-z-]+)\}$/.exec(line);
    const item = /^(\s*)(-|\d+\.) (.+)$/.exec(line);
    if (!line.trim()) flush();
    else if (heading) {
      flush();
      blocks.push({ type: "h2", text: heading[1], id: heading[2] });
    } else if (line.trim().startsWith("|")) {
      if (paragraph.length || list) flush();
      const cells = line.trim().slice(1, -1).split("|").map((cell) => cell.trim());
      if (!cells.every((cell) => /^-+$/.test(cell))) (table ||= []).push(cells);
    } else if (item) {
      if (paragraph.length || table) flush();
      (list ||= []).push({ depth: item[1].length, ordered: item[2] !== "-", start: parseInt(item[2], 10), text: item[3] });
    } else {
      if (list || table) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

function renderList(items) {
  let index = 0;
  const level = () => {
    const { depth, ordered, start } = items[index];
    const tag = ordered ? "ol" : "ul";
    let html = `<${tag}${ordered && start > 1 ? ` start="${start}"` : ""}>`;
    while (index < items.length && items[index].depth === depth) {
      html += `<li>${inline(items[index++].text)}`;
      if (index < items.length && items[index].depth > depth) html += level();
      html += "</li>";
    }
    return html + `</${tag}>`;
  };
  let html = "";
  while (index < items.length) html += level();
  return html;
}

function renderBlock(block) {
  if (block.type === "p") return `<p>${inline(block.text)}</p>`;
  if (block.type === "list") return renderList(block.items);
  const [head, ...rows] = block.rows;
  return `<div class="legal-table"><table><thead><tr>${head.map((cell) => `<th scope="col">${inline(cell)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell, i) => (i ? `<td>${inline(cell)}</td>` : `<th scope="row">${inline(cell)}</th>`)).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

function renderBlocks(blocks) {
  let html = "";
  let intro = false;
  let section = false;
  for (const block of blocks) {
    if (block.type === "h2") {
      if (intro) html += "</div>";
      if (section) html += "</section>";
      html += `<section id="${block.id}" aria-labelledby="${block.id}-title"><h2 id="${block.id}-title">${inline(block.text)}</h2>`;
      intro = false;
      section = true;
      continue;
    }
    if (!section && !intro) {
      html += '<div class="legal-intro">';
      intro = true;
    }
    html += renderBlock(block);
  }
  return html + (intro ? "</div>" : "") + (section ? "</section>" : "");
}

export const legalPath = (lang, doc) => `/${lang}/${doc}/`;
// Homepage footer: both languages are rendered and site.css hides the inactive one.
export const legalFooterLinks = () =>
  LEGAL_DOCS.map((doc) =>
    LEGAL_LANGUAGES.map(
      (lang) => `<a href="${legalPath(lang, doc)}" data-copy="${lang}" lang="${lang === "zh" ? "zh-CN" : "en"}">${copy[lang].footer[doc]}</a>`,
    ).join(""),
  ).join("");
export const legalStyles = () => (source("site.css") + "\n" + source("legal.css")).replaceAll("FONT_BASE", "/fonts");
export const legalBlocks = (lang, doc) => parseLegal(source(`legal/${doc}.${lang}.md`));

export function renderLegal(lang, doc, styles) {
  const t = copy[lang];
  const other = lang === "zh" ? "en" : "zh";
  const [title, description] = t[doc];
  const blocks = legalBlocks(lang, doc);
  const canonical = `https://yozi.bot.cd${legalPath(lang, doc)}`;
  const links = (labels) =>
    LEGAL_DOCS.map((d) => `<a href="${legalPath(lang, d)}"${d === doc ? ' aria-current="page"' : ""}>${labels[d]}</a>`).join("");
  const toc = blocks
    .filter((b) => b.type === "h2")
    .map((b) => `<li><a href="#${b.id}">${inline(b.text)}</a></li>`)
    .join("");
  const [targetLang, targetText, targetLabel] = t.language;
  return `<!doctype html><html lang="${lang === "zh" ? "zh-CN" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#d5effd"><title>${title} · Yozi</title><meta name="description" content="${description}"><link rel="canonical" href="${canonical}"><link rel="alternate" hreflang="zh-CN" href="https://yozi.bot.cd${legalPath("zh", doc)}"><link rel="alternate" hreflang="en" href="https://yozi.bot.cd${legalPath("en", doc)}"><link rel="icon" type="image/svg+xml" href="${brandUrl("favicon.svg")}"><link rel="apple-touch-icon" sizes="180x180" href="${brandUrl("brand/apple-touch-icon.png")}"><style>${styles}</style></head><body class="legal-page"><a class="skip" href="#legal-text">${t.skip}</a><header class="legal-bar"><a class="legal-brand" href="/${lang}/" aria-label="${t.home}"><img src="${brandUrl("brand/mark.png")}" width="36" height="36" alt=""><span>Yozi AI</span></a><nav class="legal-tabs" aria-label="${t.docs}">${links(t.tabs)}</nav><a class="legal-language" href="${legalPath(other, doc)}" hreflang="${targetLang}" lang="${targetLang === "zh" ? "zh-CN" : "en"}" aria-label="${targetLabel}" data-language-link="${targetLang}"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 8 4 5c2 2 4 3 6 4M4 6h11M9 3v3m4 0c-1 5-4 9-9 12m10 3 4-10 4 10m-6-4h4"/></svg><span>${targetText}</span></a></header><main class="legal" id="legal-text" data-legal-doc="${doc}" data-legal-version="${LEGAL_VERSION.version}"><h1>${title}</h1><div class="legal-meta"><p>${t.meta(LEGAL_VERSION)}</p><a href="#contact">${t.contact}</a></div><nav aria-label="${t.toc}"><details class="legal-toc" open><summary>${t.toc}</summary><ol>${toc}</ol></details></nav><script>if(matchMedia("(max-width: 560px)").matches)document.querySelector(".legal-toc").open=false;</script>${renderBlocks(blocks)}</main><footer class="legal-footer"><div class="footer-legal"><p>© 2026 Yozi</p>${links(t.footer)}<span>v2.3.0</span></div></footer><script>document.querySelector('[data-language-link]').addEventListener('click',e=>{try{localStorage.setItem('yozi.website.language',e.currentTarget.dataset.languageLink)}catch{}});</script></body></html>`;
}
