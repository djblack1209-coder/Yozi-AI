import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PrivacyPage from '@/pages/settings/privacy.vue';
import TermsPage from '@/pages/settings/terms.vue';
import { setLanguage } from '@/i18n/index.js';
import { renderLegal } from '../../website/legal.mjs';

const profileSource = readFileSync(resolve(process.cwd(), 'src/pages/profile/index.vue'), 'utf8');
const revisionCopy = {
  privacy: {
    zh: ['当前版本的 AI 连接器除国内服务商外', '此前已保存的境外服务连接仍可使用'],
    en: ['Besides domestic providers', 'Previously saved connections to overseas providers remain available']
  },
  terms: {
    zh: ['本服务会在界面中标识 AI 生成内容', '对话回复和知识卡旁显示「AI 生成」'],
    en: [
      'The service labels AI-generated content',
      '“AI-generated” appears next to conversation replies and knowledge cards'
    ]
  }
};
function expectAppCopy(page, document, language, dateLine) {
  setLanguage(language === 'zh' ? 'zh-CN' : 'en');
  const wrapper = mount(page, { global: { plugins: [createPinia()], stubs: { BaseIcon: true } } });
  try {
    const site = new DOMParser().parseFromString(renderLegal(language, document, ''), 'text/html');
    const app = wrapper.get('.legal-copy').element.cloneNode(true);
    app.querySelectorAll('.legal-marker').forEach((marker) => marker.remove());
    const text = (node) => node.textContent.replace(/\s+/g, ' ').trim();
    expect(wrapper.get('.update-date').text()).toBe(dateLine);
    expect(site.querySelector('#legal-text').dataset.legalVersion).toBe('1.1');
    const [siteClause, appClause] = revisionCopy[document][language];
    const appBlocks = [...app.children].map(text);
    const siteBlocks = [...site.querySelectorAll('#legal-text .legal-intro > *, #legal-text section > *')].map(text);
    const changedIndex = siteBlocks.findIndex((block) => block.includes(siteClause));
    expect(appBlocks[changedIndex]).toContain(appClause);
    expect(appBlocks.filter((_, index) => index !== changedIndex)).toEqual(
      siteBlocks.filter((_, index) => index !== changedIndex)
    );
    expect([...app.querySelectorAll('[role="link"]')].map(text)).toEqual(
      [...site.querySelectorAll('#legal-text p a, #legal-text section a')].map(text)
    );
  } finally {
    wrapper.unmount();
    setLanguage('zh-CN');
  }
}

describe('settings legal and privacy scope', () => {
  it('exposes direct profile entries for privacy policy and user agreement', () => {
    expect(profileSource).toContain("goTo('/pages/settings/privacy')");
    expect(profileSource).toContain("goTo('/pages/settings/terms')");
    expect(profileSource).toContain("t('dashboard.copy106')");
    expect(profileSource).toContain("t('dashboard.copy107')");
  });

  it('shows the App 1.2 privacy policy in both languages, including existing overseas connections', () => {
    const policy = renderLegal('zh', 'privacy', '');
    expect(policy).toContain('在 App 设置中申请注销');
    expect(policy).toContain('申请后有7天冷静期');
    expectAppCopy(PrivacyPage, 'privacy', 'zh', '版本 1.2 · 2026-11-08 更新 · 2026-11-08 生效');
    expectAppCopy(PrivacyPage, 'privacy', 'en', 'Version 1.2 · updated 2026-11-08 · effective 2026-11-08');
  });

  it('shows the App 1.2 AI labelling terms in both languages', () => {
    expectAppCopy(TermsPage, 'terms', 'zh', '版本 1.2 · 2026-11-08 更新 · 2026-11-08 生效');
    expectAppCopy(TermsPage, 'terms', 'en', 'Version 1.2 · updated 2026-11-08 · effective 2026-11-08');
  });
});
