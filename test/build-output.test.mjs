import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const app = new URL('../app/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', app), 'utf8'));

test('both renderer HTML entries resolve to complete local Vite asset graphs', async () => {
	for (const entry of ['study/study.html', 'field/field.html']) {
		assert.equal(manifest[entry].isEntry, true);
		const url = new URL(entry, app);
		const html = await readFile(url, 'utf8');
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

test('main, preload, runtime injection, and copied editor worker survive renderer assembly', async () => {
	for (const file of ['main.js', 'preload.js']) {
		assert.equal(await readFile(new URL(file, app), 'utf8'), await readFile(new URL('../src/' + file, import.meta.url), 'utf8'));
	}
	new vm.Script(await readFile(new URL('lib/injection.js', app), 'utf8'));
	for (const file of ['lib/croq-mirror/dist/croq-mirror.min.js', 'lib/croq-mirror/dist/analysis-worker.min.js',
		'lib/acorn/acorn.mjs', 'lib/acorn/walk.mjs', 'lib/jssha/sha256.mjs']) {
		await access(new URL(file, app));
	}
});

test('runtime-selected resources keep their paths and contain the build version', async () => {
	const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
	const packaged = JSON.parse(await readFile(new URL('package.json', app), 'utf8'));
	assert.equal(packaged.version, metadata.version);
	const resource = await readFile(new URL('study/res/resource.json', app), 'utf8');
	assert.ok(resource.includes(metadata.version));
	assert.doesNotMatch(resource, /%VERSION/);
	for (const file of ['lang.en.json', 'lang.ja.json', 'menu.json', 'toolbar.json', 'icon-play.svg']) {
		await access(new URL('study/res/' + file, app));
	}
});
