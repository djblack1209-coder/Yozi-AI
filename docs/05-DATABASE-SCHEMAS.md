# 学习数据与统计

## S52：分工关联元信息

沿用学习状态v1、既有事件及 `learning_accounts.calls`，不新增集合或事实库。`model.request.data` 仅新增可选 `workflowContract:"learning-workflow-v1"`；须绑定明确分工问题、单题入口及v3展示，事件不保存任务图、额外正文或密钥，没有该字段的旧事件含义不变。分工只形成原问题／请求意图和最终讲解，不生成作答、评分、掌握或复习事实。

各真实模型阶段的费用行以 `workflow:{contract,stage,parentId,taskId?,planDigest?}` 关联；`planDigest` 仅为追踪摘要，授权始终读取原父请求和实际依赖，不把摘要当权限凭证。主计划与本次问题仅在原可清理结果缓存中，子分析和汇总各在自己的结果里；沿现有容量／TTL／删除策略释放，原用量及未知费用保留。父取消添加 `workflowCancelledAt`，不改写原已完成结果或费用；在途子行仍按真实终态结算。原用户隔离、保险库和隐私清除适用于上述全部缓存。

旧程序未声明本合同，不以旧reducer重放新增字段或从旧备份复活分工；回退须保留新版完整状态／待确认编号和费用，新分工由支持合同的版本读取。本批不迁移、重算或恢复数据库。

## 阶段13：事实与退役数据（2026-10-18）

`questions`、`question_banks` 公共题库用途已退役，集合及线上数据保持；不执行数据库清理或旧记录迁移。`practice_records/mistake_book/favorites/review_logs` 原答、结果、时间与历史统计原样保留。读取时优先使用已有原题快照；没有原题时提示“原题已随旧题库下线”，不再安排该题复习。

对话学习仍沿现有版本、事件与恢复机制；消息可带受限内容块及待确认档案/计划建议。建议本身不是学习事实，确认后才产生既有 profile/plan 事件；整份建档由现有批次原子保存，任一字段无效时不部分落盘。目标日期为有效ISO日期，日历采用已保存时区；知识点图只投影真实作答及独立校验，提示后订正与待核对不计独立正确，总体范围未知时不生成百分比。

## 阶段5L：遗留队列持久合同（现行）

本节替代5H—5K中通用离线队列的入队/去重/重放/容量合同，身份记录和恢复登记不变。无新集合或持久键；`EXAM_OFFLINE_QUEUE`仅作为历史任务的排空存储。理由是生产代码无入队调用，旧正式版本可能有遗留记录，而新增复杂度连续产生审计问题。

保留稳定id、requestData、session(owner/epoch)、timestamp、priority、retryCount与state；原始字段原样兼容保存，不再解释或生成dedupeKey/version/enqueueReceipt，也不改写正文或创建新id。无state/未知state保守按retry，遗失认领的sending按retry，缺retryCount按0；无账户绑定的旧数据不自动归属，继续隔离保留。当前账户含旧epoch的过期记录在排空锁内清理，其他账户及活跃认领保留。取消仅作用于已载入id，在持久事务内再次核对认领；迟到回执按id修改，不能整表覆盖其他实例的数据。

同运行时的 `id → 认领对象` 与 `id → 成功时间` 保留：前者只能由持有者释放，后者确保远端成功而本地确认失败后不在同运行时重发。processing在await前设置、finally释放；锁内重读并复核，等锁后检查会话/归属。发送通过rebuilder传入原session/taskId，缺重建器、存储或身份暂不可用时保留任务并报告未同步。当前生产无rebuilder注册，不能将注册接口的存在当成已有服务端接收能力。[接口与回归矩阵](04-API-DOCUMENTATION.md#阶段5l只排空遗留离线任务现行)。

保留 `order-20-03`：同运行时认领不是跨窗口租约，进程崩溃/跨上下文仍可能重复提交，无端到端恰好一次保证。未来离线提交须重新设计“跨窗口认领租约 + 服务端按任务 id 幂等”，不得恢复本次删除的入队实现。

## 阶段5K：恢复回执与有序去重更新

本节替代5J对应恢复与离线字段说明，不新增数据库集合或认证权限。身份恢复与尝试登记共用独占锁；中断恢复的CAS撤销回执包含恢复前/后的退出栅栏及实际generation；普通退出的内部回执对象仍仅含generation。调用者保留发起时的意图和栅栏，回执用于确认本次恢复归属，不能据此新建登录意图。单上下文同步执行，退出或后继身份提交后旧尝试无法提交。普通退出保持既有容错：不额外要求读取撤销标记；恢复前后栅栏的读取与比较仅用于中断恢复。普通登录的游客迁移证明仍在发起时复制，等待锁期间的新写入或改写不加入本次证明。

`EXAM_OFFLINE_QUEUE` 沿用原键与状态，任务新增可选 `version`（旧任务缺失按1，初次入队为1）及 `enqueueReceipt`（随机入队操作id，无令牌或用户正文）。pending替换每次加一版本；新id任务从1开始。回执用于识别本批有序更新已落盘但核验失败的情况；同id最后一条回执也证明本批此前更新已被覆盖，无需再加版本或回放旧正文。

尚未确认的替换以显式更新保留在当前队列实例的内存Map，保持每次入队顺序及原目标id。恢复锁内核对目标是否仍pending且无认领/确认，否则改用原更新的独立随机id入队；新id不会复用旧任务的发送身份。序列化不包含更新标记或函数引用。只有整批持久写入及一致回读成功才清除对应待写；内存待写不构成进程退出前的落盘保证。重放失败保留待写并停止传输。[测试矩阵](04-API-DOCUMENTATION.md#第十一轮定点修复恢复登记与去重重放阶段5k)。

跨上下文发送租约与后端任务id幂等仍缺失；`order-20-03`的双上下文重复提交按[13](archive/13-DEVELOPMENT-PLAN-until-2026-10-18.md#账户隔离后续批次第-10-轮审计)另批解决。

## 阶段5J：迁移别名与中断身份恢复

不增加数据库集合，也不改学习事实、任务正文或公开认证权限。离线 `EXAM_OFFLINE_QUEUE` 持久结构保持；发送认领由同一运行时的归属对象持有，存储核对失败不创建新的去重任务 id。过期清理处理当前账户各epoch的过期行，容量取消只涉及已载入且当前绑定的可淘汰行；其他账户行不清理。

| 决策                                       | 原因与边界                                                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 已验证迁移别名按 owner/epoch 缓存          | 暂不可用不拆开原逻辑槽；防抖覆盖/取消/增量保持顺序。缓存不是身份授权，所有实际写入仍校验原绑定。                                       |
| 独占锁内识别领先记录                       | 普通读者仍返回 unavailable；只有持锁者可断言无活跃提交者。读取失败或证明不符不自动恢复。单上下文平台在操作入口执行相同识别。           |
| generation CAS 撤销且跳过拟议代数          | 已识别领先记录或本地撤销时记录不可读，代数跳两步；可读普通撤销仍加一，避免中间记录恰好匹配提交键而获得授权。持锁前捕获代数，冲突不写。 |
| 撤销后重新登录，不采用中间身份             | 删除完整记录及兼容凭据，推进撤销/尝试栅栏；学习资料保留。恢复不猜测未完成登录是否成功。                                                |
| 无绑定退出保存创建时代数；清理使用实际回执 | 新Store可本地撤销；等待锁时后继身份已提交则原CAS失败，退出续段不能清除新登录或新缓存。                                                 |

[并发矩阵与测试名](04-API-DOCUMENTATION.md#第十轮针对性修复离线认领与中断身份恢复阶段5j)。没有跨窗口发送租约、端到端幂等保证；崩溃后的远端接收状态仍须后端协议解决，不以本轮同运行时认领冒充恰好一次交付。第10轮既有问题另列[后续批次](archive/13-DEVELOPMENT-PLAN-until-2026-10-18.md#账户隔离后续批次第-10-轮审计)，不在此回写历史证据。

减法/除法只新增`integer-arithmetic-v2`题目依据，复用现有questions/attempts/plans/reviews及同步事件，无新集合或逻辑格式。答案、帮助、原题关系和停止分别保持。FSRS上游升级不重算已保存的due；非法个性化参数拒绝加载并保全客户端已有设置，不把修复库版本写成学习掌握事实。

分数四则使用`fraction-arithmetic-v1`题目依据，同样复用已有题目、原答、帮助、判分与变式关系，不新增数据库集合或自动迁移旧答案。服务端按题面重建精确依据；参考答案被篡改、关键疑义未解或学生格式超界时保留待核对，不进入可靠复习。

## 阶段5I：新意图、凭据版本与事务可见性

本节替代5H对应协议，现有持久键及身份格式继续兼容；[完整持有者/初始化清单及逐ID回归](04-API-DOCUMENTATION.md#第九轮终审新操作身份可见性与按-id-写入阶段5i)。

| 设计决定                           | 实现约束与理由                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新动作捕获当前会话，续段保留原绑定 | 初始化缓存不是用户意图；设置与资料补丁重新读取当前账户，旧导出/回调不能因同账户重新登录而被新epoch接管。方法返回保存回执，避免假成功。                                                                                                                                                                                                                                           |
| 读取失败保持待初始化               | 默认值只用于确实不存在的设置。严格读取失败不得通过吞错发布默认设置或置初始化成功；恢复后完整重读，防止覆盖已存偏好。                                                                                                                                                                                                                                                             |
| 401比较发送凭据版本                | 发送时记现有SHA-256完整性指纹，仅用于本次响应归属，不记录令牌。当前一致凭据匹配才全局退出；已续期的旧401仅返回可重试失败，不在原调用内重放。owner/epoch业务绑定不改。                                                                                                                                                                                                            |
| 提交中的generation暂不可用         | 原兼容合同含多个持久键，不能原子写完；完整记录先落盘、generation最后提交的顺序保留。`record.generation > committedGeneration` 返回unavailable，epoch读取同样不能将其降为changed；generation/控制键存储事件触发重读。代数落后、已提交撤销或真实换代仍拒绝旧绑定。checkSession快照不可读，epoch/revocation补读夹读generation；前后或记录代数不符仍unavailable，一致才确认换代。    |
| 登录意图同步定序                   | 在任何await/存储读取前递增本上下文意图序号，锁内登记与最终提交均核对最新意图及原撤销栅栏。新意图失败不能让旧意图恢复资格；跨窗口以持久尝试id/generation串行；OAuth序列化保留intent/intentContext，同上下文校验序号，重载后的新上下文仅采用持久定序。                                                                                                                             |
| 新账户投影恢复                     | 确认切换后 reset，从同一一致快照读取新资料，再检查owner/epoch；不可读不写身份，等待后续通知/显式动作重试。                                                                                                                                                                                                                                                                       |
| 迁移前后共用逻辑待写键             | 将当前epoch及其 `migratedFrom` 映射到同一 owner/原epoch/key，待写覆盖按入队顺序；增量操作顺序保留，取消与未读基础同样规范化，避免旧任务复活。                                                                                                                                                                                                                                    |
| 兼容离线队列按id事务               | 旧版本存在持久队列实现，不能证实无遗留；保留原键、状态、有效期及消费者。复用身份锁，锁内重读后仅变更指定id；恢复尚未落盘入队按id合并，迟到回执不能覆盖另一实例新增任务。发送认领在锁内复核id仍在且正文仍匹配；已取消或被较新pending正文替换则不调用旧发送函数，重读并保留新正文可继续发送，锁等待结束再核对原owner/epoch。没有统一后端幂等和跨进程发送租约，不新增恰好一次承诺。 |

身份记录与generation之间若因写失败停留在未提交状态，本轮采用失败关闭，等待原事务提交后重试；若写者崩溃而留下领先记录，则保持暂不可用，未实现自动确认/丢弃候选的恢复事务，不会通过读取不完整候选写回身份。暂不可用保留最后可信界面不代表允许业务写入。H5返回异步回执，单原生逻辑上下文同步执行；平台边界仍沿5H，不以构建代替设备验收。

## 本机登录会话代号（2026-10-16）

全局敏感键`EXAM_SESSION_EPOCH`继续加密保存为`_enc_EXAM_SESSION_EPOCH`；H5保留`__exam_storage__:`及`{value}`包装。完整记录为`{version:1, generation, epoch, owner, token, userInfo, proof, revocation}`，旧`{version:1, epoch, owner, proof}`继续兼容。`proof`为owner/令牌的SHA-256完整性摘要，令牌不写日志、队列或业务绑定。`EXAM_SESSION_ENABLED`保留本设备已启用代号的事实，启用后缺代号按撤销处理，不由缓存恢复补发。

### 阶段5H：身份代数、离线状态机与启动恢复（现行）

本节取代下文5E—5G关于身份并发、无锁降级和队列格式的旧实现条款；历史回执不回写。理由是写后回读不能消除旧完整身份已被其他上下文接受的窗口，退出清理与登录登记也必须采用同一种排序规则。

**身份代数**：新增全局非敏感整数 `EXAM_IDENTITY_GENERATION`，初始缺省0、只增不减，完整加密身份记录增加 `generation`。登记、登录提交、回滚、退出/撤销清理、身份删除、全清、资料/令牌提交与格式迁移，都在入口捕获代数，取得同一 `exam-master:login-session-v1` 独占锁后比较，只有一致才提交并递增。不一致放弃，不删除、覆盖或回滚后继结果。所有锁回调为同步函数，比较与写入之间无await。资料补丁仍在锁内读取完整资料并按字段合并，但不跨过代数冲突自动重放；并发更改/续期使旧补丁返回false，重新明确提交时捕获新代数。顺序更新与续期后的新业务动作保持可用，业务绑定仍为owner/epoch，资料及正常续期不改变epoch。

完整记录先准备带下一代数的密文，再确认撤销标记/启用标记与代数；读者在前后复核代数并要求完整记录匹配。中间状态只按未确认/已变化处理，不能接受旧代数。保存失败只在仍拥有提交代数时回滚，并再推进一次代数；全清及保留指定设置的选择性清空都经过同一事务，保留代数与撤销控制键，禁止先清空再重建计数；普通save/remove拒绝修改这些控制键。退出通知仅促使消费者重读，不再次撤销。登录登记也在锁内，H5调用方须等待登记完成才发送供应商请求；OAuth上下文保存原id/revocation/generation，旧缺generation的上下文重新登录。完整身份提交后只恢复Store投影，不重复持久化同一令牌/资料。

**平台上下文核实**：当前微信目标是uni-app编译的App Service，App是manifest中compilerVersion=3的普通app-vue逻辑包。按[DCloud运行时说明](https://uniapp.dcloud.net.cn/tutorial/index.html#运行时-runtime)及[逻辑层说明](https://uniapp.dcloud.net.cn/tutorial/performance.html)，两者的逻辑代码在独立JS引擎执行；当前源码没有原生nvue/renderjs身份写者，也没有创建原生Worker。`question-dedup-worker.js`只是同步去重函数。结合产物单逻辑入口/共享模块核对，当前微信、app/app-plus编译目标采用单执行上下文同步比较写入；该结论不外推到以后新增Worker、原生插件或多逻辑实例。单元测试用明确UNI_PLATFORM=app模拟此模型；共享存储H5探针与独立worker另以真实串行锁协议验证，不能以native模拟代替浏览器并发证据。

H5和Tauri桌面WKWebView/WebView2一律视为多上下文，必须有原生Web Locks；不以当前仅一个窗口推断单上下文。显式编译平台白名单决定native路径，浏览器不能凭uni/wx同名对象绕过。缺锁时拒绝所有身份写入，登录入口显示“当前浏览器版本过旧，请升级后登录”，现存账户/令牌不对认证读取和Store恢复开放；只提供新的游客绑定供本机游客学习，拒绝旧账户和旧绑定。此路径不尝试无锁CAS。WKWebView/WebView2实测范围及未覆盖平台以本轮[12](12-CHANGELOG.md)回执为准，构建不代替设备验收。

**离线任务**：`EXAM_OFFLINE_QUEUE`每项新增 `state:pending/sending/confirmed/retry`，id为稳定任务身份。旧缺state或未知state项保守转retry，保留原id/正文/次数，不假设从未发送；重启时无运行中证明的sending转retry，confirmed只补本机确认。去重键只合并同owner/epoch的pending；sending、confirmed、retry不复用id。入队克隆原正文，发送前确认sending落盘；请求和重建器额外接收taskId。回执仅确认原id，成功后先保存confirmed再尝试移除；持久确认不可用时保留正文及本运行时id墓碑。没有稳定后端幂等协议时仍不能承诺崩溃后的恰好一次远端效果。普通失败保留retry及次数，不再因第三次失败或暂缺重建器静默删除；原24小时有效期、容量与身份隔离保持。暂不可用恢复原发送前状态/次数，success=false、reason=SESSION_UNAVAILABLE；本地存储不可用也明确非成功。取消/清空先固定已载入id，恢复完整基础后重算，仅删除这些id；发送中的任务拒绝取消，不覆盖未知任务。

**启动与定时器**：App独立完成路由/错误守卫后运行待初始化项；暂不可用保留待办，每秒或onShow重试，成功项不重复执行，根卸载清除重试。埋点先完整读取原队列，再创建分析会话；FSRS/语言/主题读取失败不永久采用空基础或遗失Store方法；通知失败Promise不永久缓存。令牌预检初次未绑定时等待恢复，成功绑定后仅核对原会话与本次timer。QuestionTimer先清旧interval再换绑定，每个回调捕获原session/计时token；题目生成的进度/轮播/续段计时器、短震动与登录导航同样检查原绑定或本次计时器，卸载/重启及时清理。

### 阶段5H：离线任务状态转移测试矩阵（实现前）

| 原状态                 | 输入                       | 预期状态与持久效果                               | 回归                                      |
| ---------------------- | -------------------------- | ------------------------------------------------ | ----------------------------------------- |
| 待发                   | 同属主/会话/去重键的新动作 | 合并待发正文，保留任务id                         | round8 normal pending dedupe              |
| 待发/失败待重试        | 开始发送                   | 发送中，冻结本次id/正文                          | inflight-17-01/migrate-08-01              |
| 发送中                 | 同去重键的新动作           | 新建待发id，原任务不变                           | inflight-17-01/migrate-08-01              |
| 发送中                 | 成功回执                   | 仅原id已确认；本地确认失败保留回执，不重发       | round7 sent queue                         |
| 待发/失败待重试/发送中 | SESSION_UNAVAILABLE        | 恢复原状态与次数，success=false，未同步          | inflight-17-02/regress-8-01/migrate-08-03 |
| 发送中                 | 普通发送失败               | 失败待重试，次数+1；不合并后来的动作             | round8 normal retry                       |
| 已载入任务             | 明确取消id                 | 先恢复完整基础，仅移除该id                       | migrate-08-02                             |
| 未载入基础             | 取消/清空                  | 不覆盖未知任务；保留取消意图或返回失败           | round8 unread cancellation                |
| 旧缺state/未知状态     | 升级恢复并提交同去重键动作 | 旧id保守转失败待重试，新动作独立id，原正文不合并 | round8 normal legacy state migration      |
| 发送中（重启恢复）     | 无可靠回执                 | 失败待重试，沿原id；远端幂等仍由服务保证         | round8 restored states                    |

### 阶段5G：尝试上下文与待确认发送（历史）

- `EXAM_LOGIN_ATTEMPT`仍是全局尝试id；发起时先读取并固定`EXAM_SESSION_REVOCATION`，允许首次null，不因登记另建代数。首次非空设备代数仅在仍持有原尝试的提交内创建。原快照可以是等待旧撤销清理的changed状态；新明确登录仍按同一状态/owner/epoch/token与代数核对。登记前后核对原身份快照与同一代数；提交、CAS与回滚均沿原尝试。Web Locks不改变发起时序，缺锁不宣称跨上下文原子CAS。
- `wx_oauth_state`继续现有键，结构新增`attempt:{id,revocation}`；`state`为32位随机hex加下划线及尝试id，原origin/redirectUri/createdAt/wechatMode保留。只消费一次且10分钟有效；缺attempt的旧上下文要求重新登录，不迁移为新尝试。上下文不含令牌、guestSources或学习正文；整页重载没有旧游客来源证明则保留游客来源、不猜测迁移。桌面broker的`desktop_`上下文与浏览器学习分区独立，回调不写浏览器登录身份。
- Store的`pending/ready`初始化状态、绑定代数、重置深度、闪卡操作对象均为内存控制，不新增学习事实字段或数据库迁移。根/待办/冲突完整读取后才发布可信投影；暂不可用重试原分区，确认换代先立栅栏再发布新分区。
- `EXAM_OFFLINE_QUEUE`持久格式不变。模块内发送墓碑仅为`id → sentAt`，不含正文、令牌或用户身份；最长按原24小时寿命保留。远端成功但本地读/写/回读失败时不确认出队、不增加重试，同运行时跨队列实例跳过发送并补本地确认。新dedupe动作另建id；退出运行时后墓碑不保留，因此不能宣称崩溃后的恰好一次投递，未来真实通用接入仍需稳定后端幂等协议。

完整动作分类、全部登录入口及同类排查见[04阶段5G](04-API-DOCUMENTATION.md#第七轮终审尝试重置与续段阶段5g)。

阶段5F设计澄清（后续实现与回归以此为准）：

1. **绑定与完整性分开**：操作只绑定`{owner, epoch}`；`captureSession`可附带proof用于快照自校验，不能据旧proof拒绝同账户续期后的动作。身份写入在进入事务前捕获完整快照，在写锁内比较owner/epoch/token，防止排队的旧快照覆盖后提交的身份；同一绑定发起的新动作读取当前快照。资料增量补丁只按owner/epoch接受，在实际取得锁后读取最新资料，仅合并本次字段；不携带调用时整份旧资料，不因排队期间续期而失败。正常续期不换代，资料、练习、计划、复习与在途学习继续可用。公共请求作用域/去重/缓存、错题互斥队列、作答续段、统计投影及页面确认均遵守同一绑定。实现：`auth-storage`的`checkSession/sessionForRequest`、存储`save`、Profile新动作及学习Store。
2. **新动作重新绑定，续段保持原绑定**：每次用户明确开始练习/计划时捕获当前会话，重读对应分区；await、定时器、回调和提醒步骤使用该动作原绑定。练习还核对操作标识，旧完成/旧finally不能覆盖较新练习或忙碌状态。实现：`practice-mode-manager`、`intelligent-plan-manager`及题目生成mixin。退出后同账户重新登录可以开始新练习和新计划。
3. **有类型的暂不可用**：`SessionUnavailableError`及`isSessionUnavailable`统一识别`code/errorCode=SESSION_UNAVAILABLE`。存储故障、混合快照及暂不可用响应保留待写/待发正文、原绑定、重试次数与已有投影，不删除任务、不计普通失败；恢复后显式flush、队列处理或原循环重试。练习500ms防抖复用统一待写队列，写入并回读成功后才移除，明确取消或确认换代可移除。finally只结束自己的操作；Review按待处理集合计算loading，离线队列和生成循环均在finally复位。纯本地取消先abort/内存失效，不读身份；只读通知/计算上下文使用最后可信投影或null，已有会话定位/题组切换可继续阅读，确认换代仍重置。请求及领域错误规范化（含脱敏）保留SESSION_UNAVAILABLE；离线持久队列恢复失败不视为空，读取成功合并前不覆盖旧正文。错题锁前故障保留冻结任务及原绑定，每500ms重新检查，明确换代后撤销；返回有类型错误，已经开始的远端任务不自动重发。令牌预检故障仅跳过本次，确认换代才停计时器。实际写入和外发仍严格守卫。
4. **老用户升级不换身份**：只有从未启用代号的旧格式可补发，已有字符串代号保留。升级记录可带`migratedFrom`（原epoch，含null），只用于将同一owner的旧格式绑定归一为新格式；下一次明确登录不携带该字段。升级和明文迁移使用同一写锁/CAS并回读，Auth等待升级完成再恢复和发布登录状态；Profile与学习Store识别格式迁移，不清资料、不撤销许可。正常资料与原答保留，之后真实重新登录仍撤销旧绑定。
5. **跨窗口登录状态同步**：Auth订阅`onIdentityChange`，通知只是重读提示，当前持久身份确认退出/换代后同步清理登录状态；暂不可用保留token/isLogin并设置`sessionStatus=unavailable`，不显示成退出。Auth/Profile订阅随Store释放，Facade暴露同一状态；个人页响应式读取该状态并显示中英短提示，确认撤销不从旧别名回退为已登录。Profile事件监听不使用全局一次性闭包。
6. **缺Web Locks失败关闭**：登录尝试在首个await前写`EXAM_LOGIN_ATTEMPT`，退出、完整清理和无锁冲突失败关闭更新独立非空`EXAM_SESSION_REVOCATION`；正常登录提交保留该退出栅栏，登录只轮换epoch并核对最新尝试编号；完整记录必须匹配撤销标记。身份更新/迁移共用`exam-master:login-session-v1`独占锁；比较与写入之间没有await。无锁时完整记录写后回读密文、最新尝试和撤销标记，发现并发覆盖即删除代号并更新撤销标记，要求重新登录，不恢复旧快照。旧物理写入晚于新登录时，写后核对发现尝试编号变化即再次撤销；不承诺核对前的跨运行时瞬时可见性。锁内失败仅在尝试编号仍最新、退出栅栏未改变且仍拥有完整记录时恢复兼容别名和原身份；无锁失败不回写旧身份。若完整记录写入尚未发生就失败，仅在原记录/尝试/退出栅栏仍一致时恢复本次enabled标记，不再轮换或回退退出栅栏。此为保守失败关闭，不承诺跨上下文原子CAS或冲突时保留登录。
7. **迁移按键存在性**：`migrateUserKeys(session)`只接纳游客通过统一入口写入、在登录尝试捕获且迁移时仍逐字相同的来源证明。目标存在性与值的真假分开，已有0、false、空串均保留；不同值冲突保留目标与游客来源，不删除来源。无冲突逐项复制→核对双方→再次检查原session→移除本次来源证明，已复制未收尾可重试。业务数据走可抛错的严格读取但允许合法空串，不套用认证字段的非空要求。当前游客写入与退出未共用可证明独占的跨运行时比较删除协议，因此保留游客来源，不执行删除；新游客写入可建立新的来源证明，旧迁移不能删除或冒认新值。证明只在运行时保留，重开无法证明的旧全局值不自动归属；对话/练习原件仍走明确归属流程。
8. **游客与待写分代**：游客绑定epoch使用持久`EXAM_SESSION_REVOCATION`（首次未建立栅栏的旧游客为null）。首次登录尝试建立标记后，旧null游客绑定失效；本次登录页面先登记尝试、再捕获页面绑定，初次登录正常可用。不添加guest:null的格式迁移特例，之后退出/全清也不会让旧null游客重新匹配。登录再退出会改变游客代号，旧游客不能重新获得权限。防抖与内存读改写任务均按`[key,owner,epoch]`隔离；暂不可用不允许跨绑定替换或取消任务。
9. **读取失败不提供空写入基础**：统一`read`区分ready/unavailable，`get`失败抛出同类型；同绑定/业务键快照写入阻塞到成功重读，调用方不能捕获失败后直接回写旧投影；学习事实/全部恢复元数据、持久队列、目标、缓存、错题与复习投影共用严格读取。现存集合键的空串是不可确认读取；合法字符串业务值仍可为空。新增队列操作保留在内存，恢复重读并合并后确认写入。已兑现的暂不可用与抛出同样处理：不出队、不清pending_sync、不覆盖已有投影，流式结果保留errorCode。调用点见[04](04-API-DOCUMENTATION.md#第六轮终审持久化读取与成功回执阶段5f)。
10. **输入不枚举全部存储**：首次登录和旧格式升级建立非空撤销标记，后续身份读取直接核对具体键。空值仍保留严格读故障检测，不能用缓存掩盖读取异常；20次学习输入上下文读取的存储枚举为0。

FSRS卡、答题计数/日期、资料登记、通知点击及学习备份仍沿原绑定和账户分区；恢复/同步不提升答案权威。身份通知仅含type提示，不携带凭据；日志只含静态标签/有限计数。真实账户、自然多窗口与设备验收单列。[持有者及接口](04-API-DOCUMENTATION.md#用户数据持有者--绑定方式阶段5)，[本轮回归与验证](12-CHANGELOG.md)。

## 私有主库身份索引（2026-10-03）

腾讯新建私有主库已受保护地应用九项 users 身份约束：原 `_id_`、`email_1` 保留，实际合计十一项；users 仍为零记录。本批另有零记录的 `desktop_oauth_sessions` 与独立短期保留索引，没有改账户正文或导入公共题库。主库的应用账户认证和管理库访问拒绝成立，旧服务入口/进程/配置保持。该结果不是旧账户恢复或真实 OAuth 验收。

管理员迁移 `scope:"user-identities"` 与完整迁移共用同一份定义。微信网站 AppID/openid 复合约束与微信移动、QQ 移动、QQ 小程序合计四项复合索引，仅在两个字段均为 string 时参与；openid、h5_openid、unionid、qq_openid、qq_unionid 的五项单字段索引为 unique+sparse。缺身份字段可共存；已经保存的同平台/应用身份须唯一，不能靠更改索引放宽归属。该限定范围不创建 `idx_email_unique` 或其他集合，保留原 `email_1` 名称和定义。新受保护维护事务分别调用此范围及下述独立短期范围，旧八项回执以完整哈希保留为来源，新增回执不覆盖它。

真实本机 Mongo 8.2.5 验证九项身份范围、重复拒绝、跨应用独立与部分失败恢复。腾讯 Mongo 9.0.2 的候选临时库进一步验证本库 readWrite 角色实际创建/删除索引及重复执行；主库主动后检失败演练只撤销本批网站约束与新空短期集合，前批十项用户索引及原完整指纹恢复。正式事务随后接受并独立验证，备份字节保持，事务临时资源已清理。维护校验兼容显式默认 `simple` 排序，但完整原索引 metadata 仍须精确不变，其他规则/额外字段拒绝。[接口合同](04-API-DOCUMENTATION.md)，[实际部署与回退回执](09A-LAF-BACKEND-DEPLOYMENT.md)。

## 桌面授权短期记录

`desktop_oauth_sessions` 使用随机 64 位十六进制 `_id` 与 `contract=wenli-desktop-oauth-v1`。字段为 provider、appId、redirectUri、nativeOrigin、challenge、phase、deadline、Mongo Date 类型的 expires_at、pollAfter；可有固定 reason 和认证加密 result。phase 为 pending/exchanging/ready/failed/cancelled/consumed。result 仅加密账户引用和首次登录标志，不存Yozi AI JWT、供应商 token、授权码、明文用户 ID 或 verifier；认证附加数据绑定会话/challenge/deadline，领取或取消清空 result。它不属于学习记录导出/同步。

现有管理员迁移新增独立 `scope=desktop-oauth`，只创建 `{expires_at:1}`、`expireAfterSeconds:0`、名称 `idx_desktop_oauth_expiry`；管理员鉴权先于范围处理，不顺带执行用户或完整迁移。开启前核对实际索引，缺失或无法读取时 begin 拒绝创建记录。TTL 后台清理不保证准点，因此每次动作另检查严格 deadline；备份恢复或延迟删除不能延长授权有效期。真实本机认证 Mongo 的索引幂等、权限拒绝、并发单次领取、取消/过期/当前账户重查及实际过期清理已验证；腾讯私有主库的限定应用、实际撤销新空集合和独立后检已接受，实际只有两项索引与零记录。桌面分支保持默认关闭，真实授权与原生成功领取另验，客户无需手工修库。

## 地区登录身份与年龄隐私

当前新建身份索引见[04 登录合同](04-API-DOCUMENTATION.md#微信回调桌面接续与索引)，共八项。Apple 使用 apple_client_id + apple_sub，Google 使用 google_client_id + google_sub，均为完整字符串身份的复合唯一索引；手机号 phone 为 unique+sparse。Google/Apple 邮箱不参与账户合并。已有 QQ 账户、字段及服务器既有索引原样保留，只停止登录和新增 QQ 索引；上方私有主库事实是历史验收，不回写。

美国创建只记录 registration_region、age_over13 和 age_confirmed_at，不存出生年份、月份或日期。auth_confirmations 的年龄票据只存哈希和确认事实，OAuth 会话仅存必要 nonce/客户端/用途与使用状态，十分钟到期；phone_codes 只存号码哈希主键、验证码 HMAC/盐、尝试数、频控/幂等及使用状态。两集合使用 expires_at 的零秒 TTL 索引；到期判断不依赖异步 TTL 清理。迁移未在服务器执行。

## 微信账户身份

网站 OAuth 在既有 `users` 保存 `wx_web_appid` 与 `web_openid`；移动保存 `wx_mobile_appid` 与 `app_openid`；公众号保留 `h5_openid`，小程序保留 `openid`。只采用服务器换码核实的身份，一致的服务端 `unionid` 可以衔接同一账户；绑定冲突拒绝合并。没有 unionid 时不写 null，避免现有 sparse 唯一索引把无 unionid 的账户互相冲突。客户端资料、角色或 openid 不写入身份字段，供应商令牌不落库。

网站新增 `idx_wx_web_identity_unique`，键为 `{wx_web_appid:1, web_openid:1}`，unique 且仅两个字段均为 string 时参与。真实本机 Mongo 8.2.5 使用当前编译产物，验证九项迁移幂等、网站重复拒绝、跨 AppID/缺身份共存、并发首登单账户与重复复用；网站索引局部失败后限定恢复保持原邮箱与记录。未授权操作和应用账户管理库访问拒绝，临时库/进程已清理。本批腾讯候选、主库限定应用与独立回退随后接受，九项来源绑定同哈希归档；没有真实供应商调用或公网切换，见[09A](09A-LAF-BACKEND-DEPLOYMENT.md)。

原管理员迁移 `db-create-indexes` 增加 `idx_wx_mobile_identity_unique`，键为 `{wx_mobile_appid:1, app_openid:1}`，unique 且仅两个字段均为 string 时参与。上线开启移动登录前须通过受保护迁移并核对实际索引，不把迁移返回的警告当成功。本机 Mongo 8.2.5 的隔离临时库已验证管理员拒绝、实际建索引、并发首次登录只创建一个账户、无 unionid 的多账户、跨 AppID 隔离及重复身份 11000 拒绝，数据库和进程已清理。腾讯 Mongo 9.0.2 的当前候选临时库随后实际验证该复合索引、防重复、跨应用独立和缺身份共存；主库限定迁移已接受并验证，SDK/应用配置与真实授权继续独立待验。[索引规则](https://www.mongodb.com/docs/manual/core/index-partial/)，[接口合同](04-API-DOCUMENTATION.md)。

本机 `conversation_learning_v1_upload_pending` 沿现有账户命名空间隔离，严格根 owner/contract=wenli-upload-journal-v1/entries；每项仅 id、connectorOrigin、storageId、size、recognitionAllowed、recognitionEngine、createdAt 七字段，不存姓名、路径/句柄、原始Base64、令牌或提取正文。最多20项、序列化25000字符，保存前验证/写租约/实际账户；满额或保存失败不发送正文，不驱逐未确认项。读取副本与刷新不触发网络，不导出/同步此定位登记，不改学习事实版本或集合。整份本机学习记录删除保留登记供后续明确核对/取消；完整账户本机清理仍按既有全部键清理，不声称同时清理解析器原件。

用户解析器的 `upload-receipts/` 为0700，storage-id为稳定32位随机身份/0600，编号SHA256命名JSON为0600/至多2000字节。严格字段为 contract/requestId/state/size，可有 fileId/owned/bodyFingerprint/originalDeleted/sharedOriginalRetained；文件指纹不替代鉴权或原目标许可。状态 prepared→receiving→stored 或 closing→closed，原件失败仍留无正文定位事实；关闭墓碑不可因晚到原件重放复活。既有/被其他登记使用的原件不由当前待办关闭删除，普通资料明确删除则关闭相关声明并删除原件/页图。512项上限包含关闭墓碑；不自动驱逐。已接明确预览/确认的登记整理：持久epoch记录generation、原动作编号/预览指纹及有界计划，先换代封存旧编号再移除已关闭登记；未确认登记及原件/页图保留，重启沿同计划恢复。原件没有自动到期删除策略。原件内容只存在用户原配置存储，默认临时目录退出清理；临时测试清理不是用户保留策略。

本机共享标记字段严格为 owner、contract=learning-lifecycle-v1、generation（8—120字符字母/数字/下划线/连字符），沿现有账户命名空间隔离，不含正文、路径、令牌或状态权威，不进入记录导出/同步，不新增学习逻辑版本或后端集合。整份学习记录删除保留此撤销元信息以通知其他窗口；完整账户本机清理仍移除它，标记移除亦使已观察实例换代。标记写入失败时不开始相应事实/备份写入；标记已成功而后续事实保存失败时，事实按既有失败/恢复合同保留，但旧动作授权已撤销，不能自动复活。读取旧无标记数据不写元信息，仅准备正文动作在写租约下首次初始化。

前一资料单元增加会话内的授权代次、文件动作序号、Reader/AbortController与连接快照；不新增集合、事件字段或学习版本。代次由连接对象及端点/来源/consent/令牌变化递增，返回值不含凭据。临时正文/句柄仍不写入备份/同步；成功解析才沿原私人资料事实保存。该单元当时仅保护当前Store/窗口；现已由上文共享撤销标记扩展，不改变旧学习事实格式。

Mac Apple OCR 资料保存 `recognitionEngine=apple-vision` 与当前许可；每片段有 `extractionVersion=poppler-apple-vision-v1`、行级 `words`（候选文本/像素框/置信度/未分配角色）、`dimensions`、`coordinateSpace`、原图/原件SHA及疑义。空白图为 `recognitionStatus=no_text`，不是正确答案。重复原件保留旧提取事件、更新当前片段与引擎；私人题来源取对应片段版本，兼容旧资料顶层版本，避免混合批次误标来源。失败PDF页保留 `status=failed`、可定位重试；全批失败不称ready。新图片识别失败而没有资料回执时仅回滚本次新副本，旧原件保留。删除沿原私人记录/原件回执合同。

App所选文件的临时句柄/元信息仅页面与原生模块内存，URI、安全作用域、原始Base64不进入记录/同步/导出；成功解析后仍沿私人material/原件定位/提取事件。选择与读取绑定实际账户及Repository生命周期，普通作答不使其失效，清除/恢复或换账户拒绝旧结果，不新增集合、逻辑版本或数据权威。

App连接器不增集合、学习版本或工具权限。transport id仅关联原生取消，不替代稳定业务requestId；目标/令牌仍会话内存，回调不能自封判分或执行工具。私人原件续解析/删除成功后沿原事件保存，不持久化失败正文、令牌或原生异常。详情见[09C](09C-APP-CONNECTOR.md)。

条件先修题使用prerequisite-condition-v1，方向direction为p_to_q/q_to_p，topic为condition-sufficient-direction/condition-necessary-direction/condition-both-directions；原题、对话、理由及有序1—2条可靠wrong引用沿现有prerequisite。新增时验证全题最新作答；额外权限/来源字段拒绝。小题answerType为condition_implication，conditionProbeAnalysis为contract/status/domain/reason；validation的holds/counterexample/cells/domain/excluded从题干重建。小题无parentQuestionKey，后续变式绑定完整原题；同一事实/帮助/更正/删除/任务分母合同。下文v1/v2规则继续适用于整数/代数，旧记录不自动升级，不新增逻辑版本或数据库集合。

条件题不改变逻辑版本。answerType/validation.type为condition_relation，conditionAnalysis保存contract/domain/status/reason；validation包含双向关系、原排除值、精确反例、空成立集标志及有限分段依据。normalize/grade从题干重新计算，导入/模型不得自定relation/authority；source保留且publishable=false。独立反向题保留parentQuestionKey/共同数域/排除值，帮助、首答、复习及资料级联删除仍沿原事实，未保存另一个能力分数。

微信连接器增量不新增集合或逻辑版本。目标/令牌/来源许可仍只在当前会话内存；选中文件的临时路径、元信息与Base64仅在逐次确认后的动作内使用，不写入学习事实或同步。解析成功后沿既有私人material/原件定位/提取版本合同入库，账户/连接切换拒绝旧回调；删除仍需匹配原解析器与有效回执。

## 连续学习状态

版本 1，包含 owner、revision、timezone、conversations、materials、questions、attempts、plans、events、executions、profile、strategy、reviews；可选 materialDeletions 与旧版本兼容。客户端分用户保存 conversation_learning_v1，旧键不改名；服务端 learning_states 存 user_id / revision / state。

路线增量仍为逻辑版本1和同一learning_states：会话可有journey（目标/配置版本/原时区）、trainingGroups（稳定questionKeys/日期/模式/时间/configVersion/submittedBy/attemptIds）、recaps（范围/题组/原答依据/签名/完整状态）。原答沿原attempts绑定trainingGroupId；原子交卷事件保存成功才形成完整题组，不另存一套成绩或能力提升事实。日间对比、巩固卡和接续摘要均从有效原答派生，不作为独立权威写入。

日期/模块目录与每日模型接续仍是同一目标的只读投影，不增加数据库集合、事件或逻辑版本。Store的conversationLocation只在当前页面内存保存；50条消息视图分页、更早日期展开及每日输入限额均不截断保存的messages/events，也不把各日另存为子会话。`learning-daily-context-v1` 的分母与证据编号不是新的成绩、能力或长期掌握事实；授权/停止和完整导出保持原合同。

会话可有reminders与最多200条reminderReceipts。提醒保存id/generation/version/kind/time/repeatDays/timezone/enabled；回执只表达终端接纳/失败/未知/用户点击，导入或同步归一化为historyOnly，不证明本机已重新安排。学习时区和通知时区分开，设置/暂停换代。终端许可learning_notification_consent_v1绑定账户、登录会话代号及撤销标记，不进学习导出/同步；原生会话序号、待领取点击和启动等待队列仅运行时内存。

题目使用 id@version，保留来源/原件/页码或区域/修改记录、scope、uncertainties、validation、parentQuestionKey。作答关联会话、题版本、原答、提示、时间、taskId、判分和纠正；first、redo、revision、variant、review 分开。来源真实与答案正确分别验证，AI 辅助评估不覆盖可靠判分。

事件含稳定id、type、at、data和执行结果。重复标识同内容复用，异内容拒绝。资料与错题保持私人；publishable=false不能绕过公共题库门禁。当前逻辑状态序列化上限600万UTF-16字符/2万操作；设备实际容量可更低，不承诺无限历史归档。

同步显示的已接收/待补传数量仅属于本次请求状态，不写入学习事件、普通备份或数据库事实。最终云端必须保留本次开始时的全部操作才完成；同步途中新增的本机操作继续留待下次明确同步，不能把原有缺失伪装为后来新增。学习版本与同步协议未改变；本地物理页压缩合同见下段。前一批2026-10-04 实际 H5 两万操作完成预览但分页保存失败，原12操作保留；六千操作完成实际保存、全量分批同步和服务端压缩/分页核对，仍不证明其他设备的容量上限。

本地物理页按需采用 `{owner,generation,index,encoding:"learning-page-gzip-v1",characters,payload}`，payload为gzip的规范Base64；不可获益则仍为旧 `{owner,generation,index,text}`。每页声明/解码最多120000 UTF-16字符，解码过程中限制输出，完成后继续核对原目录长度/校验和。目录、逻辑事件、公开 `learning-history-v1` 与服务端 `learning-gzip-v1` 分别成立，不把压缩或校验和称为权限/加密/判分依据。新旧页混读、恢复复用、隐私删除后无孤立正文页和访客原件读取已纳入回归；旧读取器对压缩页拒绝而不覆盖。两万操作的本机实际保存与公开全文比对已通过；其他设备、不易压缩数据及600万满边界仍待验。

### 计划安排时区（阶段5S）

新客户端的本机 `plan.set` 操作在 Repository 单次或整批保存时捕获 `data.timezone`，与计划一起进入事件、备份和同步。新客户端 + 新服务端组合下，共享 reducer 与账户时区设置共用运行时 `Intl.DateTimeFormat` 接受范围的校验，并据此计算缺省 day 和计划 timezone；后来更改账户时区、在另一时区恢复或首次同步都不重算原计划边界。该校验不只接受 IANA 名称；非法值统一返回 `INVALID_INPUT`，计划错误为“计划时区不合法”。新客户端连接旧服务端时，旧服务端忽略该字段，仍按重放时区计算；发布与回滚须遵守[后端先行规则](09A-LAF-BACKEND-DEPLOYMENT.md#学习同步的发布与回滚顺序)。只读统计仍按当前账户时区，复测仍按原题的 plannedTimezone/dueDay。

逻辑版本保持1。已有同编号操作不补字段或重写；新操作重复省略时区时沿原已保存值比较，其他正文或显式时区变化仍拒绝。旧无 `data.timezone` 的事件保持按重放起点时区解释的兼容行为，本阶段不推断其原时区或迁移历史数据；旧客户端读取新事件的语义尚未验收。

## 统计口径

- 首答错题率：可靠判错的有效首次作答 / 全部可靠判分有效首次作答。partial 单独表达；闲聊、重试、重做、待判定、AI 辅助不进分母。6 次可靠首答 2 错 = 33.3%。
- 任务完成率：指定日期及指定计划版本的满足条件任务 / 该版本全部任务。10 项完成 6 项 = 60%。新版本关联 replaces，旧任务不删除以抬高完成率。
- 掌握状态：尚未检验、需提示、可独立完成、待复测，由独立作答、提示、变式和复测证据推导；不展示未经校准的精确百分比。

历史事件使用原始 at，日期按学习者明确时区计算；新客户端 + 新服务端下，新计划事件保留创建日期/时区，时区变化不重写历史时间。争议转待复核时同步撤销可靠错题、知识判断和相关复习，之后可凭独立依据更正。

## 迁移与备份

旧 mistake_book / studyProgress / study_engine_state_v1 / imported_files 保留原键并建立待复核快照，不虚构尝试级证据。新备份恢复以事件为准，忽略导入派生数组和事件 result，受限确定性验题器重新计算；未独立验证的人工参考降为待复核，依赖它的复习暂停。已有完全相同操作保留，不重复统计。普通备份不迁移身份；固定访客入口须先预览并明确确认，原访客记录保留。

保存前态成功后才提交新状态；恢复使生命周期变化，旧同步响应拒绝覆盖。撤销最近一次写入不删除云记录、不撤销供应商真实成本；同步需单独授权。旧快照 legacy 不参与备份恢复重放，原 JSON 可独立保存和复核。

账户、权益和密钥分别存 learning_accounts / learning_model_keys，合同见[14](14-MODEL-PRIVACY-COST.md)。旧集合定义仍在[database-schema](../laf-backend/database-schema/)，结构存在不代表生产索引、权限或数据已部署。

## 历史物理格式

本机旧raw原样可读；超过120000字符保存`learning-pages-v1`manifest（owner/generation/characters/checksums），页面键为`conversation_learning_v1_history_<generation>_<index>`，值绑定owner/generation/index/text，继承既有分用户前缀。4个head为当前/recovery/migration_backup/sync_conflict；同内容页面可共用。`_history_catalog`登记最多8个generation的页面数量，`_history_write`仅保存无正文写入记录；先写全部页面再切换head，下次可清理无引用部分。只读窗口不清理活动写者，删除与清理仍受写者租约限制。

服务端仍是同一learning_states文档；大state保存`learning-gzip-v1`的owner/characters/digest/payload（gzip Base64），单文档revision CAS原子更新。小状态和历史raw兼容，成功变更才逐步转新物理格式。Node解压后再次验证逻辑结构/资源/归属。分页只传当前稳定revision，不增加数据库分页集合；旧二进制服务不认识新封装，生产回滚必须使用独立前态备份或授权转换演练，不能直接回退旧程序。

大导出只保存有效原始事件及timezone/owner和分页manifest，格式`learning-history-v1`；checksum用于损坏检测，不赋予答案权威。恢复不接受导入派生统计、result或密钥，重新按原业务校验重放。大访客迁移沿用单独明确确认入口、源完整内容指纹和同日计划并集，普通恢复不允许修改owner。资源上限和超时见[04](04-API-DOCUMENTATION.md)。

## 连续性增量

plan.merge 保留两份同日计划的完整任务并集、sourcePlanIds、replaces 和新版本。同标识任务条件不同则拒绝；任务完成依据只继承有效记录，不删除未完成项。访客迁移同时检查当前 revision 和源内容指纹，重复迁移不重复统计。

同步冲突副本按用户保存双方状态、冲突 ID、时间；新副本另存独立 generation，旧无此字段的完整归档继续兼容读取。此代次仅用于本机归档身份，不进入学习事件、普通记录导出或后端同步，不新增数据库集合或学习逻辑版本。预览同时绑定本机 revision、记录生命周期、当前归档身份与远端内容指纹；归档移除/同版本替换、记录删除后同 ID 重建使旧确认失效。采用云端不删除本机归档，恢复本机不偷偷改云端。退出登录保留 conversation_learning_v1、旧 FSRS/错题/进度/导入等命名空间；显式删除与退出分开。

资料重新提取增加独立 material.add 事件。相同原件的最新片段与进度合并，extractions 保存提取事件、版本、时间和片段 ID；片段及后续题源带 extractionEventId，旧原始事件可追溯前版本。完全相同批次重试复用原操作，变更提取不被幂等标识误挡。预览仅允许受限内嵌 PNG/JPEG，拒绝任意跟踪 URL 与 SVG。

deterministic-v2 仅增加有限单位/量纲换算及有限数值解集（分数、±、无序集合、实数/整数/正数条件），不执行任意表达式或符号代数。缺独立依据、单位不兼容、定义域/参考错误仍待复核；缺部分有效解为 partial，单独统计。提示后正确仍不升级为独立掌握。

## 教学交付与复习准入

`teaching-followup-v1` 从现有messages/executions/events/attempts/questions/reviews派生，不新增数据库集合、模型生成统计或持久效果分数。有效执行/历史交付、原题关系、事件次序、提示与当前effectiveGrade共同决定观察；待核对不进入可靠后续分母。到期通过需要无提示review和已有有效到期调度；提前复测/原题重做不充当长期检验。每段最多保存最近6个尝试ID于返回结果，total仍给出全部可观察交付数。资料删除后原关联消息/题/尝试已清理，观察随事实消失，不留下额外缓存。

strategy继续逻辑v1，source/conversationId为新事件的兼容可选字段；旧事件没有字段时按原合同重放。source区分用户指定、观察调整和模型建议，模型工具参数不允许指定source；宿主赋值。assessment.correct/review更正自动策略的证据时撤销当前旧判断、转为等待检验，但不改变用户指定教法或停止状态；当时的strategy.set事件仍可追溯。

全局strategy保留兼容；当前对话的教法/难度/理由从strategy.set/strategy.auto及更正事件按保存顺序派生，不新增独立画像存储或更改逻辑版本。各对话使用自己的stopped；question.focus不再清除此标记，只有用户明确task.resume才继续。strategy.auto仅释放该对话的指定教法，停止和已发生帮助保持。备份不信任result，而由原事件重放产生结果；同步/重开读取同一派生方法。其他对话的调整、更正、停止不能覆盖本对话选择。

诊断题prerequisite包含contract、originalQuestionKey、topic、conversationId、evidenceIds、reason。整数/代数新建使用prerequisite-diagnosis-v2，增加与1—2条引用按原保存顺序对应的evidenceOutcomes（wrong/partial）；原题独立规则再验原答和有效判分，partial不转成错题。旧v1无此字段，按冻结的题干/理由和旧错答合同重放。共享reducer验证已存在原题/对话、引用顺序、分类、结果、理由、题干和规则，不接受伪造宽容度或依据。

知识范围以“先修：”单列，无parentQuestionKey，小题独立正确不记为原题迁移。后续原题变式用原parentQuestionKey；v2方程检验保留原数域、排除值和完整解集，不以化简替代求解。诊断结果从当前尝试/帮助/更正派生，依据改变转待核对，保存历史题和任务分母，不另存能力百分比。原资料删除沿原题关系级联覆盖诊断题及变式。

`teaching.deliver` 将已交付内容、题目版本、方法、来源、帮助层级与执行收据作为一次原子操作保存。失败不留下半条消息或成功收据。普通模型文本不能可靠证明自己没有提供帮助，绑定当前题目的回复保守记录为帮助；本地确定性教学按实际动作标记。备份恢复保留历史帮助和消息，教学执行收据标为历史，不能冒充刚执行成功。

对话内 `helpQueues` 按题目暂存未提交的帮助，旧对话无需强制迁移。导航、跨对话返回、刷新、换教法或点复测不清除这次尝试的帮助；正式提交把同题帮助去重绑定到尝试并消费，不串入其他题。无知识点标签只形成当前题目判断，不汇总为整个综合学科。原题重做正确为待复测，不宣称长期掌握。

FSRS准入策略 `reliable-due-v1`：首次可靠检验建立安排；随后仅到期的显式 `review` 推进调度。即时重做/提示后修正/提前复测只保存作答；可靠错误或部分正确映射 again，提示正确为 hard，独立正确为 good。安排保存策略版本和有效证据ID。旧调度事件按原合同保留，不能借新规则重写历史。没有通知能力时始终 `notificationSent=false`。

`review.rebuild` 仅在同题已有实际更正事件时，从仍有效的可靠作答重建安排；保存 rebuiltFrom/证据，撤销旧派生安排，不新增作答或独立复测。提示修正仍按hard保留，全部依据失效则无可调度安排。

## 资料隐私删除

`material.delete` 保存资料标识、已知题目版本和可选原件定位，不保存正文或令牌。`materialDeletions` 保存墓碑、相关题目版本、删除时间及 originalStatus（pending/deleted/not_applicable）。同原件与同解析器采用稳定复合资料标识；指纹只用于命名，目标/鉴权仍独立校验。旧重复导入保留 aliases，旧快照缺 aliases 时从实际导入事件重建 materialIds，别名题源同样清理并写墓碑。同资料不同设备的删除操作可以合并；迟到原提取、原题和派生变式不得恢复已删除内容。明确重新选择文件导入使用新资料标识；不同解析器的同文件各自保留原件定位。

预览绑定 owner/revision，并统计资料题目版本、关联对话、全部正文与作答、受影响任务。确认后移除资料原文/提取/页图、关联题目及变式、关联对话的全部正文和作答、对应复习与判断；同一关联对话中的其他题作答也在清理范围内，预览明确计数。其他对话的独立学习事实保留。计划保留所有版本和任务分母，受影响任务改为“关联资料或作答已删除”、完成证据清空，不能再标完成。

原事件改为 `privacy.redacted`，只保留标识、删除关联及必要空对话/计划骨架；删除墓碑先重放。全量事件、结果收据和导出也清理正文。恢复副本、迁移副本与双方冲突副本清理；隐私删除不建立含旧正文的恢复副本。写入失败由 `_privacy_pending` 保存无正文操作，读取时重试完成；未完成不宣称成功。普通撤销或陈旧同步快照不复活删除事实。备份的新墓碑不能隐式删除当前资料，须先独立预览确认；备份原件回执只作为历史，恢复后重新确认。

同步先发送删除墓碑，再发送脱敏骨架，服务端按当前用户 CAS 应用；未授权同步不自动上传。离线其他设备仍可能保留旧副本，重连同步应用墓碑。旧兼容键、已导出文件、其他设备缓存和运营备份不在单资料本机删除的即时范围；不承诺物理安全擦除或所有副本已消失。

## 主观评分记录

题目可选 rubric（id、version=1、source、criteria）与 rubricRevisionOf。来源仅 user_defined/reference_candidate/model_generated，不能声明答案权威。维度包含固定id/name/description/maxScore；每次编辑形成新题版本，原维度和作答不变。仅评分修订关联同题、原版本和相同题干；真实题干校对解除该关系，避免伪装成同一次题目。

attempt.assistance 的 `subjective-rubric-v1` 记录 rubricId、questionKey、实际模型标识、维度定义/得分/反馈/原答引用、score/maxScore、outcomePolicy=`rubric-total-v1`、status=ai_assisted、reviewRequired=true。任一缺分则总分null；不参与可靠首答、错题或FSRS。原答引用直接核对绑定尝试，不能引用题干、参考答案或其他对话。旧 `unscored-feedback-v1` 无量化评分，兼容旧反馈。

新宿主assess事件增加data.rubricContract=`subjective-rubric-v2`；未声明或明确v1的历史事件按原合同重放，逻辑事件版本仍为1。v2 assistance增加attemptId、evidencePolicy=`original-answer-range-v1`；每维度保留evidence原文字符串，同时保存从原答重建的evidenceLocations（quote/start/end、按Unicode码点显示的startCharacter/endCharacter、occurrence/occurrences、before/after）。start/end为UTF-16半开范围；附近原文最多前后各24码点，无额外上传。输入不接受自带附近正文；同步/备份忽略派生位置并按实际事件重算，隐私删除清除原答、范围、附近正文及相关副本。重复引用未定位或同范围重复、原文/范围不符继续拒绝；未校对疑义不留确定维度分值，所有评分仍待人工语义核对。

新明确写作原答的事件类型为 `attempt.submit-original-v1`，完整字符串与事件正文一致；旧 `attempt.submit` 保持历史裁剪或既有原串例外，不重新解释旧答案。引用范围始终以该次已保存原答为依据：旧裁剪答案的UTF-16位置与新完整答案的位置分别保留。新类型不改题目/量表/逻辑状态版本，无确认标记整批失败且不持久保存；同ID重试不能改类型或正文。未知新事件的旧端重放拒绝不等于旧快照全面安全拒绝，程序恢复仍配套对应资料及元数据回执。

重复评估事件复用；不同评估可保留多个意见，不能据一致性升级权威。备份/同步按事件重放结构和业务校验，不能信任派生分值或reliable标签。仅修订维度的同题版本继承原帮助；存在旧尝试时新作答为重做，重复修订不制造新首答。资料删除沿用关联题源清理这些评分、原答和事件。

## 代数题目与判分证据

完整数学任务增加 answerType=algebra、algebra.contract/task/domain/status/reason 及重新生成的 validation。validation 记录 safe-algebra-v1、完整表达、数域、原排除值和全部精确解/恒等解集；分数为 `[整数分子,正整数分母]`，不是浮点近似值。来源 source 保留原文件/页码或 model_generated，不把可执行答案依据当成来源真实性。未知 expression 和客户端伪造 rule 不能取得可靠身份。公共发布仍false。

validationResult.verified/wellPosed 表示在工具范围内完成独立核验；solvable 表示此数域存在解，无解题仍可verified但solvable=false，未能判断为null。关键 OCR 条件未确认仍阻止正式可靠判分。equivalence 核对恒等与原定义域，不宣称所有表达最简或用户推导过程正确。首答/partial/错题/帮助/计划/FSRS沿用同一事实政策，漏条件pending不进入可靠分母，后来重做不制造新的first。变式关系 parentQuestionKey 和 variantChange 保留，正确后仍需复测。

## 模型请求意图与恢复

逻辑v1增加`model.request`事件（复用events，无新集合）：requestId、随机binding、modelId/真实model、conversationId、最近user messageId、questionKey、用户锁定方法；不存密钥、临时预览、整份上下文或模型内部推理。验证消息/当前题与有界字段，result仅表达recorded/modelExecuted:false，不能据此宣称已调用或修改计划。取消保存独立取消意图，不等于供应商成本为零。

完整服务端结果含requestId/modelId/requestBinding/真实model/transport；learning_accounts.calls新增transport、configurationVersion、usageComplete、executionStage。派生成本摘要/连接状态不能提升为学习事实。最终校验后的工具/回复仍用原稳定ID；重开只读恢复不新增模型调用、作答或扣量。模型请求不进入首答/任务/掌握统计。备份导入时model.request标记historyOnly，不能把导入意图变成当前执行授权；同账户当前已有原记录继续保留。资料删除按conversationId/questionKey脱敏这些事件，清理后或生命周期变化不能再应用旧结果。没有新数据库索引或生产迁移写入。

高负载回归进一步定位到逐消息复制与全量序列化的开销，已增加共享reducer的有界隔离重放批次：每批只复制一次，消息追加使用精确JSON长度增量；其他操作仍完整计算，逐操作守容量/幂等/业务边界，任一失败后不能提交批次。普通单次写入仍先复制，恢复/同步最终只在原原子入口保存。未放宽2秒普通恢复校验、120秒长历史预算、600万字符/2万操作或服务端CAS约束。专项对比纯reducer结果、输入不变、失败整批拒绝和容量边界；历史夹具/隔离HTTP适配使用同一批次实现。

成本账calls.result是可删除的私人教学缓存，不是费用依据或学习事实源。结果清除加可选resultDeletedAt；旧文档无该字段按原规则读取，不需要生产迁移。completed的原状态、供应使用量/成本、已扣权益保留；reserved同时标记cancelRequestedAt，后续settle即使收到成功内容也只结算实际用量，result仍null，不重复返还。清除不撤销已完成调用的权益。隐私删除与结算均使用同一账户文档CAS；无账户时不新增空账户。云端学习文档删除是后续独立步骤，可恢复重试，不承诺跨文档原子性。

## 模型恢复资源字段

`learning_accounts.calls` 可选增加 `resultCachedAt/resultExpiresAt/resultPolicyVersion`、`resultReleasedAt/resultReleasedReason` 和 `usageEvidence`。release原因为expired/capacity/oversize等，用户删除仍用独立resultDeletedAt并优先展示。结果不是费用依据；维护不删除calls、原status、fingerprint、actualCost、预留、权益或学习事件。不新增集合/索引，也不要求一次性生产迁移。旧无到期字段的正文从原at计算保留期限；访问时CAS维护，旧原件/备份不因此即时删除。

usageEvidence包含complete/unsupported/missing/truncated、字节数、truncated与可取得的摘要。正文最多4 KiB，超限只保留有限已知计费数值，原真实成本未确认时pending；此前已有结算金额不会被缓存迁移回滚。配置和范围见[14](14-MODEL-PRIVACY-COST.md)。

页图增量仍为逻辑v1的兼容可选字段：model.request.visualSource保存当前题目的原件/片段/提取记录关联，不保存图片正文或密钥；teaching.deliver及派生消息的visualReading经共享合同校验，状态固定AI辅助，角色、区域和疑义都是候选。旧事件无需补字段。备份/同步重放同一校验，解读不添加attempt、错题或计划完成事实，保守记帮助。再次提取替换同片段后旧题不会发送新页图冒充旧版本；先局部校对或新版本处理。资料删除沿用关联对话正文清除与云端缓存清除，不留下解读副本推断统计。

一次不等式沿用逻辑v1和answerType=algebra，algebra.task=inequality、contract/evidenceId=safe-linear-inequality-v1。validation.solution.intervals保存lower/upper（精确分数或null表示无穷）与lowerClosed/upperClosed；全体为双null开区间，空集为[]。执行/同步/备份重放从规范题干重建规则，客户端/模型参考不得修改阈值；不影响旧等价/方程记录。统计继续以实际原答/帮助/更正重算，单次变式仍待复测。旧客户端能力不足可能显示待核对，不能要求它判分新合同。
