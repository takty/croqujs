import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as native from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NodeFileSystem } from '../src/lib/file-system-node.js';
import { BrowserFileSystem } from '../src/lib/file-system-browser.js';
import { directoryHandle } from './file-system-handles.mjs';

test('unrooted Node filesystem supports native paths and temporary directories', async t => {
	const files = new NodeFileSystem();
	const root = await files.createTempDirectory('croqujs-native-');
	t.after(() => native.rm(root, { recursive: true, force: true }));
	assert.equal(path.isAbsolute(root), true);
	const source = files.joinPath(root, '日本語 #%.js');
	assert.equal(files.directoryName(source), root);
	assert.equal(files.baseName(source, '.js'), '日本語 #%');
	assert.equal(files.extension(source), '.js');
	assert.equal(files.pathSeparator, path.sep);
	await files.writeText(source, '\ufeff日本語\r\n');
	assert.equal(await files.readText(source), '\ufeff日本語\r\n');
	assert.equal(await files.readTextAsync(source), '\ufeff日本語\r\n');
	assert.equal(await files.isFile(source), true);
	assert.equal(await files.isDirectory(root), true);
	assert.equal(await files.exists(source), true);
	const missing = files.joinPath(root, 'missing');
	assert.equal(await files.exists(missing), false);
	assert.equal(await files.readTextAsync(missing), undefined);
	assert.equal(await files.readTextOrNull(missing), null);
	const copy = files.joinPath(root, 'deep', 'child', 'copy.js');
	assert.equal(await files.copyTextFile(source, copy), true);
	assert.equal(await files.readTextOrNull(copy), '\ufeff日本語\r\n');
	assert.deepEqual(await files.readDirectory(files.directoryName(copy)), [{ name: 'copy.js', kind: 'file' }]);
	assert.match(await files.toFileURL(source), /%20%23%25\.js$/);
	const relative = path.relative(process.cwd(), source);
	assert.equal(await files.readText(relative), '\ufeff日本語\r\n');
	await files.removeDirectoryTree(files.joinPath(root, 'deep'));
	await files.removeDirectoryTree(files.joinPath(root, 'deep'));
	assert.equal(await files.exists(copy), false);
	await files.removeDirectoryTree(root);
	assert.equal(await files.exists(root), false);
});

async function fixture(t) {
	const root = await native.mkdtemp(path.join(os.tmpdir(), 'file-system-test-'));
	t.after(() => native.rm(root, { recursive: true, force: true }));
	return root;
}

for (const [label, create] of [
	['Node', root => new NodeFileSystem(root)],
	['Browser adapter (mock handles)', root => new BrowserFileSystem(directoryHandle(root))],
]) {
	test(`${label}: UTF-8, binary views, overwrite and sorted listing`, async t => {
		const fs = create(await fixture(t));
		await fs.makeDirectory('日本語');
		await fs.writeFile('日本語/text.txt', 'こんにちは 🌱');
		assert.equal(await fs.readText('日本語/text.txt'), 'こんにちは 🌱');
		const data = new Uint8Array([99, 0, 128, 255, 99]);
		await fs.writeFile('data.bin', data.subarray(1, 4));
		assert.deepEqual(await fs.readFile('data.bin'), new Uint8Array([0, 128, 255]));
		await fs.writeFile('data.bin', new Uint8Array([1]).buffer);
		assert.deepEqual(await fs.readFile('data.bin'), new Uint8Array([1]));
		assert.deepEqual(await fs.readDirectory(), [{ name: 'data.bin', kind: 'file' }, { name: '日本語', kind: 'directory' }]);
	});
	test(`${label}: creation, missing parents and removal`, async t => {
		const fs = create(await fixture(t));
		await assert.rejects(fs.writeFile('missing/file.txt', 'x'));
		await assert.rejects(fs.makeDirectory('a/b'));
		await fs.makeDirectory('a/b', { recursive: true });
		await fs.makeDirectory('a/b');
		await fs.writeFile('a/b/item', 'x');
		await assert.rejects(fs.remove('a'));
		await fs.remove('a', { recursive: true });
		assert.deepEqual(await fs.readDirectory(), []);
		await assert.rejects(fs.readFile('missing'));
		await assert.rejects(fs.remove('missing'));
	});
	test(`${label}: invalid paths and root mutation rejected`, async t => {
		const fs = create(await fixture(t));
		for (const invalid of ['../outside', '/absolute', 'C:/drive', 'a/../b', 'a//b', 'a\\b', '.', 'a/', 'NUL', 'file:stream', 'a.', 'a ', '\0']) {
			await assert.rejects(fs.writeFile(invalid, 'x'), TypeError, invalid);
			await assert.rejects(fs.readDirectory(invalid), TypeError, invalid);
		}
		for (const operation of [() => fs.writeFile('', 'x'), () => fs.remove(''), () => fs.makeDirectory(''), () => fs.readFile('')]) {
			await assert.rejects(operation, TypeError);
		}
		await assert.rejects(fs.writeFile('bad', {}), TypeError);
		assert.deepEqual(await fs.readDirectory(), []);
	});
	test(`${label}: convenience API, text copies and strict creation`, async t => {
		const fs = create(await fixture(t));
		const destination = create(await fixture(t));
		assert.equal(fs.pathSeparator, '/');
		assert.equal(fs.joinPath('', 'notes', 'a.js'), 'notes/a.js');
		assert.equal(fs.directoryName('a.js'), '');
		assert.equal(fs.baseName('notes/a.js', '.js'), 'a');
		assert.equal(fs.extension('.hidden'), '');
		assert.equal(fs.extension('notes/a.js'), '.js');
		assert.throws(() => fs.joinPath('notes', '../outside'), TypeError);
		assert.equal(await fs.exists(), true);
		assert.equal(await fs.isDirectory(), true);
		assert.equal(await fs.exists('missing'), false);
		await assert.rejects(fs.isFile('missing'));
		await fs.createDirectory('notes');
		await assert.rejects(fs.createDirectory('notes'));
		await assert.rejects(fs.createDirectory('missing/child'));
		await fs.writeText('notes/a.js', '\ufeff日本語\r\n');
		assert.equal(await fs.isFile('notes/a.js'), true);
		assert.equal(await fs.isDirectory('notes/a.js'), false);
		assert.equal(await fs.isFile('notes'), false);
		assert.equal(await fs.exists('notes/a.js'), true);
		assert.deepEqual(await fs.listDirectory('notes'), ['a.js']);
		assert.equal(await fs.readTextAsync('notes/a.js'), '\ufeff日本語\r\n');
		assert.equal(await fs.readTextAsync('missing'), undefined);
		assert.equal(await fs.readTextOrNull('missing'), null);
		assert.equal(await fs.copyTextFile('notes/a.js', 'deep/child/copy.js'), true);
		assert.equal(await fs.readText('deep/child/copy.js'), '\ufeff日本語\r\n');
		assert.equal(await fs.copyTextFile('notes/a.js', 'other/copy.js', destination), true);
		assert.equal(await destination.readText('other/copy.js'), '\ufeff日本語\r\n');
		assert.equal(await fs.copyTextFile('missing', 'untouched/copy'), false);
		assert.equal(await fs.exists('untouched'), false);
		await fs.writeTextAsync('notes/a.js', 'new');
		assert.equal(await fs.readTextOrNull('notes/a.js'), 'new');
		await assert.rejects(fs.writeText('bad', new Uint8Array()), TypeError);
		await assert.rejects(fs.removeDirectoryTree('notes/a.js'));
		await fs.removeDirectoryTree('deep');
		await fs.removeDirectoryTree('deep');
		assert.equal(await fs.exists('deep'), false);
		const a = await fs.createTempDirectory('work-');
		const b = await fs.createTempDirectory('work-');
		const c = await fs.createTempDirectory('');
		assert.notEqual(a, b);
		for (const name of [a, b, c]) assert.equal(await fs.isDirectory(name), true);
		for (const invalid of ['', '../escape', '/absolute', 'a\\b']) {
			await assert.rejects(fs.createDirectory(invalid), TypeError);
			await assert.rejects(fs.removeDirectoryTree(invalid), TypeError);
			await assert.rejects(fs.readTextAsync(invalid), TypeError);
		}
		await assert.rejects(fs.createTempDirectory('../escape'), TypeError);
	});
}

test('Node URLs, module location and owner write bit', async t => {
	const root = await fixture(t);
	const fs = new NodeFileSystem(root);
	await fs.writeText('a #%.js', 'x');
	assert.match(await fs.toFileURL('a #%.js'), /a%20%23%25\.js$/);
	assert.equal(await fs.executionFileURL('a #%.js'), 'file:///' + path.join(await native.realpath(root), 'a #%.js').replace(/\\/g, '/'));
	assert.equal(fs.moduleDirectory(new URL('../src/lib/file-system-node.js', import.meta.url)), path.resolve('src/lib'));
	assert.equal(await fs.isWritable('a #%.js'), ((await native.stat(path.join(root, 'a #%.js'))).mode & 0x0080) !== 0);
	assert.equal(fs.capabilities.fileURL, true);
});

test('Browser permissions and explicit unsupported operations', async () => {
	let permission = 'granted';
	const fs = new BrowserFileSystem({ kind: 'directory', async queryPermission(options) {
		assert.equal(options.mode, 'readwrite');
		return permission;
	} });
	assert.equal(await fs.isWritable(), true);
	for (permission of ['prompt', 'denied']) assert.equal(await fs.isWritable(), false);
	assert.equal(fs.capabilities.fileURL, false);
	assert.throws(() => fs.moduleDirectory('file:///x.js'), { name: 'NotSupportedError' });
	for (const operation of [() => fs.toFileURL('x'), () => fs.executionFileURL('x'), () => fs.hideDirectory('x')]) {
		await assert.rejects(operation(), { name: 'NotSupportedError' });
	}
	await assert.rejects(new BrowserFileSystem({ kind: 'directory' }).isWritable(), { name: 'NotSupportedError' });
	const denied = new BrowserFileSystem({ kind: 'directory', async getFileHandle() { throw new DOMException('Denied', 'NotAllowedError'); } });
	await assert.rejects(denied.exists('x'), { name: 'NotAllowedError' });
});

test('Node pickers accept root-relative selections, cancel and reject outside', async t => {
	const root = await fixture(t);
	await native.writeFile(path.join(root, 'file.txt'), 'x');
	let selection = path.join(root, 'file.txt');
	const fs = new NodeFileSystem(root, { pickFile: async () => selection, pickDirectory: async () => root });
	assert.equal(await fs.pickFile(), 'file.txt');
	assert.equal(await fs.pickDirectory(), '');
	selection = path.dirname(root);
	await assert.rejects(fs.pickFile());
	selection = null;
	assert.equal(await fs.pickFile(), null);
	await assert.rejects(new NodeFileSystem(root).pickFile(), /callback/);
});

test('Node rejects symlink traversal', async t => {
	const root = await fixture(t);
	const outside = await fixture(t);
	await native.writeFile(path.join(outside, 'secret'), 'unchanged');
	try {
		await native.symlink(outside, path.join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
	} catch (error) {
		if (error.code !== 'EPERM') throw error;
		t.skip('This environment does not permit creating symbolic links');
		return;
	}
	const fs = new NodeFileSystem(root);
	await assert.rejects(fs.readFile('link/secret'), /Symbolic/);
	await assert.rejects(fs.writeFile('link/new', 'x'), /Symbolic/);
	await assert.rejects(fs.remove('link', { recursive: true }), /Symbolic/);
	assert.equal(await native.readFile(path.join(outside, 'secret'), 'utf8'), 'unchanged');
});

test('Browser pickers validate membership, preserve options and cancel', async t => {
	const root = directoryHandle(await fixture(t));
	await native.writeFile(path.join(root.location, 'file.txt'), 'x');
	const fs = new BrowserFileSystem(root);
	let selection = await root.getFileHandle('file.txt');
	t.mock.method(globalThis, 'showOpenFilePicker', async options => {
		assert.equal(options.startIn, root);
		assert.equal(options.multiple, false);
		return [selection];
	});
	assert.equal(await fs.pickFile({ multiple: true }), 'file.txt');
	selection = { location: path.dirname(root.location) };
	await assert.rejects(fs.pickFile(), /outside/);
	t.mock.method(globalThis, 'showDirectoryPicker', async () => root);
	assert.equal(await fs.pickDirectory(), '');
	assert.equal((await BrowserFileSystem.open()).name, root.name);
	t.mock.method(globalThis, 'showDirectoryPicker', async () => { throw new DOMException('Cancel', 'AbortError'); });
	assert.equal(await fs.pickDirectory(), null);
	assert.equal(await BrowserFileSystem.open(), null);
});

// The picker functions do not exist in Node; define test placeholders for mock.method.
globalThis.showOpenFilePicker = () => {};
globalThis.showDirectoryPicker = () => {};

test('Browser aborts an incomplete write and preserves the original error', async () => {
	let aborted = false;
	const failure = new Error('Write failed');
	const fs = new BrowserFileSystem({ kind: 'directory', async getFileHandle() {
		return { async createWritable() { return {
			async write() { throw failure; },
			async abort() { aborted = true; },
		}; } };
	} });
	await assert.rejects(fs.writeFile('file', 'x'), error => error === failure);
	assert.equal(aborted, true);
});

