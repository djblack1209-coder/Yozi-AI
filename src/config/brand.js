// 显示品牌与兼容标识分开：改名不迁移账户、存储键、应用 ID 或题源路径。
export const BRAND = Object.freeze({
  english: 'Yozi AI',
  chinese: 'Yozi AI',
  name: 'Yozi AI',
  title: 'Yozi AI · 对话学习空间',
  description: '从一个问题开始，在对话中理解、练习和复习。',
  // Study Index mark. Source: src/assets/brand/logo/current/ (mark.svg navy, mark-reverse.svg white).
  mark: '/static/images/logo.png',
  markOnDark: '/static/images/logo-reverse.png',
  icon: '/static/images/logo.png',
  themeColor: '#eae8fc'
});

// One local, licensed fallback across account surfaces; uploaded photos take priority.
// The kitten keeps the avatar role; the logo is not an avatar.
export const DEFAULT_AVATAR = '/static/brand/kitten-avatar.png';
