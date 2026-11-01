import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as files from '../src/fs-node.js';
import { Backup } from '../src/backup.js';

test('file adapter preserves UTF-8 text, creates copy parents and removes a tree', async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'croqujs-files-'));
	try {
		const source = path.join(root, '日本語.js');
		const destination = path.join(root, 'nested', 'child', 'copy.js');
		const text = 'const greeting = "こんにちは";\r\n';
		await files.writeTextAsync(source, text);
		assert.equal(await files.readTextAsync(source), text);
		assert.equal(files.copyTextFile(source, destination), true);
		assert.equal(fs.readFileSync(destination, 'utf8'), text);
		assert.equal(files.isFile(source), true);
		assert.equal(files.isDirectory(path.dirname(destination)), true);
		assert.equal(files.readTextOrNull(path.join(root, 'missing')), null);
		assert.equal(await files.readTextAsync(path.join(root, 'missing')), undefined);
		files.removeDirectoryTree(path.join(root, 'nested'));
		assert.equal(fs.existsSync(path.join(root, 'nested')), false);
		assert.equal(fs.readFileSync(source, 'utf8'), text);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test('backup preserves the old file and suppresses duplicate text backups', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'croqujs-backup-'));
	try {
		const source = path.join(root, 'sample.js');
		const backupDir = path.join(root, '.sample.backup');
		// Existing directory avoids invoking the platform's hidden-attribute command.
		fs.mkdirSync(backupDir);
		fs.writeFileSync(source, 'old\r\n');
		const backup = new Backup();
		backup.setFilePath(source);
		assert.equal(backup.backupExistingFile('new\n', source), true);
		const entries = fs.readdirSync(backupDir);
		assert.equal(entries.length, 1);
		assert.equal(fs.readFileSync(path.join(backupDir, entries[0]), 'utf8'), 'old\r\n');
		assert.equal(backup.backupText('new\n'), false);
		assert.equal(fs.readFileSync(source, 'utf8'), 'old\r\n');
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});
