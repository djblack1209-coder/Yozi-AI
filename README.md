# Yozi AI

![Yozi AI 吉祥物](src/static/images/logo.png)

中国学生的 AI 学习教练，先从考研英语写作带练开始。一个对话窗口记住进度，安排每日训练、逐段写作和到期复习；可上传自己的资料。App 承载核心学习；官网提供下载、注册登录和个人同步进度，兼顾微信内置浏览器与 390px 窄屏。

当前公网官网：[yozi.bot.cd](https://yozi.bot.cd/)（2026-11-05 已实测）。原 `exam.245334.xyz`、`exam.blackdj.dpdns.org` 网站入口已停用并返回 HTTP 410；兼容 DNS 与在用 API 保留。

## 当前用户路径

注册 → 连接自己的 API → 对话建档 → 10 分钟摸底 → 到期复习 / 搭配 / 翻译 / 长难句 → 逐段带写 → 小结 → 次日接续 → 事实看板。选择仅改草稿，明确提交才保存；写作反馈标为 AI 评估，不冒充官方评分。

模型由用户自带 API 提供：注册后在 AI 连接器接入，型号实时读取，可接多个并按账号保存、重开恢复；当前型号不可用时明确提示并可切换。平台预配模型已移出主流程。朋友试用免费，收费、短信、生产部署均须另行授权；完整主线仍待当前批次验收。

## 开发入口

Node >=22.22.3、npm >=10.8.2，使用 package-lock.json；以 [package.json](package.json) 为准。沿现有依赖开发，不自动下载安装。

```sh
npm run dev:h5
npm test
npm run lint
npm run build:h5
npm run build:app
npm run build:desktop
```

所有测试均在本机完成；桌面原生、共享App构建及本机已有原生／模拟器分别记录覆盖范围，构建不代替实际操作。小程序开发、构建和验证暂停，既有源码、脚本、依赖与产物保留；不安排外部设备或跨设备测试。隔离渠道、命令副作用和当前候选按[脚本合同](docs/08C-SCRIPTS-REFERENCE.md#当前-app-验收范围2026-11-02-裁定)核对。

保留用户的作答、错题、收藏、复习、备份和旧记录回看；账户、存储键与应用标识遵守 [兼容合同](docs/08C-SCRIPTS-REFERENCE.md#名称与兼容边界2026-10-16)。官网与 App 的现行设计及素材入口见 [样式规则](docs/07-STYLING-SYSTEM.md)，当前日常入口保留。真实模型、本机原生能力、长期效果和公开发布分别验收；未覆盖能力保持未验证。

[产品定义](docs/01-PRODUCT-VISION.md) · [当前计划](docs/13-DEVELOPMENT-PLAN.md) · [文档索引](docs/00-INDEX.md) · [项目约定](AGENTS.md)
