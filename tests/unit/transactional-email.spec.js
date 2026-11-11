// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderTransactionalEmail, EMAIL_REFERENCES } from '../../laf-backend/functions/_shared/transactional-email.js';

describe('transactional email layouts', () => {
  it('puts the verification code in the subject, preview, HTML and plain text', () => {
    const email = renderTransactionalEmail('verification', { code: '123456' });
    expect(email.subject).toContain('123456');
    expect(email.text.startsWith('123456')).toBe(true);
    expect(email.html).toContain('123456');
    expect(email.text).toContain('10 分钟内有效');
    expect(email.html).not.toContain('一战成硕');
  });
  it('renders the full set with own-hosted assets, readable text and no fabricated statistics', () => {
    for (const kind of Object.keys(EMAIL_REFERENCES)) {
      const email = renderTransactionalEmail(kind, {
        code: '123456',
        plan: 'Pro',
        amount: '¥39',
        date: '2026-12-01',
        period: '最近一周',
        stats: [
          { label: '作答', value: 6 },
          { label: '学习天数', value: 2 }
        ],
        summary: '已完成两次复习',
        effectiveDate: '2026-12-01',
        changes: ['更新资料说明']
      });
      expect(email.html).toContain('<html lang="zh-CN">');
      expect(email.html).toContain('yozi@245334.xyz');
      expect(email.html).toContain('src="cid:pudding-logo@yozi"');
      expect(email.attachments[0]).toMatchObject({
        cid: 'pudding-logo@yozi',
        contentType: 'image/gif',
        contentDisposition: 'inline'
      });
      expect(readFileSync(email.attachments[0].path)).toEqual(
        readFileSync(new URL('../../brand/logo-2026-11-10/yozi-email-logo.gif', import.meta.url))
      );
      expect(email.text.length).toBeGreaterThan(30);
      expect(
        [...email.html.matchAll(/(?:src|href)="(https:[^"]+)/g)].every(([, url]) =>
          url.startsWith('https://yozi.bot.cd/')
        )
      ).toBe(true);
    }
    const empty = renderTransactionalEmail('progress');
    expect(empty.html).not.toContain('218');
    expect(empty.html).not.toContain('143');
  });
  it('escapes dynamic content without changing the plain-text facts', () => {
    const email = renderTransactionalEmail('terms', {
      effectiveDate: '<date>',
      changes: ['<script>alert(1)</script>']
    });
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).not.toContain('<script>');
    expect(email.text).toContain('<date>');
  });
});
