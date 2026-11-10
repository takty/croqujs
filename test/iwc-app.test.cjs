const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

async function checkApp() {
	const { app, BrowserWindow } = require('electron');
	const { SessionServer } = await (await import('./session-module.mjs')).loadSessionModule();
	const session = new SessionServer('iwc-app');
	// Keep the real application pages hidden while exercising their normal commands.
	session._studyWin.show = () => {};
	const read = code => session._studyWin.webContents.executeJavaScript(code, true);
	async function waitFor(readValue, expression) {
		for (let i = 0; i < 200; i++) {
			if (await readValue(expression)) return;
			await new Promise(resolve => setTimeout(resolve, 25));
		}
		throw new Error('Timed out: ' + expression);
	}
	try {
		await waitFor(read, '!!document.querySelector(".CodeMirror")');
		await waitFor(async () => session._studyWin.getTitle() !== 'Croqujs', 'Study initialization');
		for (const value of [1, 2]) {
			await read(`document.querySelector('.CodeMirror').CodeMirror.setValue('console.log("iwc-output-${value}"); setTimeout(() => { throw new Error("iwc-error-${value}"); }, 0);');
				document.querySelector('[data-cmd=runWithoutWindow]').dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); void 0;`);
			await waitFor(read, `document.querySelector('#output-pane').textContent.includes('iwc-output-${value}') && document.querySelector('#output-pane').textContent.includes('iwc-error-${value}')`);
			assert.equal(session._fieldWin.isVisible(), false);
			assert.match(session._studyWin.webContents.getURL(), /^file:/);
			assert.match(session._fieldWin.webContents.mainFrame.frames[0].url, /^file:/);
			await read('document.querySelector("[data-cmd=stop]").dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); void 0;');
			await waitFor(code => session._fieldWin.webContents.executeJavaScript(code), '!document.querySelector("iframe")');
		}
		const peer = new SessionServer('iwc-app-peer');
		peer._studyWin.show = () => {};
		const peerRead = code => peer._studyWin.webContents.executeJavaScript(code, true);
		await waitFor(peerRead, '!!document.querySelector(".CodeMirror")');
		await waitFor(async () => peer._studyWin.getTitle() !== 'Croqujs', 'peer initialization');
		const before = await peerRead('getComputedStyle(document.querySelector(".CodeMirror")).fontSize');
		await read('document.querySelector("[data-cmd=fontSizePlus]").dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); void 0;');
		await waitFor(peerRead, `getComputedStyle(document.querySelector('.CodeMirror')).fontSize !== ${JSON.stringify(before)}`);
		assert.equal(await read('getComputedStyle(document.querySelector(".CodeMirror")).fontSize'), await peerRead('getComputedStyle(document.querySelector(".CodeMirror")).fontSize'));
		console.log(JSON.stringify({ passed: true, electron: process.versions.electron, checks: ['app output and errors from temporary file iframe', 'hidden execution', 'stop and rerun', 'settings synchronization between editors'] }));
	} finally {
		for (const window of BrowserWindow.getAllWindows()) window.destroy();
		await session._urlProvider.dispose();
	}
}

if (process.versions.electron) {
	const { app } = require('electron');
	app.setPath('userData', path.join(__dirname, '.profiles', 'iwc-app-' + process.pid));
	app.commandLine.appendSwitch('disable-gpu');
	app.whenReady().then(checkApp).then(() => app.exit(0), error => { console.error(error); app.exit(1); });
} else {
	test('Iwc runs the real app output/error/stop paths through file pages', () => {
		const result = spawnSync(process.execPath, [path.join(__dirname, 'run-study-integration.mjs'), './iwc-app.test.cjs'], {
			encoding: 'utf8', timeout: 50000, windowsHide: true,
		});
		assert.ifError(result.error);
		assert.equal(result.status, 0, result.stdout + result.stderr);
	});
}
