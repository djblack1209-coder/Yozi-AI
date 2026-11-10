import { spawnSync } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 只编译已有官方SDK的本地插件，不下载SDK、不修改manifest、不安装、不云打包或部署。
const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (!args.includes('--build-only') || args.some((v) => !['--build-only', '--android', '--ios'].includes(v)))
  throw new Error('必须明确--build-only；仅支持可选--android/--ios');
const android = !args.includes('--ios') || args.includes('--android');
const ios = !args.includes('--android') || args.includes('--ios');
const javaHome =
  process.env.YOZI_ANDROID_JAVA_HOME ||
  process.env.WENLI_ANDROID_JAVA_HOME ||
  '/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home';
const classpath = (process.env.YOZI_ANDROID_SDK_CLASSPATH || process.env.WENLI_ANDROID_SDK_CLASSPATH || '')
  .split(path.delimiter)
  .filter(Boolean);
const includes = (process.env.YOZI_IOS_SDK_INCLUDE_PATHS || process.env.WENLI_IOS_SDK_INCLUDE_PATHS || '')
  .split(path.delimiter)
  .filter(Boolean);
const frameworks = (process.env.YOZI_IOS_SDK_FRAMEWORK_PATHS || process.env.WENLI_IOS_SDK_FRAMEWORK_PATHS || '')
  .split(path.delimiter)
  .filter(Boolean);
const missing = [];
const exists = async (file) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};
if (android) {
  if (!classpath.length || !(await Promise.all(classpath.map(exists))).every(Boolean))
    missing.push('Android官方SDK classpath未配置/不完整（android.jar、DCloud、FastJSON及AndroidX Core依赖）');
  if (!(await exists(path.join(javaHome, 'bin/javac')))) missing.push('Android Java编译器未配置');
}
let iphoneSDK;
if (ios) {
  if (
    !includes.length ||
    !(await Promise.all(includes.map(exists))).every(Boolean) ||
    !(await Promise.all(includes.map((p) => exists(path.join(p, 'DCUniModule.h'))))).some(Boolean)
  )
    missing.push('iOS官方DCloud DCUniModule.h及依赖未配置/不完整');
  const found = spawnSync('xcrun', ['--sdk', 'iphoneos', '--show-sdk-path'], { encoding: 'utf8' });
  if (found.error || found.status !== 0) missing.push('真实iPhoneOS SDK不可用');
  else iphoneSDK = found.stdout.trim();
}
if (missing.length) {
  console.error(
    JSON.stringify({ assembled: false, missing, sideEffects: '未生成二进制、未修改App配置、未下载或云打包' }, null, 2)
  );
  process.exitCode = 2;
} else {
  const source = path.join(root, 'nativeplugins/Yozi-Connector');
  const metadata = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
  const base = path.join(root, 'tmp/app-connector-packages');
  await mkdir(base, { recursive: true });
  const work = await mkdtemp(path.join(base, 'build-'));
  const plugin = path.join(work, metadata.id);
  await mkdir(plugin);
  const sdkHashes = {};
  const run = (exe, argv) => {
    const result = spawnSync(exe, argv, {
      cwd: root,
      encoding: 'utf8',
      timeout: 60000,
      env: {
        PATH: process.env.PATH,
        TMPDIR: work,
        ...(process.env.DEVELOPER_DIR ? { DEVELOPER_DIR: process.env.DEVELOPER_DIR } : {})
      }
    });
    if (result.error || result.status !== 0)
      throw new Error(`${path.basename(exe)}编译未通过: ${result.stderr?.slice(0, 3000) || result.error?.message}`);
  };
  try {
    if (!android) delete metadata._dp_nativeplugin.android;
    if (!ios) delete metadata._dp_nativeplugin.ios;
    if (android) {
      const classes = path.join(work, 'classes');
      const library = path.join(work, 'android-aar');
      const resources = path.join('res', 'xml');
      await mkdir(classes);
      await mkdir(path.join(library, resources), { recursive: true });
      await mkdir(path.join(plugin, 'android'));
      run(path.join(javaHome, 'bin/javac'), [
        '--release',
        '8',
        '-cp',
        classpath.join(path.delimiter),
        '-d',
        classes,
        path.join(source, 'android/src/cn/yozi/connector/ConnectorTransport.java'),
        path.join(source, 'android/src/cn/yozi/connector/MaterialFiles.java'),
        path.join(source, 'android/src/cn/yozi/connector/AndroidMaterialSource.java'),
        path.join(source, 'android/src/cn/yozi/connector/AndroidPosterShare.java'),
        path.join(source, 'android/src/cn/yozi/connector/YoziConnectorModule.java')
      ]);
      run(path.join(javaHome, 'bin/jar'), ['cf', path.join(library, 'classes.jar'), '-C', classes, '.']);
      await copyFile(path.join(source, 'android/AndroidManifest.xml'), path.join(library, 'AndroidManifest.xml'));
      await copyFile(path.join(source, 'android/proguard-rules.pro'), path.join(library, 'proguard.txt'));
      const paths = path.join(resources, 'yozi_poster_share_paths.xml');
      await copyFile(path.join(source, 'android', paths), path.join(library, paths));
      run(path.join(javaHome, 'bin/jar'), ['cMf', path.join(plugin, 'android/YoziConnector.aar'), '-C', library, '.']);
      for (const p of classpath)
        sdkHashes[p] = createHash('sha256')
          .update(await readFile(p))
          .digest('hex');
    }
    if (ios) {
      const objects = [];
      await mkdir(path.join(plugin, 'ios'));
      for (const name of ['YoziConnectorTransport', 'YoziMaterialFiles', 'YoziStudyCompanion', 'YoziConnectorModule']) {
        const object = path.join(work, `${name}.o`);
        objects.push(object);
        run('xcrun', [
          '--sdk',
          'iphoneos',
          'clang',
          '-arch',
          'arm64',
          '-isysroot',
          iphoneSDK,
          '-miphoneos-version-min=11.0',
          '-fobjc-arc',
          '-fmodules',
          '-Wall',
          '-Werror',
          '-I',
          path.join(source, 'ios/src'),
          ...includes.flatMap((p) => ['-I', p]),
          ...frameworks.flatMap((p) => ['-F', p]),
          '-c',
          path.join(source, `ios/src/${name}.m`),
          '-o',
          object
        ]);
      }
      run('xcrun', [
        '--sdk',
        'iphoneos',
        'libtool',
        '-static',
        '-o',
        path.join(plugin, 'ios/YoziConnector.a'),
        ...objects
      ]);
      for (const p of includes)
        if (await exists(path.join(p, 'DCUniModule.h')))
          sdkHashes[path.join(p, 'DCUniModule.h')] = createHash('sha256')
            .update(await readFile(path.join(p, 'DCUniModule.h')))
            .digest('hex');
    }
    await writeFile(path.join(plugin, 'package.json'), JSON.stringify(metadata, null, 2) + '\n');
    await writeFile(
      path.join(work, 'build-report.json'),
      JSON.stringify(
        { assembled: true, android, ios, plugin, sdkHashes, deviceVerified: false, productionAuthorized: false },
        null,
        2
      ) + '\n'
    );
    console.log(
      JSON.stringify(
        {
          assembled: true,
          plugin,
          deviceVerified: false,
          scope: '已使用提供的移动SDK编译；仍须人工审查插件装配、ATS/网络与设备业务流程'
        },
        null,
        2
      )
    );
  } catch (error) {
    await rm(work, { recursive: true, force: true });
    throw error;
  }
}
