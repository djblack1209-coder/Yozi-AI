# 后端运行合同

## 2026-10-23 三文件诊断增量

现网已沿既有 `vpsctl maintain-files` 新事务 `9393ad6b4ff243278a108cd33e83f700` 于北京时间22:18:15 accepted，Mac独立watcher返回accepted／verified=true。当前release为 `/opt/vps-config/releases/exam-master/0f0738d4e412e0d3`，PID639252、`/usr/bin/node`20.20.2、127.0.0.1:3002；原ec3 release、共享d77依赖和Mac恢复材料保留。归档136文件中仅learning-account、proxy-ai、learning-models三个诊断模块变化（29增／6删）；服务控制文件只改两处release路径，没有发布本地dev/test放宽逻辑或其他在研源码，没有迁移数据库或更改凭据／安全配置。
实际运行文件回读匹配，listener／cwd／health／entry与回环鉴权／CORS检查通过。正常API会话已在本机QA读回原COACH_INVALID，但旧字段未留存；这不构成生产真实模型失败字段或完整教学验收。额外匿名公网探针在开启事务前返回Cloudflare403，未产生事务或服务变化；随后回到原已验收的受保护合同，公网403继续单列，未重试被拒请求、绕过访问控制或改Cloudflare规则。归档、源码差异、事务、回滚及QA记录见[既有交接](../tmp/cleanup-experience-a/dev-test-build.log)。

## 2026-10-21 已授权的国内学习接口上线

候选 `b07890f2a26a893aeddf51147ba5605f4910df2e91801e63dced50f1bcf2e1ec`，136 文件；沿既有 VPS-Config 事务暂存 `ee6d52cd19bd4645bc44efc7b82cbf5b`，正式切换 `1b69787a7584451b9ec9c106d103422c`，均 accepted / verified。`yozi-learning` 仅监听 127.0.0.1:3002，HTTPS 学习路由进入新版本；旧 `exam-master` 停止并保留回滚，JWT、账户库与私有保险库配置保持，收费／短信／默认平台调用关闭。

Mongo 官方逻辑备份已实际恢复到隔离命名空间，并逐项核对文档及索引，恢复材料由既有独立观察者保存于 Mac 私有恢复区。首次全库物理归档传输超时已回退，未切公网；改用已实际恢复核验的逻辑备份完成。新真实账户或学习写入会阻止破坏性数据回退。公网密码登录、鉴权、精确 tauri 来源、账户隔离、错答、幂等同步和 model-intake-v1 均通过；线上免费模型两次首问／法硕档案确认与同步通过，密钥撤下，费用各为 0。此项不代表真实用户 OAuth、邮件、手机或全科教学质量已验收。

## 可信代理与客户端 IP：本地修复、待授权上线（阶段7A）

仓库腾讯拓扑是**宿主机 Nginx → 127.0.0.1:3001 发布端口 → Docker bridge 后端:3000**，不是容器 Nginx。历史 Compose 动态网关不能推断固定来源；本次为 exam-net 显式配置 `172.30.87.0/24`、网关 `172.30.87.1`，并给 backend 默认设置 `TRUST_PROXY=172.30.87.1/32`（Compose 启动 shell 或 --env-file 可覆盖，backend 的 env_file 不覆盖该插值项；显式空值仍拒绝），只信任宿主经发布端口进入容器的网关，不信任整个容器网段。现存网络不会自动按新 IPAM 重建，部署时必须先核实网络冲突与实际 socket 对端；本次未连接服务器、未证明实际 Docker/NAT 来源。

standalone 原生/PM2 默认 `TRUST_PROXY=127.0.0.1/32,::1/128`，适用于宿主 Nginx 到宿主后端。环境变量支持 Express 的逗号分隔地址、CIDR 和 loopback/linklocal/uniquelocal 别名（后两种通常过宽，应明确列地址）；`false` 关闭代理信任。空串、非法地址/网段、数字跳数、true 信任全部均在监听前拒绝启动。多代理仅逐个列实际受控出口；遇第一个未受信地址立即停止，直连不读来路转发链。

两份 Nginx 配置共7处代理全部使用 `proxy_set_header X-Forwarded-For $remote_addr;` 与 `proxy_set_header X-Real-IP $remote_addr;`。exam 443 的 `/exam-master/` 与函数路径一跳直达 `yozi_ai_backend`，不再经 `127.0.0.1:8080`；新增前缀块与 api 443 保持相同的 rewrite、连接级限流、覆盖头、SSE、超时与重试配置，8080 server 保持原样。80 域名入口重定向 HTTPS，80 default 的前缀请求仍返回404。当前没有受控 CDN real_ip 白名单，不把 CF/True-Client 头解释为用户地址。Worker/Cloudflare 等外层若存在，限流身份就是 Nginx 连接对端，可能聚合用户；未来需要独立设计受控边缘来源和覆盖合同，不能临时信任任意 CF 头。

授权上线顺序（本轮只改仓库）：

1. 私下保存匹配的代码、环境、Compose/网络 inspect 和两份 Nginx 前态，核验恢复；不要在报告或普通备份中收集凭据/IP 请求日志。检查现有网段与 `172.30.87.0/24` 是否冲突；冲突时选未占用网段，并同步网关 /32。已有网络需安排维护窗口，不能以本地修复作为重建线上网络的授权。
2. 隔离候选按实际部署方式设置 TRUST_PROXY。用临时、受保护且结束即移除的诊断确认 Nginx 到后端 socket 对端恰为白名单地址；Docker 转发实现若不同，精确调整 /32 或 /128，不能扩大为 hop count 或全内网。确认后端仍只发布回环端口；核验实际采用 docker-proxy 还是 iptables 转发，并验证同网 NET_RAW/ARP 伪装风险，不能以网关 /32 白名单推断其他容器不能冒充网关。
3. 核对 exam 443 新增 `/exam-master/` 直达后端块与 api 443 同名块一致，前缀和函数路径都不经8080；8080 保持不变。`nginx -t` 通过后，按既有受保护事务原子应用候选和代理配置；真实直连伪造头不变、代理覆盖头、IPv4/IPv6 与多来源限流、登录回退、邮件计数/记录、OAuth 轮询均须后检。不新增公开诊断路由或 IP 日志。
4. 新身份会使部分旧限流桶失去命中：登录 HMAC 算法/密钥保持，但输入归一或旧伪造头对应的桶会变；其他 IP 桶、邮件小时统计亦可能分段，相当于部分额度重置。保持 Nginx 连接级限流，在限流窗口内关注聚合错误与异常请求，不清空旧记录/计数、不回写历史 client_ip。
5. 失败由独立回滚者恢复匹配的代码、环境与 Nginx/网络前态，再验业务。exam 443 的新增 `/exam-master/` 块属于配对代理配置，回滚须显式核对其去留及前缀路由；优先保留一跳直达及覆盖头，避免再次经8080聚合。**恢复旧版本会重新引入头部信任缺口**；优先保留覆盖 XFF 的边缘配置并将后端限制为宿主入口。若必须回退旧追加头配置，先限制公网访问，不能把恢复旧漏洞作为安全验收。此修改不迁移业务数据，不重置计数或密钥。

四份本地未跟踪 env 的 `VITE_API_BASE_URL`、未跟踪的 Laf 应用 `invokeUrl`，均指向 `nf98ia8qnt.sealosbja.site`；CI 仅保留条件触发的冷恢复任务。托管是否在用尚未核验，本轮不联网。此为配置事实，不能据此断言实际客户端流量或当前托管运行状态。

**此版本不得部署到 Laf 托管**。已装的 laf-cli 类型声明 `ctx.socket` 为 WebSocket；合成的 HTTP 上下文仅有 `ctx.request.socket` 时，共享 IP 函数无法取得有效来源，会让依赖 IP 的函数返回503。托管运行时下 `ctx.socket` 是否必然为空，尚未实证；上线前须先完成可信入口适配和验收，不能改回信任转发头或 `ctx.request.ip`。

本修复只在授权部署到 standalone/腾讯路径后才生效。若仍有客户端连到 Laf 托管上的旧函数，那里的旧漏洞不受本修复影响。不恢复退役 lafService。

## 学习同步的发布与回滚顺序

学习同步后端须先于客户端发布。阶段5S新增的计划安排时区只在新客户端 + 新服务端组合下保留；新客户端连接本改动前的旧服务端时，旧服务端忽略 `data.timezone`，可能按当前同步时区重建计划。这是分批部署或回滚窗口中的既有兼容限制，本轮未实现协议能力或版本握手。后端若要回滚到本改动之前，先回滚或停用新客户端，再按既有受保护恢复合同处理后端和匹配的数据前态；不能把单端发布、健康检查或本机同版本测试当作混合版本验收。

## 2026-10-03：网站与桌面增量的受保护准备

**事实**：沿已授权方案，当前网站/桌面编译后端已在腾讯受保护地暂存，并完成私有空主库的限定迁移与独立回退。网站身份约束、默认关闭的桌面接续及独立短期保留合同均已纳入；这项准备没有切换公网入口或完成真实第三方授权。客户继续按[15](15-MANUAL-SETUP-GUIDE.md)办理平台资格与私有配置位置，无需手工修库。

既有维护程序采用 `wenli-backend-stage-v2`，绑定全部 118 个归档文件指纹、前批八项已接受回执的原始哈希及完整前态；新回执按完整候选哈希独立保存，拒绝覆盖旧记录。Mongo 9.0.2 显式返回的默认 `collation:{locale:'simple'}` 与未显式返回兼容，其他排序/额外选项仍拒绝；冻结的原索引 metadata 保持原样核对。限定迁移分别调用九项 `user-identities` 与独立 `desktop-oauth`，不调用全量迁移。

相关四组 163 项、代码检查、后端类型/构建及 27/27 原生入口加载通过。当前不可变归档 SHA256 `ed01db1676928b23a90714a19498da058e11c055570c4f759995d1dd19c7a18e`，118 文件 / 244,280 归档字节；实际本机认证 Mongo 8.2.5 验证旧八项保留、网站重复拒绝/跨应用独立、短期索引重复执行、真实过期清理与有限恢复，并启动实际归档验证登录、来源、错答、账户隔离和同步幂等。合成缺配置探针等待实际限流到期后再请求，没有重置限流。临时库/用户/进程及约 4.20 MB 已分配临时目录清理。

**服务器实际回退与接受**：维护程序更新事务 `645a62f1390048099422a02257a125cf` 接受并验证。候选事务 `a8d4c03ce8b740569dfdf70f90f8366c` 主动使后检失败，独立观察者确认旧归档恢复及本批候选资源回收；正式暂存 `807d51dfc37a49998323f00237a71ac4` 随后接受。腾讯 Mongo 9.0.2 隔离候选实际验证九项身份与短期索引的创建/删除/幂等、密码登录、鉴权、精确 Mac 来源、错答、账户隔离及同步幂等，供应商/模型调用为零。

主库事务 `d834c69336a742faae9cf68b0dee1de8` 主动后检失败后，独立观察者只撤销本批网站身份索引及新建空短期集合，恢复前批十项用户索引与完整前态。正式事务 `50f6a5c5f3a14c4ba4147c7cd63c9c98` 随后 `accepted/verified=true`。独立只读后检确认 users 为零、原两项加九项身份共十一项用户索引；`desktop_oauth_sessions` 为零记录，只有 `_id_` 与 `idx_desktop_oauth_expiry` 两项。当前 118 个源文件字节匹配本地归档，前批八项回执与私有恢复材料字节/权限保持，旧 PM2 PID 5931 与入口/配置保持；临时事务、账户、库、候选监听及执行/观察进程均收尾。后检清单字段预期按实际归档格式校正，没有改服务或数据库迁就检查。

[候选与本机验证](../tmp/visual-build-20261001/backend-website-desktop-20261003/backend-candidate.json)，[候选回退](../tmp/visual-build-20261001/backend-website-desktop-20261003/candidate-rehearsal.json)，[主库回退](../tmp/visual-build-20261001/backend-website-desktop-20261003/primary-rehearsal.json)，[正式迁移](../tmp/visual-build-20261001/backend-website-desktop-20261003/primary-accepted.json)，[独立后检](../tmp/visual-build-20261001/backend-website-desktop-20261003/live-postcheck.json)。

**未验证**：真实网站应用审核/回调、桌面成功领取的完整原生观察、外部客户端来源、公网原子切换及对应生产包业务后检仍未完成。原 UI/UX、正式 Mac 包、依赖与模型保持；本批仅后端与维护合同变化，未重复构建前端或 Rust。后续继续下述既有保护方案，不绕过客户端禁止访问，也不以私有准备解除公共题库门禁。配置见[04](04-API-DOCUMENTATION.md)、[05](05-DATABASE-SCHEMAS.md)与[15 附录](15-MANUAL-SETUP-GUIDE.md#附录工程对应与现有材料)。

## 2026-10-02：现网差异与受保护上线候选

**事实**：通过 VPS-Config 既有 `server-tencent` 资产和 SSH 别名只读核对，PM2 的 `exam-master` 仍运行 `/opt/apps/exam-master/backend/standalone/server.js`，旧入口 SHA256 为 `9ed16baa80dd2241505c7347ceb1d51502f80b324bb453e7c801307984fc1c8c`。回环健康入口返回 200，`/learning-models`、`/learning-sync` POST 返回 404，桌面来源预检没有许可；旧进程监听全部地址。JWT、Mongo 和 QQ/微信配置字段已存在，新学习保险库与上游许可字段未配置。Node 24.14.1 满足本地后端运行要求。

**事实与判断**：公网脚本探测 exam/api 域名返回 Cloudflare 403，进一步一次只读 API 健康请求收到 1010，对应客户端浏览器特征被拦截，[Cloudflare 官方说明](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/)。这解释该脚本请求失败，不能据此认定所有浏览器或原生客户端被拦截；实际客户端路径、具体生效规则仍待核对。域名代理到既有 Tunnel，本轮没有改 DNS、Tunnel、WAF、Access 或来源保护。

新版候选在本地构建并对实际归档解包启动：117 文件 / 243,683 字节，SHA256 `d77e02cd955d06dcab07aca46725e2d399801c5dc35f3523ef8b719f795d4f7f`。入口 `dist/standalone/server.js`，含现有锁、应用环境示例和 PM2 配置，不含真实 `.env`、模型目录、依赖副本或凭据。27/27 原生入口加载通过；实际归档在回环监听，未认证学习请求被拒绝，`tauri://localhost` 精确来源回执通过。另一次隔离 Mongo/当前后端的 Groq 学习与同步范围见[14](14-MODEL-PRIVACY-COST.md)。[候选清单](../tmp/visual-build-20261001/resume-live-dbe9f2dc/backend-candidate.json)与[解包验证](../tmp/visual-build-20261001/resume-live-dbe9f2dc/backend-candidate-validation.json)不构成生产部署。

**客户已授权**按本方案升级腾讯主机问理后端及必要配置，接受短暂后端维护窗口，不新增付费资源。授权范围按以下顺序执行，任一步前提不成立则不切换：

1. 重新读取 VPS-Config 当时运行合同与资产前态，核对旧 PM2 入口、实际 Mongo 命名空间、环境和入口代理，不用开发 DB 名称/示例值覆盖生产；保护现有 JWT 和第三方配置。
2. 在受保护位置保存旧代码、进程/代理配置和数据库前态，凭据按私有恢复合同保管；先证明隔离恢复可用，建立独立回滚执行者。新学习压缩封装可能不被旧程序读取，回退须有匹配的数据前态，见[09B](09B-BACKEND-MIGRATION-GUIDE.md)。回滚窗口内控制新增写入，避免恢复覆盖新事实。
3. 在受保护服务端配置新保险库主密钥、实际数据库和精确 `ALLOWED_ORIGINS`；批准 Groq 时 `LEARNING_ALLOWED_ORIGINS` 只允许其真实 HTTPS origin。免费目录原文件不上传、不进入备份，密钥只经既有加密入口保存，平台收费保持关闭。
4. 候选先用回环端口和独立测试命名空间，不接管公网，验证密码登录、甲乙隔离、来源重建、幂等同步和预算；用实际浏览器/安装版核对公网来源与预检，脚本 1010 不作为关闭全站保护的理由。
5. 原子切换本项目入口，独立观察者做真实业务后检，失败恢复入口与匹配的数据前态。健康 200、PM2 online 或备份文件存在均不足以接受。客户端使用授权可达的 `VITE_API_BASE_URL` 重建，再验对应包的生产登录/同步。

**授权后复核的事实**：旧 PM2 使用 Node `--env-file` 加载私有配置，配置内 Mongo 指向 `127.0.0.1:27017/exam-master`；实际认证探针连接被拒绝，没有 Mongo 监听、相关服务、Docker 容器或卷，数据库及资料存储目录不存在。项目专用备份没有业务数据库快照，旧 domestic 快照业务集合和记录均为零。客户随后明确授权新建私有账户与学习数据库，公共题库继续受独立发布门禁约束；新库不作为旧账户、历史或权威题库的恢复。

**已接受的私有准备**：既有 VPS-Config 受保护事务 `40240342010b443c8239e08e8bf17614` 已由独立观察者接受，`verified=true`。当前官方 Mongo 固定镜像仅绑定 `127.0.0.1:27019`，私有配置、数据和候选源码独立保存；原 PM2 入口、环境及公网代理未切换。主库认证成功，实际只有 `users:0`，没有模型密钥集合。候选仍为上述 `d77e02cd…`，锁文件安装和实际回环业务检查完成：密码登录、未认证拒绝、精确桌面来源、甲乙隔离及同步幂等通过。测试账户、独立命名空间和候选进程已清理；准备阶段没有模型调用或公共库导入。[脱敏回执](../tmp/visual-build-20261001/resume-live-dbe9f2dc/backend-prepared.json)。

新库合成 BSON 及索引已在另一个官方 Mongo 容器中实际恢复并核对，恢复容器、测试数据和夹具随后移除。新配置与数据库备份保存在经核实的 FileVault 私有恢复位置，权限和哈希通过；其中签名材料和保险库主密钥不进入普通备份、日志或项目。随后事务 `c1e80dc585b04f619ed84b0ca3a140a7` 从保留的实际库备份恢复账户与权限，验证应用账户重新认证、限于本库的实际读写、管理库访问拒绝及 users 索引，独立观察者接受并验证；临时容器和数据已删除，主库未修改，备份字节保持不变。使用官方[账户/角色恢复选项](https://www.mongodb.com/docs/database-tools/mongorestore/#std-option-mongorestore.--restoreDbUsersAndRoles)，不输出凭据。此前三次准备失败均由守护者验证回退；这些准备与恢复结果不代替最终入口切换的回滚验收。

**仍未验证**：本方案第 4 步的实际外部客户端来源与预检尚未成立，公开入口原子切换、第 5 步业务后检、真实账号/SMTP/OAuth 及生产包登录/同步未完成。普通浏览器的 API 健康页由客户端拒绝打开，没有 HTTP 响应；不能换浏览器、工具或地址绕过该限制，也不能与脚本 1010 等同。部署授权已收到，不重复索取；外部验收前提成立后沿同一受保护方案继续。客户操作见[09](09-DEPLOYMENT-GUIDE.md)。

**后续本地源码增量**：移动微信的一次性授权码、独立服务端配置及复合身份唯一索引已加入现有接口/管理员迁移；合成上游与真实本机 Mongo 并发验收通过。最终本地不可变候选 SHA256 `a48d00a828c20d7c9aceab5b403a54db803faf4ea04593c3e0823f709f3d7ede`，117 文件 / 238,775 字节，归档准入通过；前批 `9f056c9c…` 保留，本次追加旧小程序别名兼容与异常日志脱敏。该增量没有上传或切换腾讯候选，已接受准备的 `d77e02cd…` 与私有主库前态仍保留。切换前须受保护地暂存并验证新增候选，在受保护迁移中核对实际移动身份索引；不得重跑“新建准备”来覆盖已接受的库。新移动配置不从小程序/公众号推定，真实授权仍待 SDK 与已审核应用。[身份合同](05-DATABASE-SCHEMAS.md)。

该最终归档已实际解包并使用本机独立 Mongo 启动，保留分布式登录限流：未认证学习请求 401、精确 Mac 来源许可、未许可来源不授予跨域权限、管理员迁移路由 404、未知平台 400、缺移动配置固定业务错误 500。仅建立合成限流记录，账户和模型密钥均为零；进程与临时数据已清理，供应商/模型/生产调用为零。脚本原先假定未许可预检一定 403、登录无须数据库及缺配置返回 503，已按当前接口纠正；回执保留失败历史，没有变更后端以迁就检查。[实际归档回执](../tmp/visual-build-20261001/resume-live-dbe9f2dc/backend-candidate-validation.json)。

私人资料解析器可选 Mac Apple Vision：先 `npm run test:apple:vision` 做公开合成自检，再 `npm run build:apple:vision`（仅编译），把返回的绝对 `binary` 路径显式配置为 `MATERIAL_APPLE_VISION_BIN`；其他令牌/精确Origin/loopback监听/临时存储合同不变。要求真实macOS14以上及对应Apple SDK，CPU配置必须由API支持；不使用自动硬件回退。系统模型首次编译可能超过资料12秒期限，健康检查不代表完成初始化；先合成自检，真实文件超时则明确重试/校对，不放宽预算。子进程只继承PATH/TMPDIR，正文走有界stdin，固定错误码不记录资料/密钥。此二进制在解析器Mac运行，不能填充DCloud移动插件验收。

Laf 函数与独立后端共享业务源码。standalone/server.ts 提供 Express 路由；standalone/cloud-shim.ts 适配隔离 Mongo/存储。生产必须明确 ALLOWED_ORIGINS，不能继承旧域名或开发来源。上传、JSON 与请求时间均有预算限制。

桌面来源也需显式授权。macOS Tauri 本机实际请求的 Origin 为 `tauri://localhost`；Node 文本连接器的 `LOCAL_CONNECTOR_ORIGINS` 与 Python 资料解析器的 `MATERIAL_CONNECTOR_ORIGIN` 可精确接受该值，未将它加入默认来源，不接受 `null`、任意自定义协议或通配。Windows 宿主预期使用 `http://tauri.localhost`（启用 HTTPS scheme 时为 HTTPS），实际来源须在 Windows 验收后确认并逐个配置。本次已授权候选配置保留旧许可并明确加入 Mac 来源，旧公网进程配置未切换。来源许可不代替 Bearer 鉴权、用户隔离、目标白名单或预算，手机 localhost 仍是手机自身。

2026-10-02 的独立 macOS 验收版沿当前真实后端与隔离 Mongo，通过合成既有账号的密码登录、显式同步和甲乙隔离；真实 Origin 为上述精确值。生产地址另作只读 health/OPTIONS 探测：主地址从本机连接被重置，备用返回 403 且没有桌面跨域许可，生产登录/同步未验收。隔离结果不能代替线上可达性、SMTP/OAuth 或 Windows 来源验收；不得通过解除 TLS、鉴权或访问保护来补齐该缺口。

TypeScript 使用 Node16 模块解析，运行仍要求 Node >=22.22.3。构建完整入口，noEmitOnError 保留；package-runtime.mjs 将 @lafjs/cloud 改为本地适配，并复制未改写的 FSRS CommonJS bundle 与 YAML。原生 ESM 检查不能只靠测试转译器。

```sh
npm run typecheck:backend
npm run build:backend
npm run audit:backend:runtime
```

最后一项审计本地产物，不等于部署。npm run start --prefix laf-backend/standalone 会使用环境连接真实数据库和服务，运行前必须指定隔离/授权目标。

learning_states / learning_accounts / learning_model_keys 为私有集合，服务端用户授权、索引和禁止客户端直连策略必须在真实环境验证。密钥保险库与账户集合分离，AES-GCM 绑定用户/配置，日志不含密钥；持有保险库主密钥的运营者能解密，不是端到端保密。

Mongo 初次并发初始化复用同一连接 Promise；失败关闭并释放，生命周期测试与隔离运行证据见 11。真实生产恢复、真实账户登录、SMTP、设备和外部模型分别验收，不能由本机合成身份代替。

## 2026-10-03：QQ 身份增量的本地候选

QQ 应用归属、移动/小程序独立身份索引、SDK 超时/迟到回调和错误脱敏沿既有入口补齐，相关 189 项、各端构建与真实本机隔离 Mongo 通过。新不可变归档 SHA256 `ae5344b39cea1ea20871548c3bda3db00fd9a47e09627d03fd3b00c1cf633f25`，117 文件 / 239,039 字节，准入与实际解包启动通过；保留分布式登录限流库，未认证学习拒绝、精确桌面来源、未许可来源无跨域权限、管理员迁移不公开、未知平台及缺 QQ/微信移动配置拒绝均成立。仅建立合成限流记录，账户/模型密钥为零，供应商/模型/生产调用为零，进程和临时数据已清理。

该归档随后已按批准方案上传并受保护暂存，详情见下节；前批 `a48d00a8…`、`9f056c9c…` 与已接受腾讯 `d77e02cd…` 均保留。公网客户端条件和独立切换后检继续保持。[候选清单](../tmp/visual-build-20261001/resume-live-dbe9f2dc/backend-candidate.json)，[本机实际归档回执](../tmp/visual-build-20261001/resume-live-dbe9f2dc/backend-candidate-validation.json)。

## 2026-10-03：前批候选受保护暂存与实际回退

**事实**：沿已批准的 VPS-Config 维护入口，先更新原有产品维护程序，再上传 `ae5344b3…` 候选。新步骤复用已接受私有库与原锁定依赖，在事务独立命名空间运行当前不可变归档；原准备入口仍拒绝覆盖已有库。候选事务 `5e3a36082a664a6ba09d027b1708a0e7` 已接受，独立观察者 `accepted/verified=true`。

腾讯实际 Mongo 9.0.2 中，当前归档的密码登录、未认证拒绝、精确桌面来源、甲乙隔离、错答保存与重复同步不重复计数通过。编译后的管理员迁移仅在临时库执行，实际核对微信移动、QQ 移动及 QQ 小程序三项复合唯一索引，并验证重复身份 11000 拒绝、跨应用独立及缺身份字段可共存；未知平台与缺移动配置拒绝，管理员迁移不在公共路由开放。供应商与模型调用均为零。

**实际回退**：事务 `1e3e1df7ae7a427db920c12b6ac6f188` 在候选业务检查完成后主动使后检失败，原归档恢复、新候选移除、测试库/账户/进程清理通过，独立观察者确认 `rolled-back/verified=true`。此前一次探针错误地使用 `wx` 类型，已修正为接口原有 `wechat`；该次失败也已验证回退，后端没有为探针改接口。文件恢复先于恢复命令，所以维护程序与候选归档分别更新，回退使用已接受的恢复程序。

暂存后的实际核对证明，归档内六项关键编译文件/锁文件与服务器字节一致，回环测试监听、事务临时目录和测试命名空间均消失。旧 PM2 PID 5931、入口/环境、已接受准备记录及主库指纹保持；主库仍仅有 `users:0` 和原 `_id_ / email_1` 索引，新增身份索引没有迁入主库。保留的私有配置与数据库备份哈希保持。维护相关 19 项、语法及文档检查通过。[受保护暂存回执](../tmp/visual-build-20261001/resume-live-dbe9f2dc/backend-stage-accepted.json)，[回退演练](../tmp/visual-build-20261001/resume-live-dbe9f2dc/backend-stage-recovery-rehearsal.json)。

**该批结束时**：生产身份索引仍需独立受保护迁移；后续完成事实见下节。完整管理员迁移的临时库结果不代替主库迁移。外部客户端验收、原子切换、生产后检与真实 OAuth 尚未完成，该次暂存没有切换公网入口。电脑操作遵守普通窗口约束。

## 2026-10-03：私有主库限定身份迁移与独立回退

**事实**：原完整迁移同时覆盖其他集合与邮箱索引名称，因此沿原管理员函数增加 `scope:"user-identities"`，与完整迁移共用八项身份定义，管理员鉴权在范围解析前保持。限定范围只修改 users 身份索引，保留 `_id_ / email_1`；任何局部失败返回固定失败消息，不把重复身份或驱动错误暴露给调用方。独立后端未增加公开管理员路由，客户端与视觉模板没有变化。

相关身份合同 87 项、维护程序 23 项、后端类型/构建及 27/27 原生入口加载通过。真实本机 Mongo 8.2.5 验证未授权/未知范围零索引写入、八项身份重复拒绝、三个复合身份跨应用独立、原邮箱与合成原记录保持，以及局部/完整应用后的限定回退。新不可变候选 SHA256 `8917ca29848e3bfb3e1e5f8a700eca3323e2f5a8ef89290d3552a8253aec29ad`，117 文件 / 245,703 字节；前批归档与已接受初始准备均保留。事务 `5aafd678c0c3492c95eaeeeb30a8d53e` 已接受并独立验证，腾讯 Mongo 9.0.2 临时库实际验证限定迁移重复执行、旧 email 约束与应用 readWrite 角色的索引创建/删除，并重验登录、鉴权、来源、错答、账户隔离及同步幂等。

**实际主库回退**：沿既有原生维护租约冻结真实私有恢复材料，事务 `ecf9920279b84c748ea7ab5fd0e7c0a0` 完成限定迁移/重复执行及实际索引核对后，主动使后检失败。独立观察者完成服务端恢复并确认 `rolled-back/verified=true`；只撤销本次新增且定义完全匹配的身份索引，原邮箱/\_id 保留，完整主库前态指纹恢复，事务日志与索引回执移除，候选仍保留。发现并发账户/外来索引或非索引前态改变会拒绝覆盖；本轮没有这些冲突。

**已接受迁移**：正式事务 `82ee0d76a8ec4b459f415c3a6df45eca` 随后 `accepted/verified=true`。主库实际只含空 users，原两项加新增八项共十项索引，账户正文未修改；应用账户仍认证成功且管理库访问拒绝。旧 PM2 PID 5931、入口/环境/准备记录保持，归档关键编译字节匹配，事务临时目录、候选监听/账户/库清理；保留私有库与配置备份字节/权限不变。四个本轮维护事务的执行者和独立观察者均结束，观察作业移除，供应商/模型调用为零，全屏操作为零。

[新候选暂存](../tmp/visual-build-20261001/resume-live-dbe9f2dc/backend-identities-candidate-guard.json)，[主库回退演练](../tmp/visual-build-20261001/resume-live-dbe9f2dc/backend-identities-primary-rehearsal.json)，[正式迁移](../tmp/visual-build-20261001/resume-live-dbe9f2dc/backend-identities-primary-accepted.json)，[实际后检](../tmp/visual-build-20261001/resume-live-dbe9f2dc/backend-identities-primary-postcheck.json)。公网入口没有切换；真实外部来源/业务后检、SMTP/OAuth、原生 SDK 与设备继续待验。此项私有索引闭环不解除公共题库门禁，也不宣称整体交付完成。

## 本机文本模型连接器

运行 npm run dev:local-model 前明确 LOCAL_MODEL_IDS（逗号分隔真实型号）与固定 LOCAL_MODEL_TARGET（默认 http://127.0.0.1:11434/v1/chat/completions）。仅数值本机/私网地址允许；显式云型号不允许。模型服务的真实推理未通过，不能从 health 成功推断推理可用。接口按 [Ollama 官方兼容协议](https://docs.ollama.com/api/openai-compatibility)的文本子集实现，兼容其他服务须逐项验证。

LOCAL_CONNECTOR_PORT 默认 8766，LOCAL_CONNECTOR_ORIGINS 默认 http://127.0.0.1:4204（逗号分隔精确来源），必须与当前 H5 来源完全一致。LOCAL_CONNECTOR_TOKEN 至少 32 字符；未设置则创建仅本人可读的 tmp/local-model-connector/token，终端只提示文件路径，不打印令牌。连接器只绑定 127.0.0.1，前端配置 http://127.0.0.1:8766/chat，令牌只保存在当前内存。可选 LOCAL_MODEL_API_KEY 仅交给固定本机上游，不把连接器令牌转发。微信代码可直连已授权可达目标，但手机localhost是手机自身；需已有可信HTTPS网关或符合微信域名规则的地址转发到此环回服务，并完整保留来源、Bearer、固定上游/型号及硬预算。微信端来源标识固定为https://wenli-weixin.invalid，服务端必须显式加入LOCAL_CONNECTOR_ORIGINS；不能把这项配置当作真实设备已验证。未开放LAN监听、不修改域名校验。现有App客户端仍拒绝此路径。

LOCAL_CONNECTOR_MAX_CALLS 默认 20（最多 100）；CLI 固定输出 512 token、25 秒超时、最多 2 并发及 10 次/分钟。服务构造函数可在硬上限内配置输出/超时供隔离验证，CLI 不读取额外同名环境变量。健康检查不产生推理；/chat 相同 requestId 同内容复用包含失败的执行结果，次数用尽须停止。进程重启是新的会话预算，不能据此声称跨进程持久计费。不开任意代码执行、工具/视觉/流式能力。固定本机服务是否再次转发云端由用户核对，不承诺仅因地址私有就绝不离开设备。

## 本机资料解析器

运行 .venv-baidu/bin/python scripts/pipeline/private-material-parser.py，明确 MATERIAL_CONNECTOR_TOKEN（至少 32 字符）和 MATERIAL_CONNECTOR_ORIGIN。MATERIAL_CONNECTOR_PORT 默认 8765，仍只绑定127.0.0.1；前端独立配置 /parse。微信连接同样需要受保护可达地址与精确MATERIAL_CONNECTOR_ORIGIN=https://wenli-weixin.invalid，现有H5来源独立设置，不能自动扩大为通配。可选 MATERIAL_CONNECTOR_STORAGE 保存原件供继续处理/删除，未指定使用进程临时目录并在正常退出清理。POST /health 仅检查鉴权及现有程序，不能证明手写/中文识别质量。PDF 文本优先，扫描文字识别必须用户勾选；系统已有 pdftotext/pdftoppm/Tesseract 的有限路径通过，不安装或下载模型。旧 /chat 返回 410。

资料原件删除需连接器/delete；本机范围确认后只向已授权原解析器发送匹配fileId。回执未到或失败保留无正文待办，重试单独确认，不把设备记录删除说成所有外部原件或运营备份已消失。当前能力/证据见[14](14-MODEL-PRIVACY-COST.md)。

大learning_states由Node内置gzip保存，逻辑上限600万UTF-16字符/2万操作，压缩8MiB/解压2400万字节；旧raw兼容，单文档CAS和用户隔离保持。页面读取仍经同一鉴权/限流入口，不新增对外无授权文件服务。原生后端27/27入口加载及固定Mongo大历史已验证；Laf云实际部署/运行与设备尚未验证。旧版本程序不支持新封装，生产回退须先具备独立数据前态，详见[09B](09B-BACKEND-MIGRATION-GUIDE.md)。

流式部署仍需真实环境另验：独立Express有每请求AsyncLocalStorage响应与本机TLS/HTTP证据；Laf托管response接口、网关缓冲/超时、HTTP断流及跨实例取消尚未实测。上述私有候选准备不构成公网流式验收。Nginx/Laf须保持认证、来源、上游白名单/固定DNS/TLS及账本预算；只有完整结构经校验才向客户端返回成功收据。不能把代理配置存在当流式公开可用。当前App无可靠分块路径时主动非流式，不静默消费。
