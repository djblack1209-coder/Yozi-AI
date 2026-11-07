#!/usr/bin/env node
/**
 * UI 质量门禁扫描工具
 *
 * 功能：
 * 1. 检查 Vue 组件的加载状态实现
 * 2. 检查错误处理覆盖率
 * 3. 检查 CSS 性能优化（GPU 加速）
 * 4. 检查无障碍访问（a11y）
 * 5. 检查代码规范
 *
 * 使用方法：
 * node scripts/build/ui-quality-gate.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';

// Match product copy, development routes and known synthetic-data markers.
// Framework properties (placeholder/debug) and educational tests are not UI copy.
export const PUBLIC_BUILD_RULES = [
  [
    'retired-bank',
    /(?:config\/flashcard-banks|static\/question-bank\/|bank-data-(?:table|loader|codec)|COMPRESSED_BANK_DATA_BY_ID)/
  ],
  [
    'development-route',
    /platforms\/h5\/components|component-preview|(?:pages|platforms)\/(?:[^"'\s/]+\/)*(?:visual-qa|future-reference|dev-preview)/i
  ],
  [
    'development-copy',
    /本地演示|示例题(?:库)?|开发中|未接入|内测|连接模型|测试连接|模型测试成功|模型未测试|Start local demo|Demo · 3 questions|Model connections|Connect (?:a |your )?(?:AI )?model|Connected; model not tested|Model test succeeded|\bTODO\b|lorem ipsum/i
  ],
  [
    'synthetic-data',
    /guest_demo|demo-00[123]|demo_[123]\b|_isEstimated|estimated_\$?\{|(?:mockData|fakeData|seedDemo|generateMockData)/
  ],
  ['debug-ui', /__BUILD_TIME__|__BUILD_MODE__|__APP_VERSION__|debug-panel|DebugPanel/]
];

export function scanPublicBuild(directory) {
  const root = path.resolve(directory);
  const result = { directory: root, ok: false, scannedFiles: 0, scannedBytes: 0, findings: [] };
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    result.findings.push({ category: 'missing-build', file: '.' });
    return result;
  }
  if (!['index.html', 'app.json', 'app-config-service.js'].some((file) => fs.existsSync(path.join(root, file)))) {
    result.findings.push({ category: 'missing-entry', file: '.' });
  }
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      const relative = path.relative(root, file).replace(/\\/g, '/');
      if (entry.isSymbolicLink()) {
        result.findings.push({ category: 'unscanned-symlink', file: relative });
        continue;
      }
      if (entry.isDirectory()) {
        visit(file);
        continue;
      }
      if (/(?:^|\/)question-bank\//.test(relative)) result.findings.push({ category: 'retired-bank', file: relative });
      if (!/\.(?:js|mjs|html|css|json|wxml|wxss|wxs|map)(?:\.(?:gz|br))?$/.test(entry.name)) continue;
      let bytes = fs.readFileSync(file);
      try {
        if (file.endsWith('.gz')) bytes = gunzipSync(bytes);
        if (file.endsWith('.br')) bytes = brotliDecompressSync(bytes);
      } catch {
        result.findings.push({ category: 'unreadable-artifact', file: relative });
        continue;
      }
      result.scannedFiles++;
      result.scannedBytes += bytes.length;
      let text = bytes
        .toString('utf8')
        .replace(/\\+u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      // DCloud bundles Highlight.js for its native editor. This exact list is a
      // grammar for code comments, not a product label. Other TODO text still fails.
      if (relative === '__uniappquillhighlight.js')
        text = text.replaceAll('TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX', 'code-comment-tags');
      // Published copy uses these phrases in context. Standalone setup labels still fail.
      text = text
        .replaceAll('If you connect a model service running on your own computer or local network,', 'legal-local-service')
        .replaceAll('Your identity, model connections and temporary credentials are cleared.', 'legal-sign-out');
      // The website's published connection instructions and download availability are real copy.
      if (/^(?:(?:en|zh)\/)?index\.html(?:\.(?:gz|br))?$/.test(relative)) {
        text = text
          .replaceAll('data-copy="en" lang="en">about model connections</span>', 'site-connector-reference')
          .replaceAll('data-copy="en" lang="en">connect your model</span>', 'site-connector-instructions')
          .replaceAll('Windows 与手机 App 正在规划开发中，尚未提供下载。</span>', 'site-download-availability');
      }
      // Comparisons reject legacy fixtures; writes and standalone seed markers still fail.
      text = text
        .replace(/\b[A-Za-z_$][\w$]*\.source(?:Type)?\s*===\s*(["'])guest_demo\1/g, 'legacy-source-check')
        .replace(/(["'])guest_demo\1\s*===\s*[A-Za-z_$][\w$]*\.source(?:Type)?\b/g, 'legacy-source-check');
      for (const [category, rule] of PUBLIC_BUILD_RULES) {
        // Paths matter even when a route is not registered; do not accept dead chunks.
        const match = rule.exec(relative) || rule.exec(text);
        if (match) result.findings.push({ category, file: relative, marker: match[0] });
      }
    }
  };
  visit(root);
  result.ok = result.scannedFiles > 0 && result.findings.length === 0;
  return result;
}

function publicBuildMain(args) {
  const directories = args.length ? args : ['dist/build/h5', 'dist/build/mp-weixin'];
  const reports = directories.map(scanPublicBuild);
  console.log(JSON.stringify({ ok: reports.every((report) => report.ok), reports }, null, 2));
  process.exitCode = reports.every((report) => report.ok) ? 0 : 1;
}

// 配置
const CONFIG = {
  srcDir: path.join(process.cwd(), 'src'),
  pagesDir: path.join(process.cwd(), 'src/pages'),
  componentsDir: path.join(process.cwd(), 'src/components'),
  reportFile: path.join(process.cwd(), 'data/reports/ui-quality-report.json'),
  extensions: ['.vue', '.js'],
  ignorePatterns: ['node_modules', 'dist', 'unpackage', '.git']
};

const POSITION_ANIMATION_PROPS = new Set(['top', 'left', 'right', 'bottom']);

function toDisplayPath(filePath) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

function isPageLevelFile(filePath) {
  return filePath.startsWith(`${CONFIG.pagesDir}${path.sep}`);
}

// 检查结果
const results = {
  passed: [],
  warnings: [],
  errors: [],
  stats: {
    totalFiles: 0,
    vueFiles: 0,
    jsFiles: 0,
    loadingStates: 0,
    errorHandlers: 0,
    gpuAccelerated: 0
  }
};

function readJsonFileSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function listDiff(sourceList = [], targetList = []) {
  const target = new Set(targetList);
  return sourceList.filter((item) => !target.has(item));
}

function buildTrend(previousReport, currentReport) {
  if (!previousReport || typeof previousReport !== 'object') {
    return null;
  }

  const previousScore = Number.isFinite(previousReport.score) ? previousReport.score : null;
  const previousWarningCount = Number.isFinite(previousReport.warningCount) ? previousReport.warningCount : null;
  const previousErrorCount = Number.isFinite(previousReport.errorCount) ? previousReport.errorCount : null;

  if (previousScore === null && previousWarningCount === null && previousErrorCount === null) {
    return null;
  }

  const previousWarnings = Array.isArray(previousReport.warnings) ? previousReport.warnings : [];
  const previousErrors = Array.isArray(previousReport.errors) ? previousReport.errors : [];
  const currentWarnings = Array.isArray(currentReport.warnings) ? currentReport.warnings : [];
  const currentErrors = Array.isArray(currentReport.errors) ? currentReport.errors : [];

  return {
    previousGeneratedAt: previousReport.generatedAt || null,
    scoreDelta: previousScore === null ? null : currentReport.score - previousScore,
    warningDelta: previousWarningCount === null ? null : currentReport.warningCount - previousWarningCount,
    errorDelta: previousErrorCount === null ? null : currentReport.errorCount - previousErrorCount,
    newWarnings: listDiff(currentWarnings, previousWarnings),
    resolvedWarnings: listDiff(previousWarnings, currentWarnings),
    newErrors: listDiff(currentErrors, previousErrors),
    resolvedErrors: listDiff(previousErrors, currentErrors)
  };
}

function formatSignedDelta(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }
  return value > 0 ? `+${value}` : `${value}`;
}

/**
 * 递归获取所有文件
 */
function getAllFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;

  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      // 跳过断裂的符号链接或不可访问的文件
      return;
    }

    // 跳过忽略的目录
    if (CONFIG.ignorePatterns.some((pattern) => filePath.includes(pattern))) {
      return;
    }

    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else if (CONFIG.extensions.includes(path.extname(file))) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * 去除注释，避免注释文本干扰规则匹配
 */
function stripComments(content) {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * 提取 @keyframes 代码块（用于更精准的动画属性检测）
 */
function extractKeyframeBlocks(content) {
  const blocks = [];
  let searchIndex = 0;

  while (searchIndex < content.length) {
    const keyframeIndex = content.indexOf('@keyframes', searchIndex);
    if (keyframeIndex === -1) {
      break;
    }

    const braceStart = content.indexOf('{', keyframeIndex);
    if (braceStart === -1) {
      break;
    }

    let depth = 0;
    let endIndex = -1;

    for (let i = braceStart; i < content.length; i++) {
      const char = content[i];
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }
    }

    if (endIndex !== -1) {
      blocks.push(content.slice(braceStart + 1, endIndex));
      searchIndex = endIndex + 1;
    } else {
      break;
    }
  }

  return blocks;
}

/**
 * 检查 Vue 组件的加载状态
 */
function checkLoadingStates(content, filePath) {
  const checks = [];
  const displayPath = toDisplayPath(filePath);
  const fileName = path.basename(filePath);

  // App 根组件没有可见加载骨架，不纳入该规则
  // 加载态主要约束页面级文件，避免对通用组件产生噪音
  if (fileName === 'App.vue' || !isPageLevelFile(filePath)) {
    return checks;
  }

  // 检查是否存在可能影响交互的异步/远程操作（弱化对普通 await 的误报）
  const hasAsyncOps =
    /uni\.request|uni\.uploadFile|uni\.downloadFile|lafService\.|fetch\(|axios\.|proxyAI\(|processIdPhoto\(/i.test(
      content
    ) || /await\s+[^;\n]*(lafService|fetch|axios|uni\.(request|uploadFile|downloadFile))/i.test(content);

  if (hasAsyncOps) {
    // 检查是否有加载状态变量
    const hasLoadingState =
      /isLoading|loading|isAnalyzing|isTyping|isRecognizing|isGenerating|isInitLoading|isProcessing|processingText|isSubmitting/i.test(
        content
      );

    // 检查是否有加载 UI
    const hasLoadingUI =
      /v-if="[^"]*(loading|analyzing|typing|processing)|v-show="[^"]*(loading|analyzing|typing|processing)|:loading=|<base-loading|<baseloading|<loading|uni\.showLoading|骨架屏|skeleton|loading-overlay|typing-indicator|typing-dot|正在输入|processing-spinner|处理中|processing-card/i.test(
        content
      );

    if (hasLoadingState && hasLoadingUI) {
      results.stats.loadingStates++;
      checks.push({
        type: 'pass',
        message: `${displayPath}: 加载状态实现完整`
      });
    } else if (hasLoadingState) {
      checks.push({
        type: 'warning',
        message: `${displayPath}: 有加载状态变量但缺少加载 UI`
      });
    } else {
      checks.push({
        type: 'warning',
        message: `${displayPath}: 有异步操作但缺少加载状态`
      });
    }
  }

  return checks;
}

/**
 * 检查错误处理
 */
function checkErrorHandling(content, filePath, ext) {
  const checks = [];
  const displayPath = toDisplayPath(filePath);
  const isVueFile = ext === '.vue';

  // 检查是否有 try-catch
  const hasTryCatch = /try\s*{[\s\S]*?}\s*catch/.test(content);

  // 检查是否有错误提示
  const hasErrorToast = /uni\.showToast.*icon:\s*['"]none['"]|uni\.showModal.*title.*失败|catch.*showToast/i.test(
    content
  );

  // 检查是否导入了全局错误处理器
  const hasGlobalErrorHandler = /globalErrorHandler|reportError|reportNetworkError/i.test(content);

  // 允许 logger 作为用户可感知错误反馈通道（通常会结合埋点/统一提示）
  const hasLoggerFeedback = /logger\.(warn|error)\(/i.test(content);

  // 检查是否有 Promise 错误处理
  const hasPromiseErrorHandling = /\.catch\(|\.finally\(/.test(content);

  // Vue 页面/组件可接受的错误可见反馈（不强制必须 toast）
  const hasErrorStateUI =
    /error\.value|errorMsg|errorMessage|showError|hasError|errorText|<base-empty|<empty-state/i.test(content);

  // 组件向外抛出错误事件也视为有效错误反馈
  const hasErrorEventEmit = /\$?emit\(\s*['"]error['"]/i.test(content);

  if (hasTryCatch || hasPromiseErrorHandling) {
    results.stats.errorHandlers++;

    if (!isVueFile) {
      checks.push({
        type: 'pass',
        message: `${displayPath}: 错误处理完整`
      });
    } else if (hasErrorToast || hasGlobalErrorHandler || hasErrorStateUI || hasLoggerFeedback || hasErrorEventEmit) {
      checks.push({
        type: 'pass',
        message: `${displayPath}: 错误处理完整`
      });
    } else {
      checks.push({
        type: 'warning',
        message: `${displayPath}: 有错误捕获但缺少用户提示`
      });
    }
  }

  return checks;
}

/**
 * 检查 CSS 性能优化
 */
function checkCSSPerformance(content, filePath) {
  const checks = [];
  const displayPath = toDisplayPath(filePath);

  const transitionPropertyMatches = [...content.matchAll(/transition-property\s*:\s*([^;]+);/gi)];
  const shorthandTransitionMatches = [...content.matchAll(/transition\s*:\s*([^;]+);/gi)];

  const hasLayoutTransitionProperty = transitionPropertyMatches.some((match) => {
    return match[1]
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .some((prop) => POSITION_ANIMATION_PROPS.has(prop));
  });

  const hasLayoutTransitionShorthand = shorthandTransitionMatches.some((match) => {
    return match[1]
      .split(',')
      .map((item) => item.trim().split(/\s+/)[0]?.toLowerCase())
      .some((prop) => prop && POSITION_ANIMATION_PROPS.has(prop));
  });

  // 检查 layout-trigger 动画（仅匹配 transition / transition-property 的显式属性）
  const hasLayoutTransition = hasLayoutTransitionProperty || hasLayoutTransitionShorthand;
  const keyframeBlocks = extractKeyframeBlocks(content);
  const hasPositionKeyframe = keyframeBlocks.some((block) => /(^|[\s;{])(top|left|right|bottom)\s*:/m.test(block));

  // 检查是否有 GPU 加速
  const hasGPUAcceleration = /will-change|transform:\s*translateZ|backface-visibility/i.test(content);

  // 检查是否有 backdrop-filter（需要 GPU）
  const hasBackdropFilter = /backdrop-filter/i.test(content);

  if (hasGPUAcceleration || hasBackdropFilter) {
    results.stats.gpuAccelerated++;
    checks.push({
      type: 'pass',
      message: `${displayPath}: 已启用 GPU 加速`
    });
  }

  if (hasLayoutTransition || hasPositionKeyframe) {
    checks.push({
      type: 'warning',
      message: `${displayPath}: 建议使用 transform 代替 position 动画`
    });
  }

  return checks;
}

/**
 * 检查无障碍访问
 */
function checkAccessibility(content, filePath) {
  const checks = [];
  const displayPath = toDisplayPath(filePath);

  // 检查图片是否有 alt 或 mode
  // 使用引号感知的正则：匹配 <image ... > 或 <image ... />，
  // 跳过引号内的 > 字符（Vue 模板中 v-if="count > 5" 会包含 >）
  const imgTags = [];
  const imgOpenRe = /<image\b/g;
  let imgMatch;
  while ((imgMatch = imgOpenRe.exec(content)) !== null) {
    let inQuote = false;
    let quoteChar = '';
    let endIdx = -1;
    for (let i = imgMatch.index + 6; i < content.length; i++) {
      const ch = content[i];
      if (inQuote) {
        if (ch === quoteChar) inQuote = false;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inQuote = true;
        quoteChar = ch;
        continue;
      }
      if (ch === '>' || (ch === '/' && i + 1 < content.length && content[i + 1] === '>')) {
        endIdx = ch === '/' ? i + 2 : i + 1;
        break;
      }
    }
    if (endIdx > 0) imgTags.push(content.slice(imgMatch.index, endIdx));
  }
  const imgsWithoutAlt = imgTags.filter((tag) => !/\s:?mode=/.test(tag) && !tag.includes('alt='));

  if (imgsWithoutAlt.length > 0) {
    checks.push({
      type: 'warning',
      message: `${displayPath}: ${imgsWithoutAlt.length} 个 image 标签缺少 mode 属性`
    });
  }

  // 检查按钮是否有文字或 aria-label
  const buttonTags = content.match(/<button[^>]*>[\s\S]*?<\/button>/g) || [];
  const emptyButtons = buttonTags.filter((tag) => {
    const innerContent = tag
      .replace(/<button[^>]*>/, '')
      .replace(/<\/button>/, '')
      .trim();
    return innerContent.length === 0 && !tag.includes('aria-label');
  });

  if (emptyButtons.length > 0) {
    checks.push({
      type: 'warning',
      message: `${displayPath}: ${emptyButtons.length} 个空按钮缺少 aria-label`
    });
  }

  return checks;
}

/**
 * 检查代码规范
 */
function checkCodeStyle(content, filePath) {
  const checks = [];
  const displayPath = toDisplayPath(filePath);
  const fileName = path.basename(filePath);
  const normalizedPath = toDisplayPath(filePath).toLowerCase();

  // logger 模块本身允许使用 console
  if (fileName === 'logger.js' || normalizedPath.includes('/utils/logger.')) {
    return checks;
  }

  // 检查是否使用 console.log（应使用 logger）
  const hasConsoleLog = /console\.(log|warn|error)\(/g.test(content);
  const hasLogger = /logger\.(log|warn|error|debug)\(/g.test(content);

  if (hasConsoleLog && !hasLogger) {
    checks.push({
      type: 'warning',
      message: `${displayPath}: 建议使用 logger 代替 console`
    });
  }

  // 检查是否有硬编码的颜色值（应使用 CSS 变量）
  const hardcodedColors = content.match(/#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}|rgb\([^)]+\)/g) || [];
  const cssVarColors = content.match(/var\(--[^)]+\)/g) || [];

  if (hardcodedColors.length > 10 && cssVarColors.length < hardcodedColors.length / 2) {
    checks.push({
      type: 'info',
      message: `${displayPath}: 发现 ${hardcodedColors.length} 个硬编码颜色，建议使用 CSS 变量`
    });
  }

  return checks;
}

/**
 * 扫描单个文件
 */
function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const analysisContent = stripComments(content);
  const ext = path.extname(filePath);

  results.stats.totalFiles++;

  if (ext === '.vue') {
    results.stats.vueFiles++;

    // 执行所有检查
    const loadingChecks = checkLoadingStates(analysisContent, filePath);
    const errorChecks = checkErrorHandling(analysisContent, filePath, ext);
    const cssChecks = checkCSSPerformance(analysisContent, filePath);
    const a11yChecks = checkAccessibility(content, filePath);
    const styleChecks = checkCodeStyle(analysisContent, filePath);

    // 汇总结果
    [...loadingChecks, ...errorChecks, ...cssChecks, ...a11yChecks, ...styleChecks].forEach((check) => {
      if (check.type === 'pass') {
        results.passed.push(check.message);
      } else if (check.type === 'warning') {
        results.warnings.push(check.message);
      } else if (check.type === 'error') {
        results.errors.push(check.message);
      }
    });
  } else if (ext === '.js') {
    results.stats.jsFiles++;

    // JS 文件只检查错误处理和代码规范
    const errorChecks = checkErrorHandling(analysisContent, filePath, ext);
    const styleChecks = checkCodeStyle(analysisContent, filePath);

    [...errorChecks, ...styleChecks].forEach((check) => {
      if (check.type === 'pass') {
        results.passed.push(check.message);
      } else if (check.type === 'warning') {
        results.warnings.push(check.message);
      } else if (check.type === 'error') {
        results.errors.push(check.message);
      }
    });
  }
}

/**
 * 生成报告
 */
function generateReport() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              UI 质量门禁扫描报告                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  // 统计信息
  console.log('📊 扫描统计:');
  console.log(`   总文件数: ${results.stats.totalFiles}`);
  console.log(`   Vue 组件: ${results.stats.vueFiles}`);
  console.log(`   JS 文件: ${results.stats.jsFiles}`);
  console.log(`   加载状态实现: ${results.stats.loadingStates}`);
  console.log(`   错误处理覆盖: ${results.stats.errorHandlers}`);
  console.log(`   GPU 加速组件: ${results.stats.gpuAccelerated}`);
  console.log('');

  // 通过项
  if (results.passed.length > 0) {
    console.log('✅ 通过项 (' + results.passed.length + '):');
    results.passed.slice(0, 10).forEach((msg) => console.log('   ' + msg));
    if (results.passed.length > 10) {
      console.log(`   ... 还有 ${results.passed.length - 10} 项`);
    }
    console.log('');
  }

  // 警告项
  if (results.warnings.length > 0) {
    console.log('⚠️  警告项 (' + results.warnings.length + '):');
    results.warnings.slice(0, 15).forEach((msg) => console.log('   ' + msg));
    if (results.warnings.length > 15) {
      console.log(`   ... 还有 ${results.warnings.length - 15} 项`);
    }
    console.log('');
  }

  // 错误项
  if (results.errors.length > 0) {
    console.log('❌ 错误项 (' + results.errors.length + '):');
    results.errors.forEach((msg) => console.log('   ' + msg));
    console.log('');
  }

  // 质量评分
  const totalChecks = results.passed.length + results.warnings.length + results.errors.length;
  const score = totalChecks > 0 ? Math.round((results.passed.length / totalChecks) * 100) : 100;
  const currentReportSnapshot = {
    score,
    warningCount: results.warnings.length,
    errorCount: results.errors.length,
    warnings: results.warnings,
    errors: results.errors
  };
  const previousReport = readJsonFileSafe(CONFIG.reportFile);
  const trend = buildTrend(previousReport, currentReportSnapshot);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📈 质量评分: ${score}/100`);

  if (score >= 80) {
    console.log('🎉 优秀！代码质量良好');
  } else if (score >= 60) {
    console.log('👍 良好，但仍有改进空间');
  } else {
    console.log('⚠️  需要改进，请关注警告和错误项');
  }
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  if (trend) {
    console.log('📉 趋势对比（相较上次扫描）:');
    console.log(`   评分变化: ${formatSignedDelta(trend.scoreDelta)} 分`);
    console.log(`   警告变化: ${formatSignedDelta(trend.warningDelta)} 项`);
    console.log(`   错误变化: ${formatSignedDelta(trend.errorDelta)} 项`);

    if (trend.newWarnings.length > 0) {
      console.log(`   新增警告: ${trend.newWarnings.length} 项`);
      trend.newWarnings.slice(0, 3).forEach((msg) => console.log(`     + ${msg}`));
      if (trend.newWarnings.length > 3) {
        console.log(`     ... 还有 ${trend.newWarnings.length - 3} 项`);
      }
    }

    if (trend.resolvedWarnings.length > 0) {
      console.log(`   已解决警告: ${trend.resolvedWarnings.length} 项`);
      trend.resolvedWarnings.slice(0, 3).forEach((msg) => console.log(`     - ${msg}`));
      if (trend.resolvedWarnings.length > 3) {
        console.log(`     ... 还有 ${trend.resolvedWarnings.length - 3} 项`);
      }
    }

    if (trend.newErrors.length > 0) {
      console.log(`   新增错误: ${trend.newErrors.length} 项`);
      trend.newErrors.slice(0, 3).forEach((msg) => console.log(`     + ${msg}`));
      if (trend.newErrors.length > 3) {
        console.log(`     ... 还有 ${trend.newErrors.length - 3} 项`);
      }
    }

    if (trend.resolvedErrors.length > 0) {
      console.log(`   已解决错误: ${trend.resolvedErrors.length} 项`);
      trend.resolvedErrors.slice(0, 3).forEach((msg) => console.log(`     - ${msg}`));
      if (trend.resolvedErrors.length > 3) {
        console.log(`     ... 还有 ${trend.resolvedErrors.length - 3} 项`);
      }
    }

    console.log('');
  }

  const reportData = {
    generatedAt: new Date().toISOString(),
    score,
    stats: results.stats,
    warningCount: results.warnings.length,
    errorCount: results.errors.length,
    warnings: results.warnings,
    errors: results.errors,
    trend
  };

  const reportDir = path.dirname(CONFIG.reportFile);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  fs.writeFileSync(CONFIG.reportFile, JSON.stringify(reportData, null, 2), 'utf-8');
  console.log(`📄 详细报告: ${CONFIG.reportFile}`);
  console.log('');

  // 返回是否通过门禁
  return results.errors.length === 0;
}

/**
 * 主函数
 */
function main() {
  console.log('🔍 开始 UI 质量门禁扫描...');
  console.log(`   扫描目录: ${CONFIG.srcDir}`);

  // 获取所有文件
  const files = getAllFiles(CONFIG.srcDir);
  console.log(`   发现 ${files.length} 个文件`);

  // 扫描每个文件
  files.forEach((file) => {
    try {
      scanFile(file);
    } catch (error) {
      results.errors.push(`扫描失败: ${path.basename(file)} - ${error.message}`);
    }
  });

  // 生成报告
  const passed = generateReport();

  // 退出码
  process.exit(passed ? 0 : 1);
}

// 运行
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--public-build') publicBuildMain(process.argv.slice(3));
  else main();
}
