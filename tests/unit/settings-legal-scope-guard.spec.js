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
function expectPublishedCopy(page, document, language, dateLine) {
  setLanguage(language === 'zh' ? 'zh-CN' : 'en');
  const wrapper = mount(page, { global: { plugins: [createPinia()], stubs: { BaseIcon: true } } });
  try {
    const site = new DOMParser().parseFromString(renderLegal(language, document, ''), 'text/html');
    const app = wrapper.get('.legal-copy').element.cloneNode(true);
    app.querySelectorAll('.legal-marker').forEach((marker) => marker.remove());
    const text = (node) => node.textContent.replace(/\s+/g, ' ').trim();
    expect(wrapper.get('.update-date').text()).toBe(dateLine);
    expect(wrapper.get('.update-date').text()).toBe(text(site.querySelector('.legal-meta')));
    expect([...app.children].map(text)).toEqual(
      [...site.querySelectorAll('#legal-text .legal-intro > *, #legal-text section > *')].map(text)
    );
    expect([...app.querySelectorAll('.legal-emphasis')].map(text)).toEqual(
      [...site.querySelectorAll('#legal-text strong')].map(text)
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

  it('shows the published 1.1 privacy policy in both languages', () => {
    const policy = renderLegal('zh', 'privacy', '');
    expect(policy).toContain('在 App 设置中申请注销');
    expect(policy).toContain('申请后有7天冷静期');
    expectPublishedCopy(PrivacyPage, 'privacy', 'zh', '版本 1.1 · 2026-11-07 更新 · 2026-11-07 生效');
    expectPublishedCopy(PrivacyPage, 'privacy', 'en', 'Version 1.1 · updated 2026-11-07 · effective 2026-11-07');
  });

  it('shows the published 1.1 terms of use in both languages', () => {
    expectPublishedCopy(TermsPage, 'terms', 'zh', '版本 1.1 · 2026-11-07 更新 · 2026-11-07 生效');
    expectPublishedCopy(TermsPage, 'terms', 'en', 'Version 1.1 · updated 2026-11-07 · effective 2026-11-07');
  });
});
