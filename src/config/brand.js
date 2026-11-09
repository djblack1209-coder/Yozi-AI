// 显示品牌与兼容标识分开：改名不迁移账户、存储键、应用 ID 或题源路径。
export const BRAND = Object.freeze({
  english: 'Yozi AI',
  chinese: 'Yozi AI',
  name: 'Yozi AI',
  supportEmail: 'yozi@245334.xyz',
  title: 'Yozi AI · 对话学习空间',
  description: '从一个问题开始，在对话中理解、练习和复习。',
  // Pudding, the owner-selected mark. Light and dark surfaces use the same transparent portrait.
  mark: '/static/images/logo.png',
  markOnDark: '/static/images/logo.png',
  icon: '/static/images/logo.png',
  themeColor: '#eae8fc'
});

// The local Pudding portrait is the account fallback. Uploaded photos take priority.
export const DEFAULT_AVATAR = '/static/brand/kitten-avatar.png';
