import fs from 'node:fs';
import path from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanPublicBuild } from '../../scripts/build/ui-quality-gate.js';
import { publicError, registerMessages, setLanguage, t } from '@/i18n/index.js';
import { learningAnalytics } from '@/pages/practice-sub/utils/learning-analytics.js';
import {
  isSeededPracticeRecord,
  prepareQuizQuestion,
  normalizeLegacyReviewQuestion
} from '@/services/quiz-session-contract.js';
import { useBankStatus } from '@/composables/useBankStatus.js';
import { saveQuizProgress, loadQuizProgress } from '@/composables/useQuizAutoSave.js';
import { storageService } from '@/services/storageService.js';
let directory;
beforeEach(() => {
  const base = path.resolve('tmp/public-ready-20261016');
  fs.mkdirSync(base, { recursive: true });
  directory = fs.mkdtempSync(path.join(base, 'guard-fixture-'));
  fs.writeFileSync(path.join(directory, 'index.html'), '<title>Yozi AI</title>');
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
describe('public build guard', () => {
  it.each([
    ['route', 'platforms/h5/components', 'development-route'],
    ['copy', '开始本地演示', 'development-copy'],
    ['model-setup-copy', 'Model connections', 'development-copy'],
    ['connect-model-copy', 'Connect a model', 'development-copy'],
    ['todo-copy', 'TODO: add sign-in', 'development-copy'],
    ['escaped-copy', '\\u6d4b\\u8bd5\\u8fde\\u63a5', 'development-copy'],
    ['seed', 'guest_demo', 'synthetic-data'],
    ['seed-id', 'demo_1', 'synthetic-data'],
    ['cohort', '_isEstimated', 'synthetic-data'],
    ['debug', '__BUILD_TIME__', 'debug-ui']
  ])('blocks %s in unreachable chunks as well as entries', (_name, marker, category) => {
    fs.writeFileSync(path.join(directory, 'unused.js'), JSON.stringify(marker));
    const result = scanPublicBuild(directory);
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({ category, file: 'unused.js' }));
  });
  it.each([
    ['gz', gzipSync],
    ['br', brotliCompressSync]
  ])('inspects precompressed %s files', (extension, compress) => {
    fs.writeFileSync(path.join(directory, `unused.js.${extension}`), compress(Buffer.from('Start local demo')));
    expect(scanPublicBuild(directory).ok).toBe(false);
  });
  it('rejects missing, empty, corrupted and symlinked output instead of passing an empty scan', () => {
    expect(scanPublicBuild(path.join(directory, 'missing')).ok).toBe(false);
    fs.unlinkSync(path.join(directory, 'index.html'));
    expect(scanPublicBuild(directory).ok).toBe(false);
    fs.writeFileSync(path.join(directory, 'index.html'), 'Yozi AI');
    fs.writeFileSync(path.join(directory, 'invalid.js.gz'), 'invalid');
    expect(scanPublicBuild(directory).findings[0].category).toBe('unreadable-artifact');
    fs.unlinkSync(path.join(directory, 'invalid.js.gz'));
    fs.symlinkSync('index.html', path.join(directory, 'linked.js'));
    expect(scanPublicBuild(directory).findings[0].category).toBe('unscanned-symlink');
  });
  it('allows only the SDK comment grammar, while still blocking TODO UI in the same file', () => {
    const sdk = path.join(directory, '__uniappquillhighlight.js');
    fs.writeFileSync(sdk, 'const commentTags="TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX";');
    expect(scanPublicBuild(directory).ok).toBe(true);
    fs.appendFileSync(sdk, 'const label="TODO: add sign-in";');
    expect(scanPublicBuild(directory).ok).toBe(false);
  });
  it('permits rejecting a legacy source, while still blocking seed assignments in the same chunk', () => {
    const file = path.join(directory, 'main.js');
    fs.writeFileSync(file, 'if (record.source === "guest_demo") throw Error("Unavailable");');
    expect(scanPublicBuild(directory).ok).toBe(true);
    fs.appendFileSync(file, 'const seeded = { source: "guest_demo" };');
    expect(scanPublicBuild(directory).ok).toBe(false);
  });
  it('permits framework attributes, real dates, teaching questions and user input prompts', () => {
    fs.writeFileSync(
      path.join(directory, 'main.js'),
      'const placeholder = "例如：我想复习方程"; const debug = false; const title="章节测试";'
    );
    expect(scanPublicBuild(directory).ok).toBe(true);
  });
  it('allows published connector references while still blocking setup labels in the same chunk', () => {
    const file = path.join(directory, 'main.js');
    fs.writeFileSync(
      file,
      JSON.stringify([
        'If you connect a model service running on your own computer or local network,',
        'Your identity, model connections and temporary credentials are cleared.'
      ])
    );
    expect(scanPublicBuild(directory).ok).toBe(true);
    fs.appendFileSync(file, 'const label = "Connect a model";');
    expect(scanPublicBuild(directory).ok).toBe(false);
  });
  it('scans homepage output around the published download and connection copy', () => {
    const file = path.join(directory, 'index.html');
    fs.appendFileSync(file, [
      '<span data-copy="en" lang="en">about model connections</span>',
      '<span data-copy="en" lang="en">connect your model</span>',
      '<span data-copy="zh" lang="zh-CN">Windows 与手机 App 正在规划开发中，尚未提供下载。</span>'
    ].join(''));
    expect(scanPublicBuild(directory).ok).toBe(true);
    fs.appendFileSync(file, '<p>开发中</p>');
    expect(scanPublicBuild(directory).ok).toBe(false);
  });
});
describe('public errors and statistics', () => {
  it.each(['zh-CN', 'en'])('keeps known recovery copy and hides untrusted provider text in %s', (language) => {
    setLanguage(language);
    registerMessages('publicGuard', {
      'zh-CN': { retry: '请重新选择文件。' },
      en: { retry: 'Choose the file again.' }
    });
    expect(publicError(Error('请重新选择文件。'))).toBe(t('publicGuard.retry'));
    for (const message of [
      'SSRF_BLOCKED',
      '__proto__',
      'constructor',
      'toString',
      'TypeError: credential at /tmp/private.js:1',
      'requestId secret',
      '服务器返回未登记字段 secret',
      'https://private.invalid/path'
    ])
      expect(publicError(Error(message))).toBe(t('ui.operationFailed'));
    expect(publicError({})).toBe(t('ui.operationFailed'));
    for (const code of ['__proto__', 'constructor', 'toString'])
      expect(publicError({ code })).toBe(t('ui.operationFailed'));
    expect(publicError(publicError({ code: 401 }))).toBe(t('ui.signInRequired'));
    expect(publicError(publicError(Error('服务连接不可用，学习记录已保存')))).toBe(t('ui.serviceUnavailable'));
    expect(publicError(Error('答案、作答或批注区域不能自动用作独立校验资料'))).toBe(t('ui.materialAnswerRegion'));
    expect(publicError(Error('请选择九位以内整数或最多六位小数的纯数值字段，不猜单位、分组符号或舍入'))).toBe(
      t('ui.materialNumber')
    );
    expect(publicError(t('ui.partialOperations', { v0: 1 }))).toBe(t('ui.partialOperations', { v0: 1 }));
    expect(publicError(t('ui.partialOperations', { v0: 'private-content' }))).toBe(t('ui.operationFailed'));
  });
  it('keeps legacy seeded caches but excludes them from real practice, counts and resume', () => {
    uni.clearStorageSync();
    const real = { id: 'actual-record', question: '计算 2 + 3', options: ['4', '5'], answer: 'B' };
    const seeded = { ...real, id: 'legacy-seed', source: 'guest_demo' };
    const bank = [seeded, real],
      original = JSON.stringify(bank);
    expect(prepareQuizQuestion(real)).not.toBeNull();
    expect(prepareQuizQuestion(seeded)).toBeNull();
    expect(normalizeLegacyReviewQuestion(seeded)).toBeNull();
    expect(isSeededPracticeRecord({ ...real, quizOriginal: { fields: { sourceType: 'guest_demo' } } })).toBe(true);
    const status = useBankStatus();
    status.refreshBankWithData(bank, { 'legacy-seed': 'A', 'actual-record': 'B' });
    expect(status.hasBank.value).toBe(true);
    expect(status.totalQuestions.value).toBe(1);
    expect(status.progressPercent.value).toBe(100);
    status.refreshBankWithData([seeded], { 'legacy-seed': 'A' });
    expect(status.hasBank.value).toBe(false);
    expect(status.totalQuestions.value).toBe(0);
    expect(JSON.stringify(bank)).toBe(original);
    expect(saveQuizProgress({ currentIndex: 1, seconds: 4, questions: bank, answeredQuestions: [] }, true)).toBe(true);
    const snapshot = JSON.stringify(storageService.get('EXAM_QUIZ_PROGRESS'));
    expect(loadQuizProgress()).toBeNull();
    expect(JSON.stringify(storageService.get('EXAM_QUIZ_PROGRESS'))).toBe(snapshot);
  });
  it('returns no invented peers or percentile when there is no cohort service', () => {
    const result = learningAnalytics.getPeerComparison();
    expect(result).toMatchObject({ available: false, peers: [], comparison: null, insights: [] });
    expect(result.user).toBeTruthy();
    expect(result).not.toHaveProperty('_isEstimated');
    expect(learningAnalytics.predictScore()).toEqual({
      available: false,
      predictedScore: null,
      confidence: null,
      factors: null,
      recommendations: []
    });
  });
});
