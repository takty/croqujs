import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const app = new URL('../app/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', app), 'utf8'));

test('Study bundles UI styles into one stylesheet separate from Field', async () => {
	const styles = async entry => {
		const url = new URL(entry, app);
		const html = await readFile(url, 'utf8');
		if (entry === 'study/index.html') assert.match(html, /croq-mirror\.min\.css/);
		return [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)]
			.map(([, href]) => new URL(href, url)).filter(url => url.pathname.includes('/assets/') && !url.pathname.endsWith('/croq-mirror.min.css'));
	};
	const study = await styles('study/index.html');
	const field = await styles('field/index.html');
	assert.equal(study.length, 1);
	assert.equal(field.length, 1);
	assert.notEqual(study[0].href, field[0].href);
	const css = await readFile(study[0], 'utf8');
	for (const selector of ['.side-menu', '.toolbar', '.swal2-popup', '.output-pane', '.splitter-handle']) {
		assert.ok(css.includes(selector), selector);
	}
});

test('both renderer HTML entries resolve to complete local Vite asset graphs', async () => {
	for (const entry of ['study/index.html', 'field/index.html']) {
		assert.equal(manifest[entry].isEntry, true);
		const url = new URL(entry, app);
		const html = await readFile(url, 'utf8');
		if (entry === 'study/index.html') assert.match(html, /croq-mirror\.min\.css/);
		assert.match(html, /<script type="module"[^>]+src="\.\.\/assets\//);
		for (const [, relative] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
			assert.equal(relative.startsWith('/'), false, relative);
			await access(new URL(relative, url));
		}
	}
	for (const entry of Object.values(manifest)) {
		await access(new URL(entry.file, app));
		for (const file of [...entry.css ?? [], ...entry.assets ?? []]) await access(new URL(file, app));
		for (const dependency of [...entry.imports ?? [], ...entry.dynamicImports ?? []]) {
			assert.ok(manifest[dependency], dependency);
		}
	}
});

test('main, preload, runtime injection, and bundled editor worker survive renderer assembly', async () => {
	for (const file of ['electron/main.js', 'electron/preload.js']) {
		await access(new URL(file, app));
	}
	new vm.Script(await readFile(new URL('electron/preload.js', app), 'utf8'));
	new vm.Script(await readFile(new URL('lib/injection.js', app), 'utf8'));
	for (const file of ['assets/croq-mirror.min.css', 'assets/licenses/croq-mirror-LICENSE',
		'assets/licenses/jssha-LICENSE']) {
		await access(new URL(file, app));
	}
	assert.ok((await readdir(new URL('assets/', app))).some(name => /^analysis-worker.*\.js$/.test(name)));
	await assert.rejects(access(new URL('lib/croq-mirror/', app)), { code: 'ENOENT' });
});

test('Electron output contains only bundled main, preload, and runtime hooks outside assets', async () => {
	const files = (await readdir(app, { recursive: true })).map(name => name.replaceAll('\\', '/'));
	assert.deepEqual(files.filter(name => name.endsWith('.js') && !name.startsWith('assets/')).sort(),
		['electron/main.js', 'electron/preload.js', 'lib/injection.js']);
	const map = JSON.parse(await readFile(new URL('electron/main.js.map', app), 'utf8'));
	assert.ok(map.sources.some(name => name.endsWith('/session/session-server.js')));
	assert.ok(map.sources.some(name => name.endsWith('/fs/fs-node.js')));
	assert.ok(!map.sources.some(name => name.endsWith('/fs/fs-browser.js')));
});

test('runtime-selected resources keep their paths and contain the build version', async () => {
	const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
	const packaged = JSON.parse(await readFile(new URL('package.json', app), 'utf8'));
	assert.equal(packaged.version, metadata.version);
	const resource = await readFile(new URL('study/res/resource.json', app), 'utf8');
	assert.ok(resource.includes(metadata.version));
	assert.doesNotMatch(resource, /%VERSION/);
	for (const file of ['lang.en.json', 'lang.ja.json', 'menu.json', 'toolbar.json']) {
		await access(new URL('study/res/' + file, app));
	}
});
