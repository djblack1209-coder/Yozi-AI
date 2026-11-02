import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  hasRepositoryErrors,
  literalImports,
  resolveLocalReference,
  scanRepository
} from '../../scripts/build/repository-health.mjs';
import { DUPLICATE_PAIRS } from '../../scripts/build/check-subpkg-duplicates.mjs';

let fixture;
afterEach(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
  fixture = undefined;
});
describe('仓库引用审计', () => {
  it('JS/Vue/动态import/require是真实语法，注释和字符串夹具不误报', () => {
    const code = `// import './gone.js'\nconst fixture = "require('./absent.js')";\nimport './a.js'; export { x } from './b.js'; import('./c.js'); require('./d.js');`;
    expect(literalImports(code, 'a.js')).toEqual(['./a.js', './b.js', './c.js', './d.js']);
    expect(
      literalImports(
        `<template><text>import './fake.js'</text></template><script setup>import X from './X.vue';</script>`,
        'a.vue'
      )
    ).toEqual(['./X.vue']);
    expect(literalImports('#!/usr/bin/env node\nimport "./cli.js";', 'cli.mjs')).toEqual(['./cli.js']);
    expect(literalImports('import data from "./data.json" with { type: "json" };', 'node22.mjs')).toEqual([
      './data.json'
    ]);
  });
  it('Node16 .js导入解析到TS/声明，忽略外部包，正确标出不存在文件', () => {
    fixture = mkdtempSync(join(tmpdir(), 'exam-references-'));
    writeFileSync(join(fixture, 'types.d.ts'), 'export interface X {}');
    expect(resolveLocalReference('entry.ts', './types.js', fixture)).toBe('types.d.ts');
    expect(resolveLocalReference('entry.ts', 'node:fs', fixture)).toBeNull();
    expect(resolveLocalReference('entry.ts', './missing.js', fixture)).toBe(false);
  });
  it('隔离Git夹具发现真实坏链/失效脚本/语法错误，忽略缓存且不删除文件', () => {
    fixture = mkdtempSync(join(tmpdir(), 'exam-audit-'));
    execFileSync('git', ['init', '-q'], { cwd: fixture });
    mkdirSync(join(fixture, 'src'));
    mkdirSync(join(fixture, 'tmp'));
    writeFileSync(join(fixture, '.gitignore'), 'tmp/\n');
    writeFileSync(join(fixture, 'README.md'), '[bad](missing.md)\n[invalid](bad%zz.md)');
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({ scripts: { bad: 'node scripts/missing.mjs' } }));
    writeFileSync(join(fixture, 'src/broken.js'), 'const = ;');
    writeFileSync(join(fixture, 'src/entry.js'), "import './gone.js';");
    writeFileSync(join(fixture, 'tmp/secret.js'), 'const = ;');
    const report = scanRepository(fixture);
    expect(report.missingScripts).toHaveLength(1);
    expect(report.brokenLinks).toHaveLength(2);
    expect(report.parseErrors).toHaveLength(1);
    expect(report.missingImports).toEqual([{ file: 'src/entry.js', reference: './gone.js' }]);
    expect(report.counts.sources).toBe(2);
    expect(scanRepository(fixture).counts).toEqual(report.counts);
  });
  it('忽略证据链接无论本机文件存在与否均只登记，不影响严格结果', () => {
    fixture = mkdtempSync(join(tmpdir(), 'yozi-evidence-'));
    execFileSync('git', ['init', '-q'], { cwd: fixture });
    writeFileSync(join(fixture, '.gitignore'), 'tmp/\ndist/\n');
    mkdirSync(join(fixture, 'docs'));
    writeFileSync(join(fixture, 'docs/check.md'), '[receipt](../tmp/receipt.json)\n[build](../dist/index.html)');
    const absent = scanRepository(fixture);
    mkdirSync(join(fixture, 'tmp'));
    mkdirSync(join(fixture, 'dist'));
    writeFileSync(join(fixture, 'tmp/receipt.json'), '{}');
    writeFileSync(join(fixture, 'dist/index.html'), '<html></html>');
    const present = scanRepository(fixture);
    expect(absent.ignoredLocalLinks).toHaveLength(2);
    expect(present.ignoredLocalLinks).toEqual(absent.ignoredLocalLinks);
    expect(present.brokenLinks).toEqual(absent.brokenLinks);
    expect(hasRepositoryErrors(absent)).toBe(false);
    expect(hasRepositoryErrors(present)).toBe(false);
  });
  it('归档回执只登记历史链接，当前文档指向缺失归档仍失败', () => {
    fixture = mkdtempSync(join(tmpdir(), 'yozi-history-links-'));
    execFileSync('git', ['init', '-q'], { cwd: fixture });
    mkdirSync(join(fixture, 'docs/archive'), { recursive: true });
    mkdirSync(join(fixture, 'reports'));
    writeFileSync(join(fixture, 'docs/archive/receipt.md'), '[old](old-path.md)');
    writeFileSync(join(fixture, 'reports/2026-10-22-evidence.md'), '[old](old-receipt.json)');
    let report = scanRepository(fixture);
    expect(report.historicalLinks).toHaveLength(2);
    expect(report.brokenLinks).toEqual([]);
    expect(hasRepositoryErrors(report)).toBe(false);
    writeFileSync(join(fixture, 'README.md'), '[contract](docs/archive/missing.md)');
    report = scanRepository(fixture);
    expect(report.brokenLinks).toEqual([{ file: 'README.md', link: 'docs/archive/missing.md' }]);
    expect(hasRepositoryErrors(report)).toBe(true);
  });
  it('本机启动器只登记明确的三个编译前置，其余临时导入仍严格检查', () => {
    fixture = mkdtempSync(join(tmpdir(), 'yozi-runtime-imports-'));
    execFileSync('git', ['init', '-q'], { cwd: fixture });
    mkdirSync(join(fixture, 'scripts/build'), { recursive: true });
    const file = 'scripts/build/start-dev-test-backend.mjs';
    const reference = '../../tmp/yozi-candidate-build/backend/standalone/server.js';
    writeFileSync(join(fixture, file), `await import('${reference}');`);
    let report = scanRepository(fixture);
    expect(report.generatedRuntimeImports).toEqual([{ file, reference }]);
    expect(report.missingImports).toEqual([]);
    expect(hasRepositoryErrors(report)).toBe(false);
    writeFileSync(join(fixture, file), `await import('${reference}'); await import('../../tmp/unknown.js');`);
    report = scanRepository(fixture);
    expect(report.missingImports).toEqual([{ file, reference: '../../tmp/unknown.js' }]);
    expect(hasRepositoryErrors(report)).toBe(true);
  });
  it('被忽略目录中强制跟踪的文件缺失仍是严格失败，普通缺失链接同样失败', () => {
    fixture = mkdtempSync(join(tmpdir(), 'yozi-tracked-'));
    execFileSync('git', ['init', '-q'], { cwd: fixture });
    writeFileSync(join(fixture, '.gitignore'), 'tmp/\n');
    mkdirSync(join(fixture, 'tmp'));
    writeFileSync(join(fixture, 'tmp/contract.md'), 'tracked contract');
    execFileSync('git', ['add', '-f', 'tmp/contract.md'], { cwd: fixture });
    writeFileSync(join(fixture, 'README.md'), '[contract](tmp/contract.md)\n[missing](gone.md)');
    rmSync(join(fixture, 'tmp/contract.md'));
    const report = scanRepository(fixture);
    expect(report.ignoredLocalLinks).toEqual([]);
    expect(report.brokenLinks).toEqual([
      { file: 'README.md', link: 'tmp/contract.md' },
      { file: 'README.md', link: 'gone.md' }
    ]);
    expect(hasRepositoryErrors(report)).toBe(true);
  });
  it('忽略规则不豁免源码导入或脚本入口，缺失跟踪源码单独使严格检查失败', () => {
    fixture = mkdtempSync(join(tmpdir(), 'yozi-strict-'));
    execFileSync('git', ['init', '-q'], { cwd: fixture });
    writeFileSync(join(fixture, '.gitignore'), 'tmp/\nscripts/\n');
    writeFileSync(join(fixture, 'entry.js'), "import './tmp/missing.js';");
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({ scripts: { bad: 'node scripts/missing.mjs' } }));
    let report = scanRepository(fixture);
    expect(report.missingImports).toHaveLength(1);
    expect(report.missingScripts).toHaveLength(1);
    expect(hasRepositoryErrors(report)).toBe(true);
    execFileSync('git', ['add', 'entry.js'], { cwd: fixture });
    rmSync(join(fixture, 'entry.js'));
    rmSync(join(fixture, 'package.json'));
    report = scanRepository(fixture);
    expect(report.counts.missingTracked).toBe(1);
    expect(hasRepositoryErrors(report)).toBe(true);
  });
  it('只按现有分包同步清单登记完整副本组，不吞掉其他重复源码', () => {
    fixture = mkdtempSync(join(tmpdir(), 'yozi-copies-'));
    execFileSync('git', ['init', '-q'], { cwd: fixture });
    for (const file of DUPLICATE_PAIRS[0]) {
      mkdirSync(join(fixture, file, '..'), { recursive: true });
      writeFileSync(join(fixture, file), 'export const scheduler = true;');
    }
    expect(scanRepository(fixture).intentionalSourceDuplicates).toEqual([DUPLICATE_PAIRS[0]]);
    writeFileSync(join(fixture, 'other.js'), 'export const scheduler = true;');
    const report = scanRepository(fixture);
    expect(report.intentionalSourceDuplicates).toEqual([]);
    expect(report.exactSourceDuplicates[0]).toHaveLength(3);
  });
});
