import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NodeFileSystem } from '../src/fs/fs-node.js';
import { Backup } from '../src/project/backup.js';
import { createHash } from 'node:crypto';

test('backup digest matches synchronous UTF-8 SHA-256', () => {
	const backup = new Backup(new NodeFileSystem());
	for (const text of ['', 'abc', '日本語', '😀', 'a\r\nb', '\ud800']) {
		assert.equal(backup._getDigest(text), createHash('sha256').update(text).digest('hex'));
	}
});

test('backup preserves the old file and suppresses duplicate text backups', async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'croqujs-backup-'));
	try {
		const source = path.join(root, 'sample.js');
		const backupDir = path.join(root, '.sample.backup');
		// Existing directory avoids invoking the platform's hidden-attribute command.
		fs.mkdirSync(backupDir);
		fs.writeFileSync(source, 'old\r\n');
		const backup = new Backup(new NodeFileSystem());
		backup.setFilePath(source);
		assert.equal(await backup.backupExistingFile('new\n', source), true);
		const entries = fs.readdirSync(backupDir);
		assert.equal(entries.length, 1);
		assert.equal(fs.readFileSync(path.join(backupDir, entries[0]), 'utf8'), 'old\r\n');
		assert.equal(await backup.backupText('new\n'), false);
		assert.equal(fs.readFileSync(source, 'utf8'), 'old\r\n');
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});
