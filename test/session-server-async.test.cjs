const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

async function checkSession() {
	const { SessionServer } = await import('../app/session/session-server.js');
	const { ipcMain } = require('electron');
	const createWindow = SessionServer.prototype._createStudyWindow;
	SessionServer.prototype._createStudyWindow = async function () {};
	try {
		const shared = new SessionServer('shared-files-test');
		assert.ok(shared._backup._fs);
		assert.equal(shared._backup._fs, shared._exporter._fs);
		assert.equal(shared._backup._fs, shared._urlProvider._fs);
		assert.equal(shared._urlProvider._exporter, shared._exporter);
		try {
			const response = await shared._getRunResponse('console.log("run");');
			assert.equal(response[0], 'open');
			const output = fileURLToPath(response[1]);
			assert.match(await fs.readFile(output, 'utf8'), /<script src="lib\/injection\.js"><\/script>/);
			assert.equal(await fs.readFile(path.join(path.dirname(output), 'lib/injection.js'), 'utf8'),
				await fs.readFile(path.join(__dirname, '../app/lib/injection.js'), 'utf8'));
		} finally {
			await shared._urlProvider.dispose();
		}
	} finally {
		SessionServer.prototype._createStudyWindow = createWindow;
		ipcMain.removeHandler('callServer_shared-files-test');
		ipcMain.removeAllListeners('notifyServer_shared-files-test');
	}
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'croqujs-session-'));
	const pause = () => new Promise(resolve => setImmediate(resolve));
	const server = Object.create(SessionServer.prototype);
	const events = [];
	Object.assign(server, {
		_modificationVersion: 0,
		_isModified: true, _tempFilePath: null, _fieldWin: null,
		_studyWin: { show() {}, destroy() { events.push('destroy'); } },
		_backup: {
			setFilePath() {},
			async backupExistingFile(_text, file) {
				await pause();
				assert.equal(await fs.readFile(file, 'utf8'), 'old');
				events.push('backup');
			},
			async backupText() { await pause(); events.push('backup-close'); },
		},
		_exporter: {
			async loadDefJsons() { await pause(); return ['definitions']; },
			async exportAsWebPage() { await pause(); throw new Error('export failed'); },
		},
		_urlProvider: { async dispose() { await pause(); events.push('dispose'); } },
	});
	try {
		const file = path.join(root, '日本語 #%.js');
		await fs.writeFile(file, 'old');
		const saving = server._save(file, 'new\n');
		server.onStudyModified(); // An edit arriving during a save must remain dirty.
		const saved = await saving;
		assert.equal(saved[0], 'path');
		assert.deepEqual(saved[1][5], ['definitions']);
		assert.equal(await fs.readFile(file, 'utf8'), 'new\r\n');
		assert.equal(server._isModified, true);
		assert.deepEqual(events, ['backup']);
		assert.equal((await server._openFile(path.join(root, 'missing.js')))[0], 'alert_error');
		assert.equal((await server._openFile(path.join(root, 'invalid?.js')))[0], 'alert_error');
		assert.equal((await server.doExportAsWebPage('code'))[0], 'alert_error');
		server._exporter.exportAsWebPage = async (_text, source, output) => {
			assert.equal(source, file);
			assert.equal(path.isAbsolute(output), true);
			await fs.writeFile(path.join(output, 'index.html'), 'exported');
			return [true, path.join(output, 'index.html')];
		};
		const output = server._makeExportPath(file);
		await fs.writeFile(path.join(output, 'stale.txt'), 'old export');
		assert.equal((await server.doExportAsWebPage('code'))[0], 'success_export');
		assert.deepEqual(await fs.readdir(output), ['index.html']);
		const initialized = await server._openFile(file);
		assert.equal(initialized[0], 'init');
		assert.deepEqual(initialized[1][5], ['definitions']);
		assert.equal((await server.doNew())[0], 'init');
		await fs.mkdir(path.join(root, 'not-a-file.js'));
		await fs.writeFile(path.join(root, 'skip.lib.js'), 'library');
		assert.equal((await server.doFileDropped(root))[1][0], file);
		const other = path.join(root, 'other');
		await fs.mkdir(other);
		server._backup.backupExistingFile = async () => {};
		const copy = path.join(other, 'copy.js');
		assert.deepEqual(await server._saveCopy(copy, 'copy\n'), ['nop']);
		assert.equal(await fs.readFile(copy, 'utf8'), 'copy\r\n');
		assert.equal(server._filePath, file);
		server._isModified = true;
		await server.doClose('changed');
		assert.deepEqual(events.slice(-3), ['backup-close', 'dispose', 'destroy']);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
}

if (process.versions.electron) {
	const { app } = require('electron');
	app.whenReady().then(checkSession).then(() => app.exit(0), error => {
		console.error(error);
		app.exit(1);
	});
} else {
	test('session awaits async work and handles save, export and close results', () => {
		const result = spawnSync(process.execPath, [path.join(__dirname, 'run-study-integration.mjs'), pathToFileURL(__filename).href], {
			encoding: 'utf8', timeout: 50000, windowsHide: true,
		});
		assert.ifError(result.error);
		assert.equal(result.status, 0, result.stdout + result.stderr);
	});
}
