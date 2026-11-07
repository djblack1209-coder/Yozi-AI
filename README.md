# Yozi AI

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/mark-reverse.svg" />
  <img src="docs/assets/brand/mark.svg" width="88" height="88" alt="Yozi AI 标志" />
</picture>

Yozi AI 是陪你学习、练习和复习的 AI 教练。你可以带着自己的资料开始对话，按反馈订正，再回顾到期内容。应用会记录练习进度，让你从上次的位置继续。

**当前应用版本 2.2.0**。官网提供 macOS Apple 芯片版下载、注册登录和已同步的个人学习进度。[官网](https://yozi.bot.cd/) · [macOS Apple 芯片版](https://yozi.bot.cd/downloads/Yozi-AI-2.2.0-macOS-arm64.zip)

## 开始学习

1. 注册账号，在 AI 连接器添加自己的 API Key 并选择模型。
2. 在对话中说明学习目标，按需上传资料，从摸底或练习开始。
3. 提交作答后查看 AI 反馈和订正建议，再按到期计划复习。

作答在明确提交后保存。写作反馈会标注为 AI 评估。

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
