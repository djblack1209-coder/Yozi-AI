import { chmodSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const SCRIPT_PATH = join(process.cwd(), 'scripts/build/audit-tracked-secrets.sh');

function runGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function createTrackedFixture() {
  const root = mkdtempSync(join(tmpdir(), 'yozi-ai-tracked-secret-'));
  runGit(['init', '-q'], root);
  runGit(['config', 'user.email', 'test@example.com'], root);
  runGit(['config', 'user.name', 'Test User'], root);

  const scriptCopy = join(root, basename(SCRIPT_PATH));
  copyFileSync(SCRIPT_PATH, scriptCopy);
  chmodSync(scriptCopy, 0o755);

  return { root, scriptCopy };
}

describe('audit tracked secrets script', () => {
  it('does not treat the suffix of a task candidate path as a credential', () => {
    const { root, scriptCopy } = createTrackedFixture();
    try {
      writeFileSync(join(root, 'receipt.md'), `Candidate: tmp/task-${'candidate-'.repeat(4)}.noindex/Yozi AI.app\n`);
      runGit(['add', 'receipt.md'], root);
      const result = spawnSync('bash', [scriptCopy], { cwd: root, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('no tracked secret patterns found');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('still rejects and redacts credentials after quote, assignment and URL separators', () => {
    const { root, scriptCopy } = createTrackedFixture();
    try {
      const tokens = [`sk-${'a'.repeat(24)}`, `github_pat_${'b'.repeat(24)}`, `ghp_${'c'.repeat(32)}`];
      writeFileSync(
        join(root, 'config.txt'),
        `key="${tokens[0]}"\nTOKEN=${tokens[1]}\nhttps://example.com/${tokens[2]}\n`
      );
      runGit(['add', 'config.txt'], root);
      const result = spawnSync('bash', [scriptCopy], { cwd: root, encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('config.txt');
      for (const token of tokens) expect(result.stdout).not.toContain(token);
      expect(result.stdout).toContain('***REDACTED***');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('redacts matched tracked secrets while ignoring binary and oversized tracked files', () => {
    const { root, scriptCopy } = createTrackedFixture();
    try {
      mkdirSync(join(root, 'fixtures'), { recursive: true });
      const fakeSecret = `sk-${'abcdefghijklmnopqrstuvwxyz123456'}`;
      writeFileSync(join(root, 'fixtures/app.js'), `const token = "${fakeSecret}";\n`);
      writeFileSync(join(root, 'fixtures/blob.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]));
      writeFileSync(join(root, 'fixtures/huge.json'), `${'x'.repeat(2_100_000)}\n`);
      runGit(['add', 'fixtures/app.js', 'fixtures/blob.png', 'fixtures/huge.json'], root);
      runGit(['commit', '-qm', 'fixture'], root);

      const result = spawnSync('bash', [scriptCopy], { cwd: root, encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('[secret-audit] potential secrets found in tracked files');
      expect(result.stdout).toContain('fixtures/app.js');
      expect(result.stdout).toContain('sk-***REDACTED***');
      expect(result.stdout).toContain('[secret-audit] skipped 2 tracked files');
      expect(result.stdout).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
      expect(result.stdout).not.toContain('fixtures/blob.png');
      expect(result.stdout).not.toContain('fixtures/huge.json');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
