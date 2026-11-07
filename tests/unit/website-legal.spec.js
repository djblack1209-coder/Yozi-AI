import { describe, expect, it } from 'vitest';
import { LEGAL_DOCS, LEGAL_LANGUAGES, legalBlocks, legalPath, renderLegal } from '../../website/legal.mjs';
import { renderHome } from '../../website/render.mjs';

const bold = (text) => (text.match(/\*\*/g) || []).length / 2;
const shape = (blocks) =>
  blocks.map((block) => {
    if (block.type === 'h2') return `h2#${block.id}`;
    if (block.type === 'table') return `table ${block.rows.length}x${block.rows[0].length}`;
    if (block.type === 'p') return `p b${bold(block.text)}`;
    return `list ${block.items.map((item) => `${item.depth}${item.ordered ? 'o' + item.start : 'u'}b${bold(item.text)}`).join(' ')}`;
  });

describe('website legal pages', () => {
  it.each(LEGAL_DOCS)('%s matches clause for clause, including bold clauses, in both languages', (doc) => {
    expect(shape(legalBlocks('en', doc))).toEqual(shape(legalBlocks('zh', doc)));
  });

  it.each(LEGAL_DOCS)('%s publishes no placeholder and no unverified address', (doc) => {
    for (const lang of LEGAL_LANGUAGES) {
      const html = renderLegal(lang, doc, '');
      expect(html).not.toMatch(/【|待填|TODO/);
      expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
      expect(html).toContain(`<link rel="canonical" href="https://yozi.bot.cd${legalPath(lang, doc)}">`);
    }
  });

  it('links both documents from the homepage footer in both languages', () => {
    for (const html of [renderHome('zh'), renderHome('en'), renderHome('zh', true)])
      for (const lang of LEGAL_LANGUAGES)
        for (const doc of LEGAL_DOCS) expect(html).toContain(`href="${legalPath(lang, doc)}" data-copy="${lang}"`);
  });
});
