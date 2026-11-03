import { execFile } from 'node:child_process';
import { access, copyFile, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import builder from 'electron-builder';
import { Lsc } from './src/lib/lsc.js';
import { installInjection } from './src/lib/injection.js';

import {
	copyFilesFiltered,
	processFiles,
	resolvePackageDir,
	writeFileIfChanged,
	walk,
} from './tasks.mjs';

const execFileAsync = promisify(execFile);

const SRC_DIR      = './src';
const APP_DIR      = './app';
const ICON_SRC_DIR = './res/icon';
const APP_RES_DIR  = path.join(APP_DIR, 'res');

const VERSION_PATHS = [
	'package.json',
	path.join('study', 'study.html'),
	path.join('study', 'res/resource.json'),
];

const packageJson = JSON.parse(await readFile('./package.json', 'utf8'));

async function getBranchName() {
	try {
		const { stdout } = await execFileAsync('git', ['branch', '--show-current']);
		return stdout.trim();
	} catch {
		return '';
	}
}

function getDateStamp() {
	const now = new Date();
	return [now.getFullYear() % 100, now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, '0')).join('');
}

async function getVersionInfo() {
	const version = packageJson.version;
	const isDev   = await getBranchName() === 'develop';

	return {
		version,
		major: version.split('.')[0],
		full : `${version}-${isDev ? '[dev]' : ''}${getDateStamp()}`,
	};
}

async function copyMain() {
	await Promise.all([
		copyFilesFiltered(SRC_DIR, APP_DIR, (_srcPath, relPath) => {
			return !VERSION_PATHS.includes(relPath) && relPath !== path.join('lib', 'injection.js');
		}),
		copyFilesFiltered(ICON_SRC_DIR, APP_RES_DIR, (_srcPath, relPath) => {
			const name = path.basename(relPath);
			return path.dirname(relPath) === '.' && (name.startsWith('icon.') || name === 'icon-mac.png');
		}),
	]);
	// A classic script must install the console and error hooks before user code runs.
	await writeFileIfChanged(path.join(APP_DIR, 'lib/injection.js'), `(${installInjection})(${Lsc});\n`);
}

async function copyPackageFiles(name, srcDir, dstDir, filter = () => true) {
	const packageDir = resolvePackageDir(name);
	await copyFilesFiltered(path.join(packageDir, srcDir), path.join(APP_DIR, dstDir), filter);
}

async function copyLibraries() {
	await Promise.all([
		copyPackageFiles('acorn', 'dist', 'lib/acorn', (_srcPath, relPath) => relPath === 'acorn.mjs'),
		copyPackageFiles('acorn-walk', 'dist', 'lib/acorn', (_srcPath, relPath) => relPath === 'walk.mjs'),
		copyPackageFiles('jssha', 'dist', 'lib/jssha', (_srcPath, relPath) => relPath === 'sha256.mjs'),
		copyPackageFiles('sweetalert2', 'dist', 'lib/sweetalert2', (_srcPath, relPath) => ['sweetalert2.esm.min.js', 'sweetalert2.min.css'].includes(relPath)),
	]);
	await copyFile(path.join(resolvePackageDir('jssha'), 'LICENSE'), path.join(APP_DIR, 'lib/jssha/LICENSE'));
}

async function copyCroqMirror() {
	// The Git dependency commits built distribution files under docs, not dist.
	// Resolve the declared entry URL without loading the browser-only module.
	const packageDir = fileURLToPath(new URL('../', import.meta.resolve('croq-mirror')));
	const sourceDir  = path.join(packageDir, 'docs');
	const targetDir  = path.resolve(APP_DIR, 'lib/croq-mirror');
	const files      = ['croq-mirror.min.js', 'analysis-worker.min.js', 'croq-mirror.min.css'];
	for (const file of files) await access(path.join(sourceDir, file));
	await rm(targetDir, { recursive: true, force: true });
	await copyFilesFiltered(sourceDir, path.join(targetDir, 'dist'), (_srcPath, relPath) => {
		if (files.includes(relPath) || files.some(file => relPath === `${file}.map`)) return true;
		if (relPath.startsWith(`licenses${path.sep}`)) return true;
		return relPath.startsWith(`assets${path.sep}`) && path.extname(relPath) === '.svg';
	});
	await copyFile(path.join(packageDir, 'LICENSE'), path.join(targetDir, 'LICENSE'));
}

async function updateVersion() {
	const { version, major, full } = await getVersionInfo();

	await processFiles(SRC_DIR, APP_DIR, (_srcPath, relPath) => VERSION_PATHS.includes(relPath), (source, srcPath) => {
		const relPath = path.relative(SRC_DIR, srcPath);

		if (relPath === 'package.json') {
			const json = JSON.parse(source);
			json.version = version;
			return `${JSON.stringify(json, null, '\t')}\n`;
		}
		return source.replaceAll('%VERSION%', version).replaceAll('%VERSION_MAJOR%', major).replaceAll('%VERSION_FULL%', full);
	});
}

async function build() {
	await removeLegacyEditorFiles();
	await copyMain();
	await copyLibraries();
	await copyCroqMirror();
	await updateVersion();
}

async function removeLegacyEditorFiles() {
	const appDir = path.resolve(APP_DIR);
	await rm(path.join(appDir, 'twin.js'), { force: true });
	const oldEditorDir = path.resolve(appDir, 'croq-mirror');
	if (!oldEditorDir.startsWith(appDir + path.sep)) throw new Error('Invalid legacy editor path');
	await rm(oldEditorDir, { recursive: true, force: true });
	// Remove obsolete build output, including Acorn files replaced by copyLibraries.
	const studyDir = path.resolve(APP_DIR, 'study');
	const paths = [
		'server-proxy-ipc.js', 'server-proxy-local.js',
		'css/study.min.css', 'css/study.min.css.map',
		'output-pane.js', 'console.js',
		'dialog-box.js', 'lib/sweetalert2',
		'side-menu.js', 'side-menu.css',
		'toolbar.js',
		'editor.js', 'analyzer.js', 'worker-analyzer.js',
		'css/cursor-right.svg', 'css/cursor-line.svg',
		'lib/acorn', 'lib/codemirror', 'lib/tern', 'lib/jshint', 'lib/js-beautify',
	];
	// Assets now live in study/res rather than alongside generated CSS.
	for await (const srcPath of walk(path.join(SRC_DIR, 'study/res'))) {
		if (['.svg', '.woff', '.woff2', '.ttf', '.otf'].includes(path.extname(srcPath))) {
			paths.push(path.join('css', path.basename(srcPath)));
		}
	}
	for (const relativePath of paths) {
		const target = path.resolve(studyDir, relativePath);
		if (!target.startsWith(studyDir + path.sep)) throw new Error('Invalid legacy output path');
		await rm(target, { recursive: true, force: true });
	}
}

async function packageApp() {
	await ensureAppProject();

	const version = packageJson.version;

	await builder.build({
		config: {
			appId           : `com.stxst.${packageJson.name}`,
			copyright       : 'Takuto Yanagida',
			buildVersion    : version,
			fileAssociations: { ext: 'js', name: 'JavaScript' },
			artifactName    : '${name}-${os}-${arch}.${ext}',

			win: {
				target: [
					{ target: 'zip',  arch: ['x64'] },
					{ target: 'nsis', arch: ['x64'] },
				],
				icon           : path.join(APP_RES_DIR, 'icon.ico'),
				signtoolOptions: {
					publisherName: 'Takuto Yanagida',
				}
			},
			nsis: {
				oneClick                : false,
				artifactName            : '${name}-${os}-setup.${ext}',
				deleteAppDataOnUninstall: true,
				uninstallDisplayName    : `${packageJson.productName} v${version}`,
			},
			mac: {
				target: [
					{ target: 'zip', arch: ['arm64'] },
					{ target: 'dmg', arch: ['arm64'] },
				],
				icon: path.join(APP_RES_DIR, 'icon-mac.png'),
			},
		},
	});
}

async function ensureAppProject() {
	const handle = await open(path.join(APP_DIR, 'yarn.lock'), 'a');
	await handle.close();
}

await build();

if (process.argv.includes('--package')) {
	await packageApp();
}
