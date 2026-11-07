const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

async function checkPermissions() {
	const { allowPaste } = await import('../app/session/session-server.js');
	let check, request;
	const session = {
		setPermissionCheckHandler: handler => { check = handler; },
		setPermissionRequestHandler: handler => { request = handler; },
	};
	const page = process.platform === 'win32' ? 'file:///C:/app/study%20files/study%23test.html' : 'file:///app/study%20files/study%23test.html';
	const make = url => ({ session, getURL: () => url, isDestroyed: () => false });
	const first = make(page + '#1'), second = make(page + '#2'), field = make(page + '#3');
	await allowPaste(first, fileURLToPath(page));
	await allowPaste(second, fileURLToPath(page));
	const details = { isMainFrame: true, requestingUrl: page + '#1' };
	const permission = 'deprecated-sync-clipboard-read';
	for (const editor of [first, second]) assert.equal(check(editor, permission, 'file://', details), true);
	for (const other of [field, null]) assert.equal(check(other, permission, 'file://', details), false);
	assert.equal(check(first, permission, 'file://', { ...details, isMainFrame: false }), false);
	assert.equal(check(first, permission, 'file://', { ...details, requestingUrl: 'https://example.com/' }), false);
	first.getURL = () => 'https://example.com/';
	assert.equal(check(first, permission, 'file://', details), false);
	request(second, permission, allowed => assert.equal(allowed, true), details);
	request(field, permission, allowed => assert.equal(allowed, false), details);
}

if (process.versions.electron) {
	const { app } = require('electron');
	app.whenReady().then(checkPermissions).then(() => app.exit(0), error => {
		console.error(error);
		app.exit(1);
	});
} else {
	test('legacy paste is limited to registered editor main frames, including multiple windows', () => {
		const result = spawnSync(process.execPath, [path.join(__dirname, 'run-study-integration.mjs'), pathToFileURL(__filename).href], { encoding: 'utf8', timeout: 50000, windowsHide: true });
		assert.ifError(result.error);
		assert.equal(result.status, 0, result.stdout + result.stderr);
	});
}
