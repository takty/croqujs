import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as native from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { Backup } from '../app/backup.js';
import { Exporter } from '../app/exporter.js';
import { NodeFileSystem } from '../app/lib/file-system-node.js';
import { BrowserFileSystem } from '../app/lib/file-system-browser.js';
import { directoryHandle } from './file-system-handles.mjs';

for (const [label, create] of [
	['Node', root => new NodeFileSystem(root)],
	['Browser handles', root => new BrowserFileSystem(directoryHandle(root))],
]) {
	test(`${label}: backup and exporter use the supplied filesystem`, async t => {
		const root = await native.mkdtemp(path.join(os.tmpdir(), 'croqujs-shared-'));
		t.after(() => native.rm(root, { recursive: true, force: true }));
		const files = create(root);
		const backup = new Backup(files);
		const exporter = new Exporter(files);
		assert.equal(backup._fs, files);
		assert.equal(exporter._fs, files);
		await files.writeText('main.js', 'old\r\n');
		await files.createDirectory('.main.backup');
		backup.setFilePath('main.js');
		backup._createTimeStampStr = () => '001';
		assert.equal(await backup.backupExistingFile('new\n', 'main.js'), true);
		assert.equal(await files.readText('.main.backup/main001.js'), 'old\r\n');
		assert.equal(await backup.backupText('new\n'), false);
		assert.equal(await backup.backupErrorLog({ message: 'error' }, 'new\n'), true);
		assert.deepEqual(JSON.parse(await files.readText('.main.backup/main001.log')), { message: 'error' });
		await files.writeText('helper.js', 'function twice(x) { return x * 2; }');
		await files.makeDirectory('def');
		await files.writeText('def/helper.json', '{"name":"helper"}');
		const code = '// @use helper as HELPERS\nfunction run() { return HELPERS.twice(3); }';
		assert.equal(await exporter.checkLibraryReadable(code, 'main.js'), true);
		assert.equal(await exporter.checkLibraryReadable('// @need missing.js', 'main.js'), 'missing.js');
		assert.deepEqual(await exporter.loadDefJsons(code, 'main.js'), ['{"name":"helper"}']);
		await files.makeDirectory('lib');
		await files.writeText('lib/injection.js', '// runtime');
		await files.makeDirectory('output');
		assert.deepEqual(await exporter.exportAsWebPage(code, 'main.js', 'output', true), [true, 'output/index.html']);
		assert.equal(await files.readText('output/lib/injection.js'), '// runtime');
		assert.match(await files.readText('output/index.html'), /<script src="lib\/injection\.js"><\/script>/);
		const context = {};
		vm.runInNewContext(await files.readText('output/helper.lib.js'), context);
		assert.equal(context.HELPERS.twice(3), 6);
		assert.deepEqual(await exporter.exportAsLibrary(code, 'bundle.js', 'BUNDLE', { fnNames: ['run'] }, true), [true, 'bundle.js']);
		const library = {};
		vm.runInNewContext(await files.readText('bundle.js'), library);
		assert.equal(library.BUNDLE.run(), 6);
		await files.makeDirectory('copies');
		assert.deepEqual(await exporter.copyLibraryOfTemplate('// @need helper.js', 'main.js', 'copies'), [true]);
		assert.equal(await files.readText('copies/helper.js'), await files.readText('helper.js'));
		assert.deepEqual(await exporter.exportAsWebPage('// @need missing.js', 'main.js', 'output'), [false, 'missing.js']);
		const missingInjection = new Exporter(files, 'absent-injection.js');
		assert.deepEqual(await missingInjection.exportAsWebPage('', null, 'output', true), [false, 'absent-injection.js']);
	});
}
