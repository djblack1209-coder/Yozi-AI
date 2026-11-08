import { LEGAL_LANGUAGES, legalBlocks } from '../../website/legal.mjs';

const appVersion = { version: '1.2', updated: '2026-11-08', effective: '2026-11-08' };
const appClauses = {
  zh: {
    providerLead: '**当前版本的 AI 连接器除国内服务商外',
    providers:
      '**AI 连接器预设的服务均为已备案或登记的中国大陆模型服务。** 你自行填写的自定义地址可能位于境外。此前已保存的境外服务连接仍可使用。使用境外服务或地址时，发送的学习内容会传输至境外，由该服务商处理。',
    labels:
      ' 对话回复和知识卡旁显示「AI 生成」，写作反馈显示「AI 评估」。含评估的学习分享图片也保留「AI 评估」标识。请阅读并理解上述标识方式。'
  },
  en: {
    providerLead: '**Besides domestic providers, the AI connector',
    providers:
      '**The AI connector presets are model services in mainland China that have completed filing or registration.** A custom endpoint you enter may be outside mainland China. Previously saved connections to overseas providers remain available. If you use an overseas service or endpoint, the study content you send is transferred outside mainland China and handled by that provider.',
    labels:
      ' “AI-generated” appears next to conversation replies and knowledge cards. Writing feedback is labelled “AI assessment”. Shared study images that include assessments retain the assessment label. Please read and make sure you understand these labels.'
  }
};

// Keep the common legal text offline, with disclosures that apply to App 2.3.0.
export function readAppLegal() {
  const documents = {};
  for (const language of LEGAL_LANGUAGES) {
    const privacy = legalBlocks(language, 'privacy');
    const terms = legalBlocks(language, 'terms');
    const copy = appClauses[language];
    const ai = privacy.findIndex((block) => block.id === 'ai');
    privacy[ai + 1].items.find((item) => item.text.startsWith(copy.providerLead)).text = copy.providers;
    const aiContent = terms.findIndex((block) => block.id === 'ai-content');
    terms[aiContent + 1].items[0].text += copy.labels;
    documents[language] = { privacy, terms };
  }
  return { version: appVersion, documents };
}
