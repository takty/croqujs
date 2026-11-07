import { open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import builder from 'electron-builder';
import { build as buildRenderer } from 'vite';

import {
	copyFilesFiltered,
	writeFileIfChanged,
} from './tasks.mjs';

const SRC_DIR      = './src';
const APP_DIR      = './app';
const ICON_SRC_DIR = './res/icon';
const APP_RES_DIR  = path.join(APP_DIR, 'res');

const packageJson = JSON.parse(await readFile('./package.json', 'utf8'));

async function buildMain() {
	for (const [name, format] of [['main', 'es'], ['preload', 'cjs']]) {
		await buildRenderer({
			configFile: false,
			publicDir: false,
			logLevel: 'warn',
			ssr: { noExternal: true, external: ['electron'] },
			build: {
				ssr: path.resolve(SRC_DIR, 'electron', name + '.js'),
				outDir: path.join(APP_DIR, 'electron'),
				emptyOutDir: false,
				target: 'node22',
				sourcemap: true,
				rolldownOptions: {
					external: ['electron', /^node:/],
					output: { format, entryFileNames: name + '.js' },
				},
			},
		});
	}
	await copyFilesFiltered(ICON_SRC_DIR, APP_RES_DIR, (_srcPath, relPath) => {
		const name = path.basename(relPath);
		return path.dirname(relPath) === '.' && (name.startsWith('icon.') || name === 'icon-mac.png');
	});
}

async function updateVersion() {
	const json = JSON.parse(await readFile(path.join(SRC_DIR, 'package.json'), 'utf8'));
	json.version = packageJson.version;
	await writeFileIfChanged(path.join(APP_DIR, 'package.json'), `${JSON.stringify(json, null, '\t')}\n`);
}

async function build() {
	const appDir = path.resolve(APP_DIR);
	const expected = fileURLToPath(new URL('./app', import.meta.url));
	if (appDir !== expected) throw new Error('Run build.mjs from the project directory');
	await rm(appDir, { recursive: true, force: true });
	await buildMain();
	await updateVersion();
	await buildRenderer({ configFile: './vite.config.mjs', mode: 'app' });
}

async function packageApp() {
	await ensureAppProject();

	const version = packageJson.version;

	await builder.build({
		dir: process.argv.includes('--dir'),
		config: {
			directories: { app: APP_DIR, output: 'dist-app' },
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

if (process.argv.includes('--package') || process.argv.includes('--dir')) {
	await packageApp();
}
