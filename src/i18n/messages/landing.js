import { registerMessages, t } from '@/i18n/index.js';

// Only landing consumers register this dictionary; core i18n never imports it.
export const landingMessages = {
  'zh-CN': {
    'topic.function': '函数运算带练',
    'topic.motion': '路程与位移',
    'topic.work': '功与动能',
    'topic.density': '密度、质量与体积',
    'topic.pressure': '压强、压力与接触面积',
    'topic.notice': '英文通知写作',
    'topic.explanation': '英文说明写作',
    'topic.argument': '英文论证写作',
    'topic.sentence': '英文句子组织',
    'topic.email': '英文邮件写作',
    'topic.discussion': '英文学术讨论',
    'topic.narrative': '中文叙事写作',
    'topic.material': '中文材料论证',
    badge: '每个问题，都是起点',
    headline: '从一个问题\n学到真正明白',
    space: 'Yozi AI 学习空间',
    navigation: '学习导航',
    learn: '学习',
    mistakes: '错题',
    plan: '复习计划',
    history: '学习足迹',
    desktop: '桌面体验',
    start: '开始学习',
    preview: '学习卡片预览',
    previewPause: '暂停预览',
    previewPlay: '播放预览',
    'preview.explain': '知识卡',
    'preview.explainCopy': '把问题拆开看',
    'preview.practice': '练习卡',
    'preview.practiceCopy': '试着写下你的答案',
    'preview.review': '复习卡',
    'preview.reviewCopy': '回看原答和反馈',
    'preview.plan': '计划卡',
    'preview.planCopy': '知道今天学什么',
    materials: '资料',
    connections: 'AI 助手',
    account: '我的',
    home: '首页',
    motion: '动效',
    ticker: '提问·理解·练习·复习·'
  },
  en: {
    'topic.function': 'Function practice',
    'topic.motion': 'Distance and displacement',
    'topic.work': 'Work and kinetic energy',
    'topic.density': 'Density, mass and volume',
    'topic.pressure': 'Pressure, force and contact area',
    'topic.notice': 'English notice writing',
    'topic.explanation': 'English explanatory writing',
    'topic.argument': 'English argument writing',
    'topic.sentence': 'English sentence building',
    'topic.email': 'English email writing',
    'topic.discussion': 'English academic discussion',
    'topic.narrative': 'Chinese narrative writing',
    'topic.material': 'Chinese source-based argument',
    badge: 'Every question is a start',
    headline: 'one question\na clearer mind',
    space: 'Yozi AI learning space',
    navigation: 'Learning navigation',
    learn: 'Learn',
    mistakes: 'Mistakes',
    plan: 'Review plan',
    history: 'Learning history',
    desktop: 'Desktop view',
    start: 'Start learning',
    preview: 'Preview learning cards',
    previewPause: 'Pause preview',
    previewPlay: 'Play preview',
    'preview.explain': 'Knowledge',
    'preview.explainCopy': 'Break down a question',
    'preview.practice': 'Practice',
    'preview.practiceCopy': 'Try writing your answer',
    'preview.review': 'Review',
    'preview.reviewCopy': 'Revisit answers and feedback',
    'preview.plan': 'Plan',
    'preview.planCopy': 'See what to study today',
    materials: 'My materials',
    connections: 'AI assistants',
    account: 'My account',
    home: 'Home',
    motion: 'Motion',
    ticker: 'ASK·LEARN·PRACTISE·REVIEW·'
  }
};
registerMessages('landing', landingMessages);

// Layout follows the template; all product labels follow the selected language.
export const landingPresentation = Object.freeze(
  Object.defineProperties(
    {},
    Object.fromEntries(
      Object.keys(landingMessages.en).map((key) => [key, { enumerable: true, get: () => t(`landing.${key}`) }])
    )
  )
);
