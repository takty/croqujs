import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { ExporterCore } from '../app/exporter-core.js';
import { BrowserExporter } from '../app/exporter-browser.js';
import { NodeExporter } from '../app/exporter-node.js';
import { Exporter } from '../app/exporter.js';
import { FileSystemBase } from '../app/lib/fs-common.js';
import { NodeFileSystem } from '../app/lib/fs-node.js';

// Deliberately exposes no filesystem write, copy, or directory creation methods.
class ReadOnlyFiles extends FileSystemBase {

	constructor(entries = []) {
		super();
		this.files = new Map(entries);
	}

	async readTextOrNull(relative) {
		return this.files.get(relative) ?? null;
	}

}

const entries = [
	['lib/injection.js', '// runtime hooks'],
	['project/helpers.js', 'function twice(x) { return x * 2; }'],
	['project/nested/raw.js', 'const value = 3;\n'],
	['project/def/helpers.json', '{"name":"helpers"}'],
];
const code = '// @use helpers as HELPERS\n// @need nested/raw.js\n// @import https://example.com/lib.js\nfunction run() { return HELPERS.twice(3); }';

test('browser runtime returns transferable content using only reads', async () => {
	const exporter = new BrowserExporter(new ReadOnlyFiles(entries));
	assert.equal(await exporter.checkLibraryReadable(code, 'project/main.js'), true);
	assert.deepEqual(await exporter.loadDefJsons(code, 'project/main.js'), ['{"name":"helpers"}']);
	const [success, content] = await exporter.exportForExecution(code, 'project/main.js');
	assert.equal(success, true);
	assert.deepEqual(structuredClone(content), content);
	assert.deepEqual([...content.files.keys()], ['lib/injection.js', 'helpers.lib.js', 'nested/raw.js', 'index.html']);
	const html = content.files.get(content.entryPath);
	assert.match(html, /src="https:\/\/example.com\/lib.js"/);
	assert.match(html, /src="nested\/raw.js"/);
	assert.equal(content.files.get('nested/raw.js'), 'const value = 3;\n');
	assert.equal(content.userCodeOffset, html.indexOf('// @use'));
	assert.equal(exporter.userCodeOffset(), content.userCodeOffset);
	const context = {};
	vm.runInNewContext(content.files.get('helpers.lib.js'), context);
	assert.equal(context.HELPERS.twice(4), 8);
});

test('explicit content excludes runtime hooks and generates a usable library', async () => {
	const exporter = new BrowserExporter(new ReadOnlyFiles(entries));
	const [success, page] = await exporter.createWebPage(code, 'project/main.js');
	assert.equal(success, true);
	assert.equal(page.files.has('lib/injection.js'), false);
	assert.doesNotMatch(page.files.get('index.html'), /injection/);
	const structure = { fnNames: ['run'] };
	const [ok, library] = await exporter.createLibrary(code, 'project/bundle.js', 'BUNDLE', structure, true);
	assert.equal(ok, true);
	assert.deepEqual(structure, { fnNames: ['run'] });
	const context = {};
	vm.runInNewContext(library, context);
	assert.equal(context.BUNDLE.run(), 6);
	assert.equal(context.BUNDLE.HELPERS.twice(5), 10);
});

test('missing dependencies and injection retain failure paths', async () => {
	const exporter = new BrowserExporter(new ReadOnlyFiles());
	assert.deepEqual(await exporter.exportForExecution('', null), [false, 'lib/injection.js']);
	assert.deepEqual(await exporter.createWebPage('// @need missing.js', 'main.js'), [false, 'missing.js']);
	assert.deepEqual(await exporter.createWebPage('// @use missing.js', 'main.js'), [false, 'missing.js']);
	assert.deepEqual(await exporter.createLibrary('// @use missing.js', 'bundle.js', 'BUNDLE', { fnNames: [] }, true), [false, 'missing.js']);
	assert.deepEqual(await exporter.createWebPage('// @need local.js', null), [false, 'local.js']);
	assert.deepEqual(await exporter.createWebPage('// @use https://example.com/lib.js', 'main.js'), [false, 'https://example.com/lib.js']);
	assert.equal((await exporter.createWebPage('// @import https://example.com/lib.js', null))[0], true);
});

test('offset follows the actual title length and each result keeps its own offset', async () => {
	const exporter = new ExporterCore(new ReadOnlyFiles());
	for (const file of [null, 'x.js', 'a-much-longer-title.js', '日本語.js']) {
		const [success, page] = await exporter.createWebPage('console.log(1);', file);
		assert.equal(success, true);
		assert.equal(page.userCodeOffset, page.files.get('index.html').indexOf('console.log(1);'));
		await exporter.createWebPage('', 'another.js');
		assert.equal(page.userCodeOffset, page.files.get('index.html').indexOf('console.log(1);'));
	}
});

test('Node saves the same content, preserves the old entry point, and separates runtime from export', async t => {
	assert.equal(Exporter, NodeExporter);
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'croqujs-content-'));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const files = new NodeFileSystem(root);
	for (const [relative, text] of entries) {
		await files.makeDirectory(files.directoryName(relative), { recursive: true });
		await files.writeText(relative, text);
	}
	const exporter = new NodeExporter(files);
	const [success, page] = await new BrowserExporter(new ReadOnlyFiles(entries)).exportForExecution(code, 'project/main.js');
	assert.equal(success, true);
	assert.deepEqual(await exporter.exportForExecution(code, 'project/main.js', 'runtime'), [true, 'runtime/index.html']);
	for (const [relative, text] of page.files) assert.equal(await files.readText('runtime/' + relative), text);
	assert.deepEqual(await exporter.exportAsWebPage(code, 'project/main.js', 'saved'), [true, 'saved/index.html']);
	assert.equal(await files.exists('saved/lib/injection.js'), false);
	assert.deepEqual(await exporter.exportAsLibrary(code, 'project/bundle.js', 'BUNDLE', { fnNames: ['run'] }, true), [true, 'project/bundle.js']);
	const context = {};
	vm.runInNewContext(await files.readText('project/bundle.js'), context);
	assert.equal(context.BUNDLE.run(), 6);
	await files.makeDirectory('copies');
	await files.writeText('copies/helpers.js', '// keep existing dependency');
	assert.deepEqual(await exporter.copyLibraryOfTemplate('// @need helpers.js\n// @use helpers as HELPERS', 'project/main.js', 'copies'), [true]);
	assert.equal(await files.readText('copies/helpers.js'), '// keep existing dependency');
	assert.match(await files.readText('copies/helpers.lib.js'), /var HELPERS/);
	assert.deepEqual(await exporter.exportAsWebPage('// @need missing.js', 'project/main.js', 'failed'), [false, 'missing.js']);
	assert.equal(await files.exists('failed'), false);
});

test('filesystem write errors propagate to the caller', async () => {
	const files = new ReadOnlyFiles();
	const failure = new Error('Write denied');
	files.makeDirectory = async () => {};
	files.writeText = async () => { throw failure; };
	const exporter = new NodeExporter(files);
	await assert.rejects(exporter.exportAsWebPage('', null, 'output'), error => error === failure);
	await assert.rejects(exporter.exportAsLibrary('', 'output.js', 'OUT', { fnNames: [] }), error => error === failure);
});
