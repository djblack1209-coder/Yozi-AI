# 动态模型及最高档参数只读发现合同草案

**v1 冻结。** 保留原提案供追溯；后续以 [B v2 草案](DRAFT-MODEL-DISCOVERY-CONTRACT-V2-20261024.md) 待批版本为准，默认关闭与授权边界保持。

**草案／未定案／未实施。仍需主线审阅与既定 Claude 技术裁决。** 本文不是 Claude 结论，不授权发现请求、凭据使用、真实推理、实现或部署。核查日期：2026-10-24。只读无秘密源码、既有交付记录和公开官方文档；没有访问账户额度页、保险库、秘密、认证日志或带鉴权的 models 接口。

18:31 登录搁置不变，当前 IAB 未登录事实沿用；不启动真实账号／教学流程，不保存新凭据、不新绑密钥、不增加权限、费用或服务器。H5 失败时序、真人语音与原生权限、完整验收／角色体验／UIUX 阶段门均未因此解除。

## 1. 已有能力与四层事实

| 层次     | 定义及本轮能够确认的事实                                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 目录预设 | 源码内的厂商、端点、候选型号与说明；只表示可供选择的模板，不表示型号当前在线、凭据有效或免费。                                               |
| 可发现   | 官方文档明确提供只读模型／能力接口，且适用地域、协议、鉴权方式已明确；本文核到文档不等于已实际调用。仅有网页模型清单时，仍只是文档证据。     |
| 已绑定   | 当前账号通过正常流程保存了既有连接；必须有当前正常账号投影。源码、Logo、旧回执或 `configured` 的历史值不能证明现在仍绑定。                   |
| 真实验证 | 相同账号、连接配置版本、精确型号／端点／参数的真实调用回执；连接检查、教学结构、教学语义与免费结算分别成立。发现成功不升级任何真实验证状态。 |

本轮只确认目录与文档；**当前已绑定状态、当前免费剩余额度和新的真实验证均未检查，保持未知**。现有历史回执原样保留，不据此给整个厂商打“已接通”或“当前免费”的标签。国内可展示静态厂商目录；国外继续只显示已有配置允许展示的已连接项，不因公共 models 返回更多型号扩大可见范围或改变选择。

无秘密代码依据：

- [model-endpoints.js](../laf-backend/functions/_shared/ai-providers/model-endpoints.js)：`MODEL_ENDPOINTS` 有 30 家厂商；`MODEL_CONNECTION_PRESETS` 是模板；精确公开 base path 补齐与国内分类已有实现。
- [free-model-presets.ts](../laf-backend/functions/_shared/ai-providers/free-model-presets.ts)：参数是若干精确型号／端点的手工映射；免费价格匹配有版本和到期边界，不是动态能力服务。
- [learning-models.ts](../laf-backend/functions/learning-models.ts)：`action=list` 返回已配置平台模型、账号 profiles、静态 presets；`action=test` 会真实推理，不能拿来发现。保存连接的 `maxOutput=2000` 是当前产品保护值。
- [learning.api.js](../src/services/api/domains/learning.api.js)、[conversation-learning.js](../src/stores/modules/conversation-learning.js)：已有只读请求、owner／会话／取消保护与读取合并机制可复用；没有厂商模型元数据的完整来源、时间、TTL 合同。
- [learning-provider.ts](../laf-backend/functions/_shared/ai-providers/learning-provider.ts)：现有通用路径以 OpenAI 兼容聊天为主；存在 HTTPS、目标白名单、DNS／SSRF 及输出校验。不能由“兼容聊天”推定原生 models、Anthropic 或管理面接口均已适配。

## 2. 厂商、模型列表与能力来源核对

下面“当前模板型号”仅逐字记录本轮读取的源码，不推荐为最新／最强型号，也不修改它。正式接口列写的是文档中的请求形状，本轮没有发送这些请求。文档核查日期均为 **2026-10-24**；“未核实”不等于厂商没有该能力。

### 2.1 国内目录（14 家）

| 厂商 ID／当前模板型号                           | 官方模型列表 API 核查                                                                                                                                                                                                  | 能力元数据 API 或文档／已证实范围                                                                                                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deepseek`：`deepseek-v4-pro`、`deepseek-flash` | [官方 Lists Models](https://api-docs.deepseek.com/api/list-models/)：`GET https://api.deepseek.com/models`，文档已证实                                                                                                 | 同一响应声明 ID、上下文、输出上限、模态、effort 等；不是另一个能力 API。实际值／当前账号权限未取。                                                                                       |
| `zhipu`：`glm-5.3`、`glm-4.7-flash`             | 列表 API 未核实；拟查列表文档工具无法访问，见第 9 节                                                                                                                                                                   | 项目引用[模型指南](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3)；本轮未核其正文，不能照 OpenAI 路径猜 `/models` 或套用国际站事实。                                             |
| `dashscope`：`qwen3.8-max`                      | [查询模型列表](https://help.aliyun.com/zh/model-studio/list-models)：`GET /api/v1/models`；北京文档地址为 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/models`，已证实                                   | 同一接口有 `model_info`、能力、模态和定价字段；地域／业务空间必须匹配。不能在当前旧 `dashscope.aliyuncs.com/compatible-mode/v1` 后机械拼接这条新接口。                                   |
| `moonshot`：`kimi-k3.1-pro`                     | [官方模型列表页](https://platform.kimi.com/docs/models)已读；该页不是 models HTTP API，后者未核实                                                                                                                      | [推理强度](https://platform.kimi.com/docs/guide/use-reasoning-effort)明确 K3.1 Pro 顶层 `reasoning_effort` 三档及上下文传递要求；不是实时能力接口。                                      |
| `ark`：`doubao-seed-2.0-pro`                    | 官方索引给出 [ListFoundationModels](https://docs.volcengine.com/docs/ark/list-foundation-models-api?lang=zh)：管理面 `POST ...?Action=ListFoundationModels&Version=2024-01-01`，索引注明 Access Key 鉴权；正文工具超时 | 返回字段细节／当前推理 API Key 是否可发现未确认。不能把管理面 AK／签名需求当成现有推理凭据可用，更不能开通、激活模型或套餐。                                                             |
| `hunyuan`：`hy4-preview`                        | [TokenHub API 使用说明](https://cloud.tencent.com/document/product/1823/130078)：`GET https://tokenhub.tencentmaas.com/v1/models`，已证实                                                                              | 列表文档有 `id`／`name`／`status`；[模型列表文档](https://cloud.tencent.com/document/product/1823/130051)有上下文和输入／输出上限。独立能力 HTTP API 未核实；TokenHub 不等同旧混元域名。 |
| `minimax`：`MiniMax-M3.1-Flash`                 | [模型调用指南](https://platform.minimax.cn/docs/guides/text-generation)已读；独立列表 HTTP API 未核实                                                                                                                  | 指南列模型、上下文和 `effort` 档；能力自动查询接口未核实。国内／国际站、订阅／按量凭据不能互换推定。                                                                                     |
| `baichuan`：`Baichuan4-Turbo`                   | [官方 API 导航](https://platform.baichuan-ai.com/docs-v2/api)已读；未确认 models HTTP API                                                                                                                              | 该页仅导航／申请体验信息，不足以证明当前模板在线、上下文、输出或思考档；各字段未知。                                                                                                     |
| `siliconflow`：`Qwen/Qwen3-8B`                  | [官方快速上手](https://docs.siliconflow.cn/docs/userguide/quickstart)说明模型广场；本轮拟查 REST 文档 404，列表 HTTP 合同未确认                                                                                        | 官方[JSON 模式](https://docs.siliconflow.cn/docs/userguide/guides/json-mode)是能力文档，不是模型能力发现响应。不能据兼容声明猜完整参数／上限；`/user/info` 也不在本方案中调用。          |
| `modelscope`：`Qwen/Qwen3.8-27B`                | 项目引用[官方推理说明](https://modelscope.cn/docs/model-service/API-Inference/intro)；本轮未核正文，列表 API 未核实                                                                                                    | 社区仓库的模型卡／配置不自动代表该推理服务当前部署的参数、账号额度或支持的最高档；保持未知。                                                                                             |
| `qianfan`：`ernie-4.5-turbo`                    | [获取模型列表](https://cloud.baidu.com/doc/qianfan-api/s/Dmba8k71y)：`GET https://qianfan.baidubce.com/v2/models`，API Key 鉴权，已证实                                                                                | 同一响应文档含 ID、类型、`context_length` 等扩展；该上下文包含输入、输出和思维链。其他能力字段须逐字段核对，未核实的上限／档位不填。                                                     |
| `stepfun`：`step-3.7-flash`                     | [官方模型列表页](https://platform.stepfun.com/docs/zh/guides/models/list)已读；列表 HTTP API 未核实                                                                                                                    | 文档按型号给上下文／模态，Step 3.7 Flash 的推理档有文档声明；最高输出与具体请求参数映射未逐项核实，不凭网页标签生成参数。                                                                |
| `spark`：`spark-x`                              | 项目引用[官方 X1 HTTP 文档](https://www.xfyun.cn/doc/spark/X1http.html)；本轮未核正文，models API 未核实                                                                                                               | 不能把 X1 文档推定为 `spark-x` 的完整当前能力；具体型号／协议／最高档均待核。                                                                                                            |
| `yi`：`yi-lightning`                            | 项目引用[官方文档](https://platform.lingyiwanwu.com/docs)；本轮未核正文，models API 未核实                                                                                                                             | 当前可用性、能力 API、上下文、最大输出及思考档未确认；目录仍保留，不自动删除或替换。                                                                                                     |

### 2.2 其他目录（16 家）及已有定向路由

| 厂商 ID／当前模板型号                                                | 官方模型列表 API 核查                                                                                                                      | 能力元数据 API 或文档／已证实范围                                                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gemini`：`gemini-2.5-flash-lite`                                    | [Models](https://ai.google.dev/api/models)：原生 `GET /v1beta/models` 及 `/v1beta/models/{model}`，已证实；不是自动追加到 `/v1beta/openai` | 同一 Model 资源有输入／输出限制、支持方法和 thinking 布尔；具体思考档另依[兼容协议文档](https://ai.google.dev/gemini-api/docs/openai)，布尔不等于档位表。            |
| `groq`：`openai/gpt-oss-20b`                                         | [API Reference](https://console.groq.com/docs/api-reference)：`GET /openai/v1/models`、`GET /openai/v1/models/{model}`，已证实             | 文档示例分别含 `context_window`、详情的 `max_completion_tokens`；具体字段缺失时不补默认。gpt-oss 的 effort 支持集合见同页精确型号说明。                              |
| `openrouter`：`google/gemma-4-31b-it:free`                           | [当前 Models 文档](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties)：`GET /api/v1/models`，已证实 | 同一资源有上下文、价格、支持参数和 top_provider 上限；型号总目录不等于特定 provider 路由均支持，仍需精确路由证据。                                                   |
| `aion`：`aion-labs/aion-rp-llama-3.1-8b`                             | 项目引用[官方文档](https://www.aionlabs.ai/docs/)；本轮未核列表 API                                                                        | 兼容聊天入口不证明模型发现／独立能力 API，参数和额度未知。                                                                                                           |
| `llm7`：`codestral-latest`                                           | 项目引用[官方文档](https://docs.llm7.io/)；本轮未核列表 API                                                                                | 聚合服务自己的部署／路由能力需单独证据，不继承同名模型原厂上限和免费资格。                                                                                           |
| `zai`：`glm-4.5-flash`                                               | 已读[官方 Chat Completion](https://docs.z.ai/api-reference/llm/chat-completion)；未在本轮确认 models API                                   | Chat schema 不是独立能力列表；与国内智谱分开绑定端点、价格版本和型号，不相互套用。                                                                                   |
| `ollama_cloud`：`gpt-oss:20b`                                        | [List models](https://docs.ollama.com/api/tags)证实原生 `/api/tags`，示例是本地实例                                                        | 不能由本地 tags 推定 `https://ollama.com/v1` 云端 models／show 行为；云端列表与能力 API 本轮未核实，不接入用户本地模型服务。                                         |
| `mistral`：`mistral-small-latest`                                    | [Models Endpoints](https://docs.mistral.ai/api/endpoint/models)：`GET /v1/models`、`GET /v1/models/{model_id}`，已证实                     | ModelCard 文档有 `max_context_length`、capabilities；最大输出、effort、价格若未返回，仍需精确官方型号文档或保持未知。                                                |
| `nvidia`：`openai/gpt-oss-20b`                                       | 项目引用[官方 NIM API](https://docs.api.nvidia.com/nim/reference/llm-apis)；本轮未核托管 models API                                        | 自部署 NIM 与 integrate.api 托管目录不混同；单一聊天模板不证明通用发现协议。                                                                                         |
| `ovh`：源码只有 endpoint 目录，无连接预设                            | 项目引用[官方 AI Endpoints 目录](https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/)；本轮未核 models API                      | 网页目录、匿名调用、项目当前保险库接口能力是不同事项，不造假密钥或新增匿名鉴权分支。                                                                                 |
| `cohere`：`command-a-03-2025`                                        | 项目引用[官方兼容指南](https://docs.cohere.com/docs/compatibility-api)；本轮未核当前兼容路径的列表 API                                     | 原生 API 即使另有模型资源，也不能未经核实套到 `/compatibility/v1`；能力字段未知。                                                                                    |
| `huggingface`：`meta-llama/Llama-3.1-8B-Instruct`                    | 项目引用[官方 Inference Providers](https://huggingface.co/docs/inference-providers/tasks/chat-completion)；本轮未核 router 的列表 API      | Hub 仓库列表／config 不等于某推理 provider 的部署能力、可路由性和费用。                                                                                              |
| `cloudflare`：源码只有含 `{account_id}` 的 endpoint 目录，无连接预设 | 拟查官方 API 页面工具无法访问，见第 9 节；当前列表 HTTP 合同未确认                                                                         | 项目已有[OpenAI 兼容文档引用](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/)不能证明发现权限；不读取账户路径或扩大 token scope。 |
| `kilo`：`kilo-auto/free`                                             | 项目引用[官方 Gateway 指南](https://kilo.ai/docs/gateway/models-and-providers)；本轮未核列表 API                                           | 自动路由名不代表稳定单一模型和固定能力；provider／actualModel／免费条件须精确绑定。                                                                                  |
| `cerebras`：`gpt-oss-120b`                                           | 本轮官方公开检索未取得可靠的 models API 文档；保留项目[OpenAI 兼容指南引用](https://inference-docs.cerebras.ai/resources/openai)           | 不用 MCP／迁移教程或其他型号文档推定 models 返回字段；独立能力接口及最高档未知。                                                                                     |
| `sambanova`：`Meta-Llama-3.3-70B-Instruct`                           | [官方 VS Code 接入指南](https://docs.sambanova.ai/docs/en/integrations/vscode)只给聊天接入；未核当前云端 models API                        | 检索取得的 SambaStudio Model Hub 属另一产品，不能代替 `api.sambanova.ai/v1` 的云端发现合同。                                                                         |
| Agnes 定向路由：`agnes-2.5-flash`                                    | 不在上述 30 家目录；现有精确参数分支／历史故障回执存在，当前绑定未检查；官方列表 API 未核实                                                | 本轮不使用新来源或探测该服务；`enable_thinking=true` 是已有精确映射，不证明最高档、模型能力或当前免费资格。                                                          |

## 3. 已证实的字段映射与仍未知的部分

以下均是官方文档结构，不是本轮账户返回值；文档示例的型号、token 数和价格不抄成运行时事实。其余厂商没有逐字段证据时全部 `unknown`，不能由兼容协议、模型名称或模型大小推导。

| 来源                                                                                                          | 可按原语义投影的字段                                                                                                                 | 不能推定的内容                                                                                                      |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| [DeepSeek models](https://api-docs.deepseek.com/api/list-models/)                                             | `data[].id`；`context_window` 是输入＋输出总上下文；`max_output_tokens`；输入／输出模态；`effort.supported_levels`／`default_level`  | 推荐展示顺序不自动当成所有型号统一强度排序；价格／账户赠额没有因此确认。                                            |
| [百炼 models](https://help.aliyun.com/zh/model-studio/list-models)                                            | `output.models[].model`；`model_info.context_window`／`max_input_tokens`／`max_output_tokens`；思考相关上限、能力、模态、分段 prices | 文档的 null 可有“不适用／无限制”口径；Yozi 不能自动解释为无限预算，应保存未知／不适用原因并停用依赖它的最高档调用。 |
| [Gemini Model](https://ai.google.dev/api/models)                                                              | `name`／`baseModelId` 保留各自语义；`inputTokenLimit`、`outputTokenLimit`、`supportedGenerationMethods`、`thinking`                  | 输入限制不能重命名为输入＋输出总上下文；thinking 布尔不能生成 effort 集合。                                         |
| [Groq API](https://console.groq.com/docs/api-reference)                                                       | 精确 `id`、列表可见的 `context_window`、详情实际返回的 `max_completion_tokens`                                                       | 示例字段不保证每个型号都有；具体 effort 集合按型号文档，不能取全站参数枚举的并集。                                  |
| [OpenRouter models](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties) | `id`、`context_length`、`architecture`、`supported_parameters`、`pricing`、`top_provider.max_completion_tokens`                      | 顶层能力／top_provider 上限不代表任意 provider 路由；未确认精确路由时最高档仍不可自动放行。                         |
| [Mistral ModelCard](https://docs.mistral.ai/api/endpoint/models)                                              | `id`、`max_context_length`、`capabilities`                                                                                           | 不能用上下文数作为最大输出；缺失的 effort／价格不补默认。                                                           |
| [腾讯 TokenHub](https://cloud.tencent.com/document/product/1823/130078)                                       | 列表的 `id`／`name`／`status`；静态能力取对应[官方型号表](https://cloud.tencent.com/document/product/1823/130051)并记录文档来源      | `online` 不证明账号已开通、还有免费额度或取得最高思考参数。                                                         |
| [千帆 models](https://cloud.baidu.com/doc/qianfan-api/s/Dmba8k71y)                                            | 精确 `id`、`type`、`context_length`，其中总上下文包含思维链                                                                          | 其他字段本轮未逐项核实，不按相似字段名猜最大输出／思考档。                                                          |

## 4. 每个模型、每个字段的来源合同（提案）

每个模型以 **厂商＋精确服务地域／协议／端点＋精确 model ID** 标识，不能只按名字合并。聚合 provider 路由、版本别名和原生快照不同则分开。`latest`／自动路由可能漂移，只记录观察时版本，不能重写用户选择。

每个下表字段必须单独带 `value`、`state`、`sourceKind`、`sourceUrl`、`sourcePath`、`observedAt`、`sourceUpdatedAt`、`expiresAt` 和适用协议／型号／地域。日期用带时区的时间；缺少文档更新时间写 null＋原因，不能把抓取时间冒充发布时间。来源 URL 只用允许的官方公开文档／既有核准 API 路径，不含凭据、账户标识、query 秘密或任意厂商返回跳转。

| 模型字段                              | 类型／含义与未知处理                                                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelId`                             | 精确、区分大小写的 ID；提案最长 256 个 ASCII 字符，不 trim／改名后自动调用。来源为实际 API 的 ID 或明确官方型号文档；模板值另标 catalogue。                 |
| `displayName`                         | 可选纯文本，提案最长 128 字符；只供展示，不代替 ID、不执行 HTML。                                                                                           |
| `availability`                        | `listed`／`unlisted`／`unknown`；只描述该来源，不能改成账号“已激活”。                                                                                       |
| `contextWindowTokens`                 | 有限正安全整数或 null；仅在文档明示总上下文语义时填。                                                                                                       |
| `maxInputTokens`                      | 有限正安全整数或 null；与总上下文独立。                                                                                                                     |
| `maxOutputTokens`                     | 厂商／精确协议允许的响应上限，有限正安全整数或 null；绝不以产品 2000 填充。                                                                                 |
| `maxReasoningTokens`                  | 厂商明示的推理 token 上限或 null；不能由最大输出减法推断。                                                                                                  |
| `inputModalities`／`outputModalities` | 从官方枚举投影的有限集合；未知不装成仅文本或全部支持。                                                                                                      |
| `supportedParameters`                 | 精确协议／型号的允许参数名与适用范围；未知不附加。全站 Chat schema 的参数并集不能直接复制到单模型。                                                         |
| `reasoningLevels`                     | 厂商原生枚举及正式映射，保持原大小写／顺序；布尔 enable 不构造等级。                                                                                        |
| `highestReasoningLevel`               | 只有正式文档明确强度次序／最高值且精确协议适用时赋值；否则 null，即使列表顺序看似从低到高。                                                                 |
| `reasoningParameter`                  | 官方请求字段路径、值类型、互斥条件和支持范围；不传模型不支持的 `max`、`xhigh` 或其他厂商字段。                                                              |
| `pricing`                             | 有来源的币种、计费单位、输入／输出／缓存／推理与分段价格；未知分量为 null。零价格须精确型号／路由／有效期证据，不能因名称含 free 或历史 settled0 自动赋零。 |
| `freeQuota`                           | scope、适用精确型号／地域、剩余额度与单位、有效期、证据时间；本轮全为未知。公共赠额说明不证明该账户已经领取、未过期或仍有余额。                             |
| `verifiedInference`                   | 只引用既有、合法且仍适用的正常调用回执状态；发现动作不生成此事实，本轮不刷新。                                                                              |

字段状态提案：`known`、`unknown`、`not_applicable`、`stale`、`conflict`。未知／不适用均显式展示其原因；不把 null 静默转成 0、false、无限制或默认高档。厂商单位“k／M”不明时保留未解析状态，不能擅用 1000／1024 换算。

可信层次提案：`unknown` → `local_catalogue` → `official_document` → `official_api_observed`。这只是元数据证据等级；真实推理回执是另一条事实，不作为解锁字段。当前只有文档可标 `official_document`，没有本轮 `official_api_observed`。

当同一精确部署的 API 与文档冲突时保留两个来源、标 conflict，停止依赖该字段的最高能力调用并交主线；不静默取较大值或较小值掩盖冲突。API 不提供的字段可用精确官方文档补充，必须各自有来源／日期，不能谎称整条记录来自 API。

## 5. 最小只读接口接缝（未实施提案）

建议在现有 `POST /learning-models` 增加明确的只读子动作 `action=discover`，而不是改变 `list` 默认行为或借 `test` 探测。主线／Claude可否决该动作名；当前服务不具备它，不得先调用。

请求只允许现有 `profileId`、可选精确 `modelId` 和明确刷新意图，不接收 apiKey、token、任意 endpoint／URL、owner、厂商控制面 action 或自由 HTTP headers。服务端经正常会话定位 owner 的既有 profile，再确认配置版本、端点、地域、适用协议和发现授权；不能仅凭模板发现他人连接。

未来获准实施时，只有既有受控后端可在已批准范围内短暂使用原保险库绑定，不保存新凭据、不把凭据／keyRef／散列回前端或日志。若发现所需 host、路径、鉴权种类、权限或地域超出现有绑定，返回 unsupported，不新索要 AK／密钥、不改安全白名单、不自动换站点。本文不确认当前工具具备取用秘密能力，也不授权本轮取用。

厂商只读调用放在现有 provider 模块的有限显式分支，与 `callLearningProvider` 的推理 POST 分开；复用现有 HTTPS／SSRF／DNS／允许目标检查、超时与取消，不建设通用 adapter、服务、状态库或插件框架。只准已核实的 GET 列表／详情。方舟管理面只读 POST 如需 AK／签名，应先返回 `UNSUPPORTED_DISCOVERY_AUTH`，另待主线与 Claude 裁决，不把 POST 一概当推理或一概当安全查询。

响应提案沿现有 code／success 形状，额外包含有限 `models` 投影、每字段来源、`complete`、`fetchedAt`、`cacheState` 和固定错误码。来源不可用不返回伪造空列表；无模型、无权限、读取失败、部分分页是不同状态。页面只能更新发现候选，不写 profile、当前 modelId、连接状态、预算、价格配置或用户选择。

客户端若将 discover 列入只读调用，须沿既有会话／owner／epoch、配置版本、取消和迟到守卫；这是待审接线，不是当前代码。连接删除、换号、撤销或版本变更后到达的结果丢弃，不恢复旧模型或旧权限。

## 6. 最高档参数与输出／费用边界

| 已读官方事实                                                                                                                                                  | 本草案约束                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [Kimi K3.1 Pro](https://platform.kimi.com/docs/guide/use-reasoning-effort)文档明确顶层 `reasoning_effort` 为 low／high／max；并要求相关多轮上下文保留推理字段 | 仅适用于该精确型号与协议。保留／回传隐藏推理涉及现行隐私和上下文合同，必须另交主线／Claude裁决；不为最高档新增隐藏推理持久化。 |
| [MiniMax-M3.1-Flash 指南](https://platform.minimax.cn/docs/guides/text-generation)明确 `effort` 有 low／medium／high／xhigh／max                              | 不改名为通用 `reasoning_effort`，也不把这组枚举套到其他 MiniMax 型号／国际路由；具体协议路径须核准。                           |
| [Groq Chat](https://console.groq.com/docs/api-reference)对 gpt-oss 精确声明 low／medium／high                                                                 | 不能因全站 schema 有 max／xhigh 就对 gpt-oss 发送它们。                                                                        |
| [Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)按型号系列映射 effort 到 thinking level／budget，并有互斥条件                      | 原生能力与兼容协议档位分开；不能同时附上两套互斥配置，也不推定所有 Gemini 都可关闭思考或支持 max。                             |
| 现有源码对若干精确路由有 thinking／enable_thinking／reasoning 映射                                                                                            | 它们是已有局部分支，不能升级为所有厂商的最高档合同；现有路径本轮不改。                                                         |

选择最高思考档不等于使用最大输出预算，不等于选择上下文最大的型号，更不等于厂商质量排名。没有正式强度次序时返回 `HIGHEST_LEVEL_UNKNOWN`，不能按字符串排序、发布日期或模板中的 flagship 字样自动选择。

拟执行调用必须分别满足：精确型号／协议支持、上下文余量、输出／推理 token 约束、当前产品预算、已批准免费额度与期限、既有数据共享授权。输出 token 是否包含 reasoning 依厂商定义，不明则停止依赖该关系的计算，不能假定二者独立。

若“最高能力”要求与已批准免费额度／产品预算冲突，**该次调用停止并回主线**，不静默降 effort、把最大输出截到 2000、切同名便宜／付费路由、改变上下文或推定赠额无限。只有主线另行明确变更需求／预算，才能考虑不同方案；本草案不新增预算 UI 或收费能力。

当前 2000 是产品保护值，保持不变；厂商即使允许更高也不能自动上调。缺价格、额度、适用范围或有效期时不新发推理；公共零单价也不证明无限 RPM／TPM／并发。只读元数据操作本身是否计费同样须在未来请求前核实，不能因为不是推理就认定免费。

## 7. 缓存隔离、失效与有界读取（数值均为提案）

只复用现有读取合并机制与进程内缓存，不新增持久缓存、配置文件、集合、状态库或定时轮询。进程重启可丢弃元数据，不影响原连接与选择。公共文档映射随现有代码／文档审阅更新，不能在运行时任意抓网页解析后直接生成推理参数。

| 提案                                                                                | 原因／失效条件                                                                                             |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 动态列表／详情缓存 5 分钟；文档映射最迟 24 小时标待复核                             | 限制失效元数据使用与重复请求；不是价格／额度有效期保证。每字段另受其更早 expiresAt／下线时间约束。         |
| 缓存键含 owner、现有会话代数、profileId、配置版本、厂商／地域／协议、精确模型和路由 | 账号专属模型列表不得跨账号共享；不使用或外传密钥散列作为新缓存标识。                                       |
| 相同键合并一个在途读取；用户明确刷新之间至少 60 秒                                  | 复用现有 promise 合并，不新增轮询／重试循环；失败不触发推理。                                              |
| 单次响应累计最多 2 MiB、1000 条、20 页，每页／全次均受既有取消与总计 10 秒约束      | 防止拉取无界目录；先触及任一限制返回 incomplete／limit，不把被截断目录当完整。不是允许发满这些请求的授权。 |
| 至多按当前连接建立一个元数据快照；总进程缓存提案 1 MiB，满额先释放最旧失效条目      | 有限内存复用；淘汰元数据不删除 profile／型号选择，不额外落盘。                                             |

凭据绑定轮换／撤销、profile 保存／删除、owner／epoch 变化、端点／地域／协议变动、配置版本改变立即失效相关缓存与在途结果。401／403 不换凭据重试；404／410 标该资源不再可确认；429 尊重既有固定冷却，不切路由；网络失败可展示上次快照但必须 stale，不用它通过新最高档／免费准入。

文档发布更新时间、HTTP 获取时间、API model.created 和实际能力变更时间不可混用；只知道其中一种时其余保持未知。缺字段不由同厂商另一个模型、国内外镜像或别的聚合 provider 补齐。

## 8. 失败语义与日志（未实施提案）

| 固定状态／错误类别                                        | 行为                                                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `AUTH_REQUIRED`／`SESSION_UNAVAILABLE`／`CONTEXT_CHANGED` | 不发送厂商请求；不登录、不造会话、不展示旧 owner 结果。                                      |
| `UNSUPPORTED_DISCOVERY`／`UNSUPPORTED_DISCOVERY_AUTH`     | 官方接口或既有鉴权不适用，保持 unknown；不猜路径、不索要新凭据、不用 test。                  |
| `METADATA_PARTIAL`／`METADATA_LIMIT`                      | 保留字段级已证事实与 incomplete 标识；缺字段／页不装默认，不自动用部分列表选“最强”。         |
| `METADATA_UNAVAILABLE`／`RATE_LIMITED`／`STALE`           | 保留原连接／选择，显示固定状态；不回传厂商 error.message／stack／headers／body，不自动重放。 |
| `METADATA_CONFLICT`／`HIGHEST_LEVEL_UNKNOWN`              | 记录最小来源冲突，停止依赖该字段的最高能力调用，回主线裁决。                                 |
| `BUDGET_OR_FREE_SCOPE_CONFLICT`                           | 停止该次调用；不充值、降档、改预算或回退。                                                   |

非法类型、未知 JSON 结构、循环分页、任意跳转／外部链接、超限和非允许端点均拒绝相关元数据；不保存原厂响应、隐藏推理或自由错误文本。日志只用固定事件码、有限字段状态与数量，不记录用户身份、秘密、含账户路径的 URL、完整对象或请求／响应原文。新增诊断持久化另受[草案A](DRAFT-DIAGNOSTIC-PERSISTENCE-CONTRACT-20261024.md)约束；B 不成为另一条采集渠道。

## 9. 公开资料核查边界与失败记录

以下均是公开文档读取，无凭据或鉴权请求；没有改用浏览器／curl／私有接口绕过工具访问限制。

| 动作与精确目标                                                                 | 结果／处理                                                                                                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 打开 `https://docs.bigmodel.cn/api-reference/模型管理/模型列表`                | 工具报告 URL 不可访问；该拟查页不足以证明列表 API，未继续猜路径或换工具。                                                       |
| 打开 `https://openrouter.ai/docs/api-reference/list-available-models`          | HTTP 404；随后正常公开官方搜索找到当前文档，工具正常跟随官方重定向至本稿所引 canonical URL。不是实际调用 models，也未绕过鉴权。 |
| 打开 `https://docs.siliconflow.cn/cn/api-reference/models/get-model-list`      | HTTP 404；本稿不据此假定 `/v1/models` 可用，列表 HTTP 合同仍未确认。                                                            |
| 打开 `https://developers.cloudflare.com/api/resources/ai/methods/models/`      | 工具报告 URL 不可访问；未换工具／读取账户，保持未确认。                                                                         |
| 打开 `https://docs.volcengine.com/docs/ark/list-foundation-models-api?lang=zh` | 工具正文抓取超时；只保留已取得的官方索引信息，不把索引当完整字段核验。                                                          |

其他未核实行仅有明确标注的项目官方引用或有限公开文档；未穷尽整个厂商网站，不能写成“厂商没有 API”。本轮文档取得日期不是实际 API 响应时间；未访问任何用户额度／套餐页面，也未验证模型名是否出现在某账户列表。

## 10. 交主线与 Claude 的最小待决问题

1. 是否采用现有 `/learning-models` 的独立只读 discover 子动作，及现有会话／owner／迟到保护的最小接线；默认 list／原连接／选择不变。
2. 首批允许哪些已核实且与现有绑定鉴权／地域匹配的厂商；未核实、管理面 AK 或需新增安全权限的项保持 unsupported，不扩成通用 adapter。
3. 是否批准字段级来源／未知／冲突语义和上述缓存／读取上限提案；哪些精确最高档映射具有足够官方证据，哪些仍须明确裁决。
4. 最高能力与免费／预算冲突如何由主线决定，以及涉及隐藏推理上下文的协议能否满足现行隐私合同。未裁决就停止相关调用，不能由开发者静默降档或扩张记录。

审阅完成前，本稿不触发任何实现或发现操作。仅两份草案与现有 STATUS 链接属于本轮写入；不修改认证、生产配置、供应商选择、预算、模型参数或业务代码，不测试／构建／部署／清理，不将草案交付当成模型接通、最高档可用或真实教学通过。
