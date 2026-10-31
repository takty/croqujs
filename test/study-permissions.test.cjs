const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fileURLToPath } = require('node:url');
const { allowStudyPaste } = require('../src/study-permissions.js');

test('legacy paste is limited to registered editor main frames, including multiple windows', () => {
	let check, request;
	const session = {
		setPermissionCheckHandler: handler => { check = handler; },
		setPermissionRequestHandler: handler => { request = handler; },
	};
	const page = process.platform === 'win32' ? 'file:///C:/app/study%20files/study%23test.html' : 'file:///app/study%20files/study%23test.html';
	const make = url => ({ session, getURL: () => url, isDestroyed: () => false });
	const first = make(page + '#1'), second = make(page + '#2'), field = make(page + '#3');
	allowStudyPaste(first, fileURLToPath(page));
	allowStudyPaste(second, fileURLToPath(page));
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
});
