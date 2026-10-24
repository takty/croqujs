import { execFile } from 'node:child_process';
import { access, copyFile, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import builder from 'electron-builder';

import {
	buildSassFile,
	copyFilesFiltered,
	processFiles,
	resolvePackageDir,
	walk,
} from './tasks.mjs';

const execFileAsync = promisify(execFile);

const SRC_DIR      = './src';
const APP_DIR      = './app';
const ICON_SRC_DIR = './res/icon';
const APP_RES_DIR  = path.join(APP_DIR, 'res');
const SCSS_SRC_DIR = path.join(SRC_DIR, 'study/scss');
const CSS_DIST_DIR = path.join(APP_DIR, 'study/css');
const LIB_DIST_DIR = path.join(APP_DIR, 'study/lib');

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
			return !relPath.startsWith(`${path.join('study', 'scss')}${path.sep}`) && !VERSION_PATHS.includes(relPath);
		}),
		copyFilesFiltered(ICON_SRC_DIR, APP_RES_DIR, (_srcPath, relPath) => {
			const name = path.basename(relPath);
			return path.dirname(relPath) === '.' && (name.startsWith('icon.') || name === 'icon-mac.png');
		}),
	]);
}

async function copyPackageFiles(name, srcDir, dstDir, filter = () => true) {
	const packageDir = resolvePackageDir(name);
	await copyFilesFiltered(path.join(packageDir, srcDir), path.join(LIB_DIST_DIR, dstDir), filter);
}

async function copyLibraries() {
	await Promise.all([
		copyPackageFiles('acorn', 'dist', 'acorn', (_srcPath, relPath) => relPath === 'acorn.js'),
		copyPackageFiles('acorn-walk', 'dist', 'acorn', (_srcPath, relPath) => relPath === 'walk.js'),
		copyPackageFiles('sweetalert2', 'dist', 'sweetalert2', (_srcPath, relPath) => path.dirname(relPath) === '.' && path.basename(relPath).startsWith('sweetalert2.min.')),
	]);
}

async function copyCroqMirror() {
	// The Git dependency commits built distribution files under docs, not dist.
	// Resolve the declared entry URL without loading the browser-only module.
	const packageDir = fileURLToPath(new URL('../', import.meta.resolve('croq-mirror')));
	const sourceDir  = path.join(packageDir, 'docs');
	const targetDir  = path.resolve(APP_DIR, 'croq-mirror');
	const files      = ['croq-mirror.min.js', 'analysis-worker.min.js', 'croq-mirror.min.css'];
	for (const file of files) await access(path.join(sourceDir, file));
	await rm(targetDir, { recursive: true, force: true });
	await copyFilesFiltered(sourceDir, path.join(targetDir, 'dist'), (_srcPath, relPath) => {
		if (files.includes(relPath) || files.some(file => relPath === `${file}.map`)) return true;
		if (relPath.startsWith(`licenses${path.sep}`)) return true;
		return relPath.startsWith(`assets${path.sep}`) && ['.woff', '.woff2', '.ttf', '.svg'].includes(path.extname(relPath));
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

async function buildSass() {
	for await (const srcPath of walk(SCSS_SRC_DIR, '.scss')) {
		const relPath = path.relative(SCSS_SRC_DIR, srcPath);
		const name    = path.basename(relPath);

		if (name.startsWith('_')) {
			continue;
		}
		const parsed  = path.parse(relPath);
		const dstPath = path.join(CSS_DIST_DIR, parsed.dir, `${parsed.name}.min.css`);
		await buildSassFile(srcPath, dstPath);
	}
}

async function buildStyle() {
	await Promise.all([
		buildSass(),
		copyFilesFiltered(SCSS_SRC_DIR, CSS_DIST_DIR, (_srcPath, relPath) => path.extname(relPath) !== '.scss'),
	]);
}

async function build() {
	await removeLegacyEditorFiles();
	await copyMain();
	await copyLibraries();
	await copyCroqMirror();
	await updateVersion();
	await buildStyle();
}

async function removeLegacyEditorFiles() {
	// Remove obsolete build output, including Acorn files replaced by copyLibraries.
	const studyDir = path.resolve(APP_DIR, 'study');
	const paths = [
		'editor.js', 'analyzer.js', 'worker-analyzer.js',
		'css/cursor-right.svg', 'css/cursor-line.svg',
		'lib/acorn', 'lib/codemirror', 'lib/tern', 'lib/jshint', 'lib/js-beautify',
	];
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
