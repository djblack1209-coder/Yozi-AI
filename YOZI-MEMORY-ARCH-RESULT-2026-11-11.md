# Yozi 学习记忆架构补充结果 · 2026-11-11

本轮机制实现与本机主流程验证完成，源码提交 `0204f5a1`，位于 `codex/yozi-design-construction-20261109` 工作树。五项补充均已落地，没有界面、交互或品牌改动。记忆机制尚未发布到生产后端或日常 App；此次完成范围是实现、本机验证及共享 App 资源构建。

已读取 [Anthropic 原文](https://www.anthropic.com/research/components-of-agent-memory)、[dreaming 指南](https://platform.claude.com/cookbook/managed-agents-cma-dreaming-with-a-dynamic-workflow)和 [knowledge-wiki 指南](https://github.com/anthropics/claude-quickstarts/tree/main/managed-agents/knowledge-wiki)。以下为适配 Yozi 既有机制的实现判断，不将原文示例的评测收益当作 Yozi 效果证据。

- 原始层：沿用账户隔离的学习事件、会话、实际作答及资料，保留既有同步、恢复、删除与明确接受合同；派生记忆不回写原始事实，也不新增第二套同步事实。
- 笔记层：从已接受的目标、偏好、当前计划和实际教学后续观察提炼笔记，保留来源事件编号、日期、依据与 verified／unconfirmed。verified 自述只代表原记录支持这项自述，不代表掌握；教法观察区分无提示变式、到期复习、提示后答对、仍有困难与待核对，不推断因果效果。
- 知识层：每位学习者的 `profile.md`、`goals.md`、`goals/<会话>.md`、`notes/<编号>.md`、`synthesis/<编号>.md` 形成可读、可链接的逻辑文档。它们以结构化 JSON 持久化在原账户存储命名空间 `conversation_learning_v1_assistant_memory`，读取时呈现 Markdown；没有另建磁盘 Markdown 文件夹。
- 顶层：请求自动读取当前目标、日期、学习状态与相关文档链接构成的小索引；相关细节在下层检索后按现有请求剩余空间取用，不全量注入。不同会话的同考试／同目标记录形成综合文档，保留不同偏好和来源；当前会话的明确选择优先。单份资料继续查原文，不复制整份资料进知识层。
- 整理层：原始记录重新生成派生层，纠正错误和过期笔记、移除无依据陈述、补齐文档与失效链接。按考试日期和学习状态更新索引；记录原始、笔记及知识文档体积，并标记派生层是否更大，不增加产品配额或删除原始记录。

落点：

- [记忆分层、检索及重建](</Users/blackdj/Desktop/Yozi AI/tmp/yozi-design-20261109.noindex/wt/laf-backend/functions/_shared/learning-assistant-memory.js>)；[账户持久化与隐私清理](</Users/blackdj/Desktop/Yozi AI/tmp/yozi-design-20261109.noindex/wt/src/services/learning/learning-repository.js>)。
- [后台整理调度](</Users/blackdj/Desktop/Yozi AI/tmp/yozi-design-20261109.noindex/wt/src/services/learning/learning-memory-reconciler.js>)；[主 Store 接入](</Users/blackdj/Desktop/Yozi AI/tmp/yozi-design-20261109.noindex/wt/src/stores/modules/conversation-learning.js>)；[App 显示／隐藏生命周期](</Users/blackdj/Desktop/Yozi AI/tmp/yozi-design-20261109.noindex/wt/src/App.vue>)。
- [云端模型边界](</Users/blackdj/Desktop/Yozi AI/tmp/yozi-design-20261109.noindex/wt/laf-backend/functions/proxy-ai.ts>)及已有本地连接器 `src/services/learning/local-connector.js`、`scripts/build/local-model-connector.mjs`。批改、完整成文评分、小结评分、视觉及工作流专用请求保持原有隔离，历史记忆不进入评分依据。
- [记忆测试](</Users/blackdj/Desktop/Yozi AI/tmp/yozi-design-20261109.noindex/wt/tests/unit/learning-assistant-memory.spec.js>)和模型端点定向测试；无新增依赖、下载、许可证公开范围变化。

触发：记录初始化／变更后在当前交互空闲时整理；保持开启时每 24 小时检查，重回前台会检查到期及来源变化。复用现有写入租约，等待后复核账号、生命周期与取消状态；隐藏、退出账户、取消和 Store 销毁会停止待办。保存失败如实记录，下一次交互／激活再试，不循环调用模型，不启动新常驻服务。

实际自验：

- [写入会话](</Users/blackdj/Desktop/Yozi AI/tmp/yozi-release-qa.noindex/owner-supplement.noindex/work/memory-runtime-write.json>)：真实 Chrome、原 Store／存储、独立测试账户，按原提议卡接受合同明确确认偏好，保存日期与计划；后台自动持久化 5 条笔记，原始事件 revision 6，索引未含偏好全文。浏览器正常关闭。
- [后续会话与整理](</Users/blackdj/Desktop/Yozi AI/tmp/yozi-release-qa.noindex/owner-supplement.noindex/work/memory-runtime-read.json>)：新进程读回 revision 6，新增同目标会话与不同偏好。实际请求带当前日期索引及 10 个相关摘录，经本地真实后端到付费 DeepSeek；回复保留两次偏好的区别，按本次偏好安排练习，不把它当作掌握证据。
- 同次实际整理修正 1 条错误笔记、移除 1 条虚构笔记、修复 1 条坏链接并恢复 1 份缺失文档；所有链接可读，原始记录导出前后一致。原始层 15,741 字节、笔记 2,225 字节、知识文档 2,010 字节，派生合计 4,235 字节。
- [无缓存冷重开](</Users/blackdj/Desktop/Yozi AI/tmp/yozi-release-qa.noindex/owner-supplement.noindex/work/memory-runtime-startup.json>)：修复首开早于写入租约的时序后，无手动触发自动恢复 9 条笔记。[实际隐私删除](</Users/blackdj/Desktop/Yozi AI/tmp/yozi-release-qa.noindex/owner-supplement.noindex/work/memory-runtime-cleanup.json>)同时清除本次原始及派生测试记录。
- 259 项定向回归通过；租约修复后另一次受影响的记忆／会话检查 39 项通过，其中记忆测试 11 项。后端及最终共享 App 构建通过，格式与差异检查通过。日志在本批 `work/memory-*.log`；[付费用量](</Users/blackdj/Desktop/Yozi AI/tmp/yozi-release-qa.noindex/owner-supplement.noindex/work/memory-usage.json>)为 2 次连接检查＋1 次真实回复，均 completed，共 5,392 tokens，金额仍 pending。

覆盖边界：主流程验证运行于本机共享前端、真实 Store／浏览器持久化及独立本地后端；只将 API 目的地转向隔离后端，没有伪造响应。没有新增原生 App 实开、手机、签名或跨设备结论；24 小时调度用受控时钟验证，真实自然日等待未测。历史自然学习数据的长期收益和规模增长仍不能由本次短样本推断。

建议不吸收示例专用的 Managed Agents 托管存储、外部 cron 及并行多代理运行设施：五项产品机制已由现有事件仓库、BYOK 和 App 生命周期覆盖，引入它们会额外增加供应商依赖、私有数据复制和常驻资源。没有采用示例的预算数字、文件限额或人工审批门槛；现有鉴权、费用与输入边界继续生效。

管理后台补充已由 `c21be3d4` 上线交付，本次核对了既有真实回执，无重复开发。运营总览、账户与订阅状态、访问／活跃／功能用量、维护日志及异常均具备；订阅服务保持关闭。设计与鉴权覆盖、官网继续任务及恢复边界已归入 [安排总账](</Users/blackdj/Desktop/Yozi AI/YOZI-ARRANGEMENT-RESULT-2026-11-08.md>)。

资源收尾：本轮 Vite／隔离后端正常终止并回收退出状态，测试浏览器全部关闭，测试数据库及其中 1 份加密 API 凭据删除，临时登录凭据文件删除。已核验无消费者的浏览器临时资料 38,882,178 字节移入废纸篓；共享 Mongo、Cenlio、日常 App、源码、当前共享 App 候选和必要回退保留。详见 [既有资源记录](</Users/blackdj/Desktop/Yozi AI/tmp/yozi-release-qa.noindex/owner-supplement.noindex/resources.json>)，不将入篓字节称作实时磁盘或内存释放。
