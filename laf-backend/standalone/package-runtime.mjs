import {
  copyFileSync,
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: { output: { type: 'string' } } });
const output = values.output ? path.resolve(backend, '..', values.output) : path.join(backend, 'standalone/dist');
if (values.output) {
  if (!/^tmp\/[a-zA-Z0-9_/-]+$/.test(values.output) || values.output.split('/').includes('..'))
    throw new Error('Isolated packaging output must be a local tmp directory');
  if (realpathSync(output) !== output) throw new Error('Isolated packaging output cannot follow a symbolic link');
}
if (!existsSync(path.join(output, 'standalone/server.js'))) throw new Error('Compile successfully before packaging.');
// Isolated local packages lack an ancestor dependency directory. Container/dist packaging
// keeps its existing ancestor resolution and must not embed a workstation-specific link.
const dependencies = path.join(backend, 'standalone/node_modules');
const dependencyLink = path.join(output, 'node_modules');
let linked = false;
if (values.output) {
  if (!statSync(dependencies).isDirectory()) throw new Error('Install the existing backend dependencies first.');
  let existing;
  try {
    existing = lstatSync(dependencyLink);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (existing) {
    if (!existing.isSymbolicLink() || realpathSync(dependencyLink) !== realpathSync(dependencies))
      throw new Error('Isolated package dependencies must link to the existing backend dependencies.');
    linked = true;
  }
}

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      if (file === dependencyLink && linked) continue;
      throw new Error('Package the compiled files before linking runtime dependencies');
    }
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith('.js') && entry.name !== 'ts-fsrs-bundle.js') {
      let content = readFileSync(file, 'utf8');
      let shim = path
        .relative(path.dirname(file), path.join(output, 'standalone/cloud-shim.js'))
        .split(path.sep)
        .join('/');
      if (!shim.startsWith('.')) shim = './' + shim;
      content = content.replace(/(['"])@lafjs\/cloud\1/g, (_, quote) => quote + shim + quote);
      if (/require\(['"](?:\.\/|\.\/_shared\/)ts-fsrs-bundle['"]\)/.test(content)) {
        content = content.replace(
          /require\((['"])(\.\/(?:_shared\/)?)ts-fsrs-bundle\1\)/g,
          'require($1$2ts-fsrs-bundle.cjs$1)'
        );
        content =
          "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);\n" + content;
      }
      writeFileSync(file, content);
    }
  }
}

walk(output);
copyFileSync(
  path.join(backend, 'functions/_shared/learning-sympy-worker.py'),
  path.join(output, 'functions/_shared/learning-sympy-worker.py')
);
copyFileSync(
  path.join(backend, 'functions/_shared/yozi-email-logo.png'),
  path.join(output, 'functions/_shared/yozi-email-logo.png')
);
const bundle = path.join(output, 'functions/_shared/ts-fsrs-bundle.js');
// The vendored .ts file is already JavaScript/CommonJS. Copy its bytes unchanged;
// TypeScript's Node16 emit appends `export {}`, which is invalid in CommonJS.
copyFileSync(path.join(backend, 'functions/_shared/ts-fsrs-bundle.ts'), bundle.replace(/\.js$/, '.cjs'));
if (existsSync(bundle)) unlinkSync(bundle);
for (const entry of readdirSync(path.join(backend, 'functions'))) {
  if (entry.endsWith('.yaml'))
    copyFileSync(path.join(backend, 'functions', entry), path.join(output, 'functions', entry));
}
// Native ESM resolution searches ancestors, not NODE_PATH or a sibling node_modules.
writeFileSync(path.join(output, 'package.json'), JSON.stringify({ type: 'module', private: true }) + '\n');
if (values.output && !linked) symlinkSync(dependencies, dependencyLink, 'dir');
console.log('Packaged native ESM functions, cloud adapter, metadata and unchanged CommonJS FSRS bundle.');
