# App 受保护原生连接器

App 文件链路见下方 `wenli-app-file-v1` 合同；页面入口已接，缺已装配保护模块仍安全拒绝。本批证据在 `tmp/app-material-delivery/delivery-report.json`。

目前实现的是插件源码与宿主入口，未携带编译后的移动插件，未修改 `src/manifest.json` 装配它。缺模块或合同不符时在发送令牌前拒绝。`npm run build:app` 的前端产物不能证明插件装配、Android/iOS 运行或设备可达。

移动微信登录已沿现有 SDK/API 补齐只获取授权码和独立服务端换码的源码，取消/超时/重复回调、账户切换及服务端身份冲突检查通过；本机真实隔离 Mongo 已验并发账户复用。App 前端产物包含 `onlyAuthorize=true`，没有移动 Secret；`manifest.json` 的实际微信 OAuth 应用配置、匹配 DCloud SDK 原生装配及真实授权仍待完成，不把前端构建当 SDK 验收。[客户步骤](09-DEPLOYMENT-GUIDE.md)，[接口](04-API-DOCUMENTATION.md)。

QQ App 登录只经 SDK 与现有 Store 提交 token，由服务器核验对应 `QQ_MOBILE_APPID`，不上传客户端资料。provider/SDK 共享 120 秒上限，重复回调仅一次提交，迟到结果不能改变账户；本机源码测试与真实隔离 Mongo 通过。App 前端产物审计未发现 QQ 小程序 Secret 标记，真实 QQ SDK 配置、原生装配与手机授权尚未完成；Tauri 不借用移动 SDK。[身份合同](05-DATABASE-SCHEMAS.md)，[客户步骤](09-DEPLOYMENT-GUIDE.md)。

## 能力与边界

宿主 `src/services/learning/app-connector.js` 只加载 `Wenli-Connector`，要求 `wenli-app-connector-v1`、拒绝重定向、字节上限、严格 UTF-8、系统 TLS、取消全部匹配。原服务保留明确目标、令牌、逐次授权；不回退 fetch、uni.request、其他供应商或平台消费。

Android 用 HttpURLConnection，iOS 用 NSURLSession，独立校验精确 origin、固定 `/health`、`/chat`、`/parse`、`/delete` 与 GET/POST；拒绝 URL 用户名、查询、片段和未知路径。令牌只在请求内存，固定来源 `https://wenli-app.invalid` 不是目标地址或认证；连接器须显式允许此精确来源，不扩大通配、SSRF、Bearer、资料许可、预算或幂等。

3xx 或 Location 拒绝；原生响应最多 2,000,000 字节、硬时限最多 35 秒、正文最多 15 MiB，业务继续用原服务更小上限。Java 活动任务/等待队列各最多四项，Foundation 活动任务最多四项；取消/关闭只回调一次，迟到不落事实。Android 不修改全局 CookieHandler、代理、TLS 信任，iOS 使用无 Cookie/cache 临时会话；系统 TLS 保持，测试证书不安装。

已接文本、健康、已有原件续解析及匹配删除；系统文件选择和确认后的有界读取源码及页面入口保持。云教学流式源码接入下方独立能力合同；Apple OCR、模型页图输入和完整 DCloud 装配仍分别核对本机覆盖范围；外部真机测试事项已移除。逐次共享、账户/连接变化、原件删除沿原合同。本机回环仅表示本机服务可达；HTTPS、ATS/Android网络策略和网关按本机可运行环境分别核对，未覆盖的设备特有行为保持未验证。

## 云教学分块（wenli-app-stream-v1）

流式宿主复用现有云教学、Store 与 UTF-8/SSE 校验，不通过本地 `/chat` 增加工具或云回退。除基础保护合同外，须具有 `stream` 方法和匹配的分块能力：`contract=wenli-app-stream-v1`、`chunks=base64`、`sequence=true`、`maxBytes=2097152`、`maxChunks=256`、`timeoutMs=45000`。旧模块或缺项在发送令牌/学习内容前拒绝，页面继续由原模型能力与平台支持控制，用户主动启用。

原生仅接受明确授权 origin 的 `POST /proxy-ai-stream`，真布尔共享许可、有效访问令牌和原有 15 MiB 输入上限；下游沿既有教学流 2 MiB/45 秒预算，每原生分块最多 8192 字节、最多 256 块。普通连接器四条路由及 2,000,000 字节/35 秒合同保留，两个入口不能互换。Foundation 同时拒绝数字 1 代替许可、布尔值代替数字预算。

| 回执     | 校验与作用                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------ |
| headers  | 首个序号 1、HTTP 状态、最多 200 字符的 Content-Type、累计字节 0；拒绝 3xx/Location               |
| chunk    | 同一请求 ID、连续序号、规范 Base64、逐块和累计字节核对；只给共用 UTF-8/SSE 消费器                |
| complete | 同一 ID、下一个序号、精确累计字节；原生完整 UTF-8 及客户端 EOF/模型绑定/最终结构分别通过才可应用 |
| code     | 固定安全错误码，单次终止；取消、超时、关闭和迟到保护不触发替代请求                               |

Android 适配器用 `invokeAndKeepAlive` 保留中间回调、终止用 `invoke`；iOS 用 `UniModuleKeepAliveCallback` 的 YES/NO 区分中间与终止。[DCloud Android 回调](https://nativesupport.dcloud.net.cn/NativePlugin/course/android?id=unijscallback%E7%BB%93%E6%9E%9C%E5%9B%9E%E8%B0%83)、[iOS 回调](https://nativesupport.dcloud.net.cn/NativePlugin/course/ios.html)。桥只传 JSON 与 Base64；JS 有界解码不依赖 WebView 的 atob/TextDecoder，原生内核仍按字节处理。官方 API 与源码接入不能证明实际 DCloud 桥已装配。

预览只在临时区域显示。读取每一分块/事件都调用现有账户、对话、题目、记录生命周期、模型与共享授权校验；变化即拒绝并取消请求。完整收据前无计划、工具、作答或可靠首答，失败只保留原请求意图供既有只读恢复；实际模型用量仍须查询，不能因取消填写零成本。停止、离页与迟到不恢复执行。

## 移动 SDK 编译

**2026-11-02验证范围更正**：客户要求所有测试在本机完成，移除手机连接／解锁、外部设备与跨设备实测事项；产品多端方向和既有适配源码保留。本机编译、桌面原生、共享App、本机已具备条件的原生／模拟器与独立桥接测试分别报告，不把其中一种替代未覆盖能力；以下历史“未做真机”属于事实记录，不再形成外部设备验收门槛。

**2026-11-02当前准备状态【未装配】**：本机Xcode可用；实际DCloud Android classpath和iOS头/框架路径均未配置，未发现已安装HBuilderX入口。本轮沿既有build-only入口预查，因 `DCUniModule.h` 及依赖未配置退出2，未生成二进制、下载、改App配置或云打包。不安排连接iPhone或启动手机执行服务；缺少完整DCloud SDK时继续记录未装配，本机已有Apple SDK不冒充完整DCloud装配。

当前锁定DCloud系列为 `3.0.0-alpha-5030120260930001`；已安装vite-plugin-uni的 `uni-app.compilerVersion` 与当前App产物manifest均为 **5.31**。下方10月2日的5.08只属于历史准备记录，不能继续作为当前SDK装配基线。11月2日官方[iOS下载/升级说明](https://nativesupport.dcloud.net.cn/AppDocs/download/ios.html)列稳定版5.34及alpha版5.33，尚无与5.31匹配的本机完整包或兼容验收；不能据“最新版”或单个头文件存在直接判定可装配。取得包后核对官方来源、许可、完整版本、依赖库与资源，再沿现有build-only入口编译；不同版本须有对应平台兼容依据和实际验收，不以关闭版本提示代替。

客户11月2日已授权下载与当前编译器匹配的官方iOS离线SDK并本机装配测试，不做云打包或部署；此前暂缓安排由此接续。当前官方链接的历史包入口仍被浏览器策略禁止访问，未取得SDK，不换工具绕过。SDK取得、实际装配和设备业务验收尚未完成，不称App开发或设备验收闭环。

源码/元数据在 `nativeplugins/Yozi-Connector/`，对应 [DCloud Android](https://nativesupport.dcloud.net.cn/NativePlugin/course/android.html)、[iOS 模块](https://nativesupport.dcloud.net.cn/NativePlugin/course/ios.html)和[打包规范](https://nativesupport.dcloud.net.cn/NativePlugin/course/package.html)。不以模拟 SDK 声明或空二进制替代编译。

`npm run build:app:connector` 默认要求两平台实际 SDK；单平台追加 `-- --android` 或 `-- --ios`。只本地编译，不下载、云打包、安装、部署或修改 App 配置。缺 SDK 退出 2，无二进制；失败清理本次目录，成功保留唯一 `tmp/app-connector-packages/build-*/Wenli-Connector/` 和 SDK 哈希报告，不覆盖旧包。输出目录取插件元数据 `metadata.id`（当前 `Wenli-Connector`），源码目录和类名保持 Yozi 品牌。

- Android：`YOZI_ANDROID_JAVA_HOME` 指向实际 JDK，`YOZI_ANDROID_SDK_CLASSPATH` 用系统路径分隔符列出 android.jar、官方 DCloud 模块 SDK 和 FastJSON 等实际依赖。完整适配器按 Java 8 字节码编译为 jar。
- iOS：`YOZI_IOS_SDK_INCLUDE_PATHS` 列出官方 `DCUniModule.h` 与依赖头目录，`YOZI_IOS_SDK_FRAMEWORK_PATHS` 可列实际 framework 目录。要求 `xcrun --sdk iphoneos` 成功，完整模块/内核编译为 arm64/iOS 11 静态库。

可对当前构建进程设置标准 `DEVELOPER_DIR` 指向已安装 Xcode，SDK 检测及后续编译均保留该选择；不修改全局 xcode-select。本机显式选择 `/Applications/Xcode.app/Contents/Developer` 已确认 iPhoneOS SDK 存在，当前完整 build-only 仍因实际 DCloud Android classpath/iOS 头未配置退出 2，没有生成插件或修改 manifest。

编译后仍须审查二进制/许可，依官方流程装配本地插件、自定义基座，再做独立设备业务验收。当前未执行装配、云打包或生产动作，缺模块继续拒绝。

2026-10-02 本机 Xcode 27.0 和 iOS 27.0 模拟器运行时已经准备，客户自行接受 Apple 许可，全局开发工具选择未改变。当时缺口是匹配项目编译器5.08的DCloud离线SDK、原生插件装配与业务验收；当前版本基线由上方10月14日记录取代。官方历史下载入口被浏览器安全策略拒绝，待客户提供官方SDK本机解压路径，不能换工具绕过。独立iOS Safari已实际提交错答并得到判错回执；提示确认、更正、独立变式和退出恢复尚未完成，且它不证明原生App。后续全部使用普通窗口，不进入全屏。

本机已有Android SDK33/36。额外用SDK33的android.jar及官方Build Tools34 core-lambda-stubs.jar编译纯网络内核，再用已有Build Tools36 D8生成min-api21的dex，均通过；报告在tmp/app-connector-delivery/android-core-sdk-report.json，记录SDK/支持库/D8/dex哈希，临时产物清理。只拿android.jar编译缺Java8 lambda编译支持；旧D8 34处理当前JDK产物遇内部错误，改用已经安装的36通过，无下载/升级操作。此项不证明API21设备兼容或DCloud完整模块/插件装配，DCloud/iOS缺口仍保留。

## 本机验证

`npm run test:app:connector` 在 macOS 用实际 JDK/Foundation 编译内核和 CLI，启动随机回环 HTTP/HTTPS。合成令牌仅内存，自签密钥仅忽略临时目录；结束关闭服务/子进程、移除密钥/二进制。报告及源码哈希在 `tmp/app-connector-validation/latest.json`。

默认使用本机Homebrew JDK；其他实际JDK可通过`YOZI_TEST_JAVA_HOME`指定。移动SDK编译变量与本机内核验证变量分别设置，不以本机头/字节码代替移动SDK。

覆盖鉴权、四路径、中文/emoji 字节、3xx/Location、声明/分块容量、非法 UTF-8、非成功状态、非法目标/授权/容量/时限、超时/迟到、取消、重复 ID、四任务上限、关闭及系统 TLS 拒绝自签；重定向目标、自签服务零 HTTP 到达。不调用模型、OCR、支付或真实后端。

2026-10-04新增云教学分块后的最终版本55组通过（Java27、Foundation27及全局重定向目标检查1），实际64个合成HTTP请求，重定向目标/自签服务HTTP为0。覆盖连续响应头/跨UTF-8字节/唯一完成、入口隔离、严格许可/数值、流式错误/容量/不完整编码、取消/超时、共享四任务及TLS。CLI明确就绪后才发送，并发夹具显式保持在途；原250ms超时攻击保留，独立JVM堆有界，不改变产品预算。失败和最终日志保留在 `tmp/visual-build-20261001/resume-rubric-evidence-20261004/`；最终端口、子进程、合成密钥及二进制均收回。

最终源码再次使用本机实际Android SDK33、官方lambda支持、已有D8 36编译网络/文件内核和ContentResolver源，并生成min-api21 dex；用已安装iPhoneOS SDK编译两个Foundation内核为arm64/iOS11对象及静态库。源码、SDK、dex/归档哈希和编译进程/清理回执保存在该目录 `server.json.appStream.mobileSDK`。一次60秒SDK编译超时保留失败记录；隔离编译器降低JVM堆，并给编译进程120秒期限后最终通过，此期限不涉及模型或网络请求。最终38项可再生产物已清理；完整DCloud适配器编译/装配、Android/iOS设备、真实模型与实际网络仍未通过，不以旧源码哈希或仅前端构建替代。

OpenJDK 过滤 Origin（[官方实现](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/sun/net/www/protocol/http/HttpURLConnection.java)），故只在独立合成测试 JVM 使用 `-Dsun.net.http.allowRestrictedHeaders=true` 允许内核固定 Origin，不改变 App、主进程、重定向、认证或 TLS。此条件不证明 Android 实际 HTTP/来源；Foundation 同样不等于 iOS SDK/真机。JS 专项使用合成模块回调，不冒充 DCloud 桥。

## 系统文件与逐次确认

文件宿主 `src/services/learning/app-material.js` 要求 `getCapabilities().file` 完整匹配：`wenli-app-file-v1`、system 选择、after_consent 读取、ephemeral 句柄、10 MiB、boundedRead 与 cancel。另须具备 chooseMaterialFile/readMaterialFile/releaseMaterialFile/cancelFileOperation，缺项在选择/读取前拒绝。新页面同样开放 App 的模型和资料连接控件，仍不自动配置或回退云端。

Android 使用 ACTION_OPEN_DOCUMENT/只读临时 content URI、ContentResolver/CancellationSignal；iOS 使用 UIDocumentPicker/NSFileCoordinator，并在动作内平衡安全作用域。系统选择只读取名称/大小/修改时间元信息，回到 JS 仅给不可猜测的临时句柄、名称、大小。JS 无任意路径/URL读取入口，不取持久权限、不复制原件、不存书签。平台参考：[Android 文档访问](https://developer.android.com/training/data-storage/shared/documents-files)、[Apple 文件选择器](https://developer.apple.com/documentation/uikit/uidocumentpickerviewcontroller)。系统/文件提供者可能在选择时下载所选云文件；“未读取正文”指本应用尚未打开字节流，不能保证系统选择零网络。

用户选择后查看元信息，再确认当前解析器 origin、文件及 OCR 许可，才打开正文并向已授权目标发送。页面隐藏仍清空模型/资料令牌和授权；系统选择阶段只允许同账户/同记录生命周期的迟到元信息返回，不保留连接凭据。返回时连接已清除须重授权；隐藏、卸载、换账户、同账户清除/恢复记录、取消、连接身份或令牌变化拒绝读取/上传。普通作答不使所选文件失效。

内核最多保留两个句柄、十分钟惰性过期；一次读取后消费/释放，最多一个活动文件任务。Java 等待队列一项、取消清理二线程/四项队列；Foundation 工作单线程、清理最多二并发并有入队上限。元信息前后核对，真实读取最多已选大小加一个检测字节，总上限10 MiB；拒绝增长、截短、修改、危险名称/方向字符和无效编码。未给修改时间的 Android 提供者只核对可取得元信息；同名/同大小/同时间内容变化不保证可检测，本合同不是不可变快照或内容真实性证明。读取硬时限十秒；JS 选择等待最多120秒、读取最多15秒，取消/超时只采纳一次回执。阻塞提供者的物理关闭和系统界面退出仍须设备验收。

读取成功交给原私人解析 Service/Store，继续页数预算、来源/角色、提取版本、幂等及删除回执，不据文件名或模型文本升级公共答案。句柄/URI/书签、Base64和连接凭据不写学习事件、同步或导出。失败/取消不新增资料；真实解析成功后才展示已保存。

## 文件内核实测

`npm run test:app:material` 在唯一忽略目录用真实 JDK 和 macOS Foundation 编译/运行，57项通过（Java29、Foundation28）：元信息/未许可零打开、严格许可、实际文件和二进制Base64、类型/危险名/大小/两句柄、变化/短流/低报大小检测、重复ID/忙碌、取消/十秒超时/释放/关闭一次回调。Foundation 使用真实 NSFileCoordinator 与注册 FilePresenter 延迟放行；Java 使用真实临时文件与阻塞管道。结束清理合成文件、二进制和子进程，报告及源码哈希在 `tmp/app-material-validation/latest.json`，不调用网络或模型。

实际 Android SDK33/官方 lambda 编译支持和已有 D8 36 已编译网络/文件内核及 ContentResolver 源、生成 min-api21 dex，报告在 `tmp/app-material-delivery/android-core-sdk-report.json`。SDK打包已包含新文件，iOS元数据加入UIKit；当时完整 DCloud classpath/iPhoneOS SDK缺失，build-only退出2，未装配插件。当前 Apple SDK 已安装，DCloud SDK/完整插件装配仍待完成。JS页面/Store使用合成模块回调；H5实际两页PDF经Python/Poppler验证取消、确认、片段/页图与刷新。以上分别成立，均不能代替 Android/iOS系统选择器、移动安全作用域、生命周期、网络与真机验收。
