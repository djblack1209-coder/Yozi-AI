import { fileURLToPath } from 'node:url';

const SITE = 'https://yozi.bot.cd';
const BLUE = '#0549ff';
const FONT = "Inter, 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif";
const escape = (value = '') =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const image = (file, alt, width = 560) =>
  `<img src="${SITE}/${file}" alt="${escape(alt)}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;margin:auto">`;
const button = (label, href = `${SITE}/account/`, light = false) =>
  `<a href="${href}" style="display:inline-block;padding:15px 26px;border-radius:999px;background:${light ? '#ffffff' : BLUE};color:${light ? BLUE : '#ffffff'};font-size:15px;font-weight:600;text-decoration:none">${label}</a>`;
const heading = (text) =>
  `<h1 style="margin:0 0 22px;font-size:38px;font-weight:600;line-height:1.18;letter-spacing:-1.4px">${text}</h1>`;
const paragraph = (text) => `<p style="margin:16px 0;font-size:16px;line-height:1.7">${text}</p>`;
const row = (content, style = '') => `<tr><td class="section" style="padding:38px 40px;${style}">${content}</td></tr>`;
const logoStyle = 'vertical-align:middle;margin-right:10px;border:0;width:32px;height:32px';
// The body uses the static master; inbox sender avatars are configured separately.
const brand = `<a href="${SITE}/" style="color:inherit;font-size:20px;font-weight:600;text-decoration:none"><img src="cid:pudding-logo@yozi" width="32" height="32" alt="" style="${logoStyle}">Yozi AI</a>`;
const footer = (dark = false) =>
  row(
    `<p style="margin:0 0 14px;font-size:18px;font-weight:600">Yozi AI</p><a href="mailto:yozi@245334.xyz" style="color:inherit">yozi@245334.xyz</a><p style="margin:18px 0 0;font-size:12px;line-height:1.8"><a href="${SITE}/zh/privacy/" style="color:inherit">隐私政策</a>&nbsp;&nbsp; <a href="${SITE}/zh/terms/" style="color:inherit">用户协议</a><br>© 2026 Yozi</p>`,
    `text-align:center;color:${dark ? '#d4d4d4' : '#666666'};background:${dark ? '#171717' : '#fafafa'};`
  );

export const EMAIL_REFERENCES = Object.freeze({
  verification: ['uptimerobot-log-in', 'just-one-last-step', 'turn-on-automatic-renewal'],
  welcome: ['get-to-know-these-game-changing-features'],
  subscription: ['turn-on-automatic-renewal'],
  renewal: ['turn-on-automatic-renewal'],
  progress: ['highlights-and-shared-wins'],
  terms: ['new-terms-same-commitment-to-you']
});

// Layout follows the owner's RGE references; colour, type and assets come from the Yozi website.
export function renderTransactionalEmail(kind, data = {}) {
  let subject, preview, text, rows;
  switch (kind) {
    case 'verification': {
      const code = escape(data.code);
      subject = `【Yozi AI】${data.code} · 邮箱验证码`;
      preview = `${data.code} 是你的 Yozi AI 验证码，10 分钟内有效。`;
      text = `${preview}\n请在刚才的验证页面输入。请勿把验证码提供给他人。\n如果这不是你的操作，可以忽略此邮件。\n\nYozi 官网：${SITE}/\n\nYozi AI\nyozi@245334.xyz`;
      rows =
        row(brand, 'padding-top:48px;padding-bottom:40px;') +
        row(
          `${heading('你的邮箱验证码')}${paragraph('请回到刚才的验证页面输入，10 分钟内有效。')}<div style="margin:30px 0 32px;padding:24px 0;border-top:1px solid #eaeaea;border-bottom:1px solid #eaeaea"><p style="margin:0;color:#171717;font-size:42px;line-height:1.3;font-weight:600;letter-spacing:9px;font-variant-numeric:tabular-nums;white-space:nowrap">${code}</p></div>${button('打开 Yozi 官网', `${SITE}/`)}<p style="margin:22px 0 0;font-size:13px;line-height:1.7"><a href="${SITE}/" style="color:${BLUE};overflow-wrap:anywhere">${SITE}/</a></p><p style="margin:36px 0 0;font-size:13px;line-height:1.7;color:#666666">请勿把验证码提供给他人。如果这不是你的操作，可以忽略此邮件。</p>`,
          'padding-top:0;padding-bottom:40px;'
        ) +
        row(
          `<a href="mailto:yozi@245334.xyz" style="font-size:12px;color:#666666;text-decoration:none">yozi@245334.xyz</a><p style="margin:12px 0 0;font-size:12px;line-height:1.8;color:#666666"><a href="${SITE}/zh/privacy/" style="color:inherit">隐私政策</a>&nbsp;&nbsp; <a href="${SITE}/zh/terms/" style="color:inherit">用户协议</a><br>© 2026 Yozi</p>`,
          'padding-top:24px;padding-bottom:40px;border-top:1px solid #eaeaea;'
        );
      break;
    }
    case 'welcome': {
      subject = '欢迎使用 Yozi AI';
      preview = '从一个问题开始，把练习、反馈和复习接起来。';
      text = `${preview}\n\n说出你想学什么：在对话中确认目标。\n用自己的资料练习：上传或粘贴资料，围绕原文提问。\n下次接着学：查看已保存的反馈与待复习内容。\n\n打开 Yozi：${SITE}/#download\n联系：yozi@245334.xyz`;
      const features = [
        ['说出你想学什么', '在对话里确认目标，开始适合自己的练习。', 'feature-day-1.jpg'],
        ['看见每次进步', '查看自己的原答、AI 评估和已保存的订正。', 'feature-day-3.jpg'],
        ['下次接着学', '按已保存的学习记录，继续训练与复习。', 'feature-day-4.jpg']
      ];
      rows =
        row(
          `${brand}<div style="height:32px"></div>${heading('学习，从你的问题开始。')}${paragraph(preview)}<div style="margin-top:24px">${button('打开 Yozi', `${SITE}/#download`)}</div>`,
          'text-align:center;padding-top:32px;padding-bottom:44px;'
        ) +
        row(
          `<h2 style="font-size:30px;line-height:1.25;margin:0 0 32px;letter-spacing:-.7px">练习、反馈、复习。</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${features.map(([title, body, file]) => `<tr><td width="132" style="padding:12px 20px 12px 0;vertical-align:middle">${image(`media/${file}`, title, 112)}</td><td style="padding:12px 0;vertical-align:middle"><h3 style="margin:0 0 10px;font-size:20px;line-height:1.3">${title}</h3><p style="margin:0;color:#d4d4d4;font-size:15px;line-height:1.65">${body}</p></td></tr>`).join('')}</table><div style="margin:32px 0 0;text-align:center">${button('开始学习', `${SITE}/#download`)}</div><div style="margin-top:48px;text-align:center"><h2 style="font-size:28px;line-height:1.3;margin:0 0 26px">从这次练习，接到下次复习。</h2><div style="padding:24px;border-radius:18px;background:#fafafa">${image('media/feature-day-2.jpg', '对话中的练习与反馈', 520)}</div><div style="margin-top:38px">${brand}</div><h2 style="font-size:28px;line-height:1.3;margin:20px 0 26px">带着进度，继续学。</h2>${button('下载 App', `${SITE}/#download`)}</div>`,
          'background:#171717;color:#ffffff;'
        ) +
        footer(true);
      break;
    }
    case 'subscription':
    case 'renewal': {
      const renewal = kind === 'renewal';
      const title = renewal ? '你的续订安排' : '订阅已确认';
      subject = `Yozi AI · ${title}`;
      preview = `${data.plan || ''}${data.amount ? ` · ${data.amount}` : ''}${data.date ? ` · ${data.date}` : ''}`;
      text = `${title}\n${preview}\n${data.detail || ''}\n在账户中查看：${SITE}/account/\n联系：yozi@245334.xyz`;
      rows =
        row(image('media/yozi-pudding-hero-poster.jpg', 'Pudding', 600), `padding:0;background:${BLUE};`) +
        row(
          `${brand}<div style="width:72px;height:1px;background:#ffffff88;margin:28px auto"></div>${heading(title)}${paragraph(escape(data.plan))}${paragraph(escape(data.detail))}${button('查看账户', `${SITE}/account/`, true)}<p style="margin:18px 0 0;font-size:18px;font-weight:600">${escape(data.amount)}</p><p style="margin:12px 0 0;font-size:14px">${escape(data.date)}</p>`,
          `text-align:center;background:${BLUE};color:#ffffff;`
        ) +
        footer();
      break;
    }
    case 'progress': {
      subject = 'Yozi AI · 这段时间的学习收获';
      preview = `${data.period || ''}的练习与进步，来自你的学习记录。`;
      const stats = data.stats || [];
      text = `${preview}\n${stats.map((stat) => `${stat.label}：${stat.value}`).join('\n')}\n${data.summary || ''}\n查看学习进度：${SITE}/account/\n联系：yozi@245334.xyz`;
      rows =
        row(brand) +
        row(
          `${heading('每次练习，都在留下收获。')}${paragraph(escape(data.period))}${image('media/yozi-pudding-hero-poster.jpg', 'Pudding', 600)}`,
          `background:${BLUE};color:#ffffff;text-align:center;`
        ) +
        row(
          `<h2 style="font-size:28px;font-weight:500;margin:0 0 26px">你已完成</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${stats.reduce((result, stat, index) => result + (index % 2 === 0 ? '<tr>' : '') + `<td width="50%" style="padding:22px 14px;text-align:center;background:#fafafa;border:5px solid #ffffff;border-radius:12px"><p style="margin:0 0 10px;font-size:38px;font-weight:600;color:${BLUE}">${escape(stat.value)}</p><p style="margin:0;font-size:14px;color:#666666">${escape(stat.label)}</p></td>` + (index % 2 === 1 || index === stats.length - 1 ? '</tr>' : ''), '')}</table>${paragraph(escape(data.summary))}<div style="margin-top:28px;text-align:center">${button('查看学习进度')}</div>`
        ) +
        footer();
      break;
    }
    case 'terms': {
      subject = 'Yozi AI · 用户协议更新';
      preview = `用户协议将于 ${data.effectiveDate || ''}生效。`;
      text = `${preview}\n${(data.changes || []).join('\n')}\n${data.accountImpact || ''}\n查看用户协议：${SITE}/zh/terms/\n联系：yozi@245334.xyz`;
      rows =
        row(brand) +
        row(
          `${heading('用户协议有更新。')}${paragraph(escape(data.effectiveDate))}${image('media/yozi-pudding-hero-poster.jpg', 'Pudding', 600)}`,
          `background:${BLUE};color:#ffffff;text-align:center;`
        ) +
        row(
          `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fafafa;border:1px solid #eaeaea;border-radius:8px"><tr><td style="padding:30px">${paragraph('你好，')}${paragraph(`我们更新了 Yozi AI 的用户协议，将于 ${escape(data.effectiveDate)} 生效。`)}<ul style="padding-left:20px;font-size:16px;line-height:1.75">${(data.changes || []).map((change) => `<li>${escape(change)}</li>`).join('')}</ul>${paragraph(escape(data.accountImpact))}<div style="margin-top:28px;text-align:center">${button('查看用户协议', `${SITE}/zh/terms/`)}</div></td></tr></table>`
        ) +
        footer();
      break;
    }
    default:
      throw new Error('Unknown transactional email');
  }
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(subject)}</title><style>@media(max-width:600px){.section{padding:28px 22px!important}h1{font-size:30px!important}}</style></head><body style="margin:0;padding:0;background:#f5f5f5;color:#171717;font-family:${FONT}"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escape(preview)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" class="email" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;font-family:${FONT}">${rows}</table></td></tr></table></body></html>`;
  return {
    subject,
    text,
    html,
    attachments: [
      {
        filename: 'pudding-logo.png',
        path: fileURLToPath(new URL('./yozi-email-logo.png', import.meta.url)),
        cid: 'pudding-logo@yozi',
        contentType: 'image/png',
        contentDisposition: 'inline'
      }
    ]
  };
}
