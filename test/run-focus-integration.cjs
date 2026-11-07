const { app, BrowserWindow, ipcMain } = require('electron');
const { readFile, writeFile, unlink } = require('node:fs/promises');
const path = require('node:path');
const { withStudyInstance } = require('./renderer-html.cjs');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const html = path.join(root, 'app/study/study.focus-test.html');
const program = path.join(root, 'app/study/program.focus-test.html');
app.setPath('userData', path.join(__dirname, '.profiles/run-focus'));
app.commandLine.appendSwitch('disable-gpu');
const created = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let study, server;
let runs = 0, fieldFocus = 0;

async function until(predicate, message) {
	for (let i = 0; i < 100; i++) {
		if (await predicate()) return;
		await delay(50);
	}
	throw new Error(message);
}

app.whenReady().then(async () => {
	try {
		const { SessionServer } = await import('../app/session/session-server.js');
		await writeFile(html, withStudyInstance(await readFile(path.join(root, 'app/study/study.html'), 'utf8')), { flag: 'wx' });
		created.push(html);
		const programHTML = '<!doctype html><body><script src="../lib/injection.js"></script><script>'
			+ 'document.body.dataset.ran = location.hash.split(",")[2]; console.log("LSC run " + document.body.dataset.ran);'
			+ '</script></body>';
		await writeFile(program, programHTML, { flag: 'wx' });
		created.push(program);
		server = Object.create(SessionServer.prototype);
		Object.assign(server, {
			_id: 'focus-test', _fieldWin: null, _isModified: false,
			_urlProvider: { createUrl: async () => pathToFileURL(program).href + '#focus-test,0,' + (++runs) },
			_createFieldWindow() {
				const ready = SessionServer.prototype._createFieldWindow.call(this);
				this._fieldWin.on('focus', () => { fieldFocus++; });
				return ready;
			},
		});
		ipcMain.on('notifyServer_focus-test', () => {});
		ipcMain.handle('callServer_focus-test', (_event, method, ...args) => {
			if (method === 'doReady') return ['init', [null, 'focus-test', null, null, false, [], 'console.log("focus test");']];
			if (method === 'doRun') return server.doRun(...args);
			return ['nop'];
		});
		study = new BrowserWindow({ show: false, width: 1000, height: 750, webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(root, 'app/electron/preload.js') } });
		server._studyWin = study;
		await study.loadFile(html, { hash: 'focus-test' });
		await study.webContents.executeJavaScript('window.study.ready');
		study.show();
		for (const [state, action] of [['new', 'keyboard'], ['visible', 'button'], ['hidden', 'keyboard'], ['closed', 'button']]) {
			if (state === 'hidden') server._fieldWin.hide();
			if (state === 'closed') server._fieldWin.destroy();
			study.focus();
			await study.webContents.executeJavaScript('window.study._editor.focus()');
			await until(() => study.isFocused(), 'Test editor window did not gain focus');
			const expected = runs + 1;
			if (action === 'keyboard') {
				study.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'R', modifiers: ['control'] });
				study.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'R', modifiers: ['control'] });
			} else {
				const point = await study.webContents.executeJavaScript(`(() => { const r = document.querySelector('.toolbar [data-cmd="run"]').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
				study.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
				study.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
			}
			await until(async () => runs === expected && server._fieldWin?.isVisible() && await server._fieldWin.webContents.executeJavaScript(`document.querySelector('iframe')?.contentDocument?.body?.dataset.ran === '${expected}'`), 'Program did not load: ' + state);
			await until(() => study.webContents.executeJavaScript(`document.querySelector('#output-pane').textContent.includes('LSC run ${expected}')`), 'First console output did not reach Study: ' + state);
			await delay(150);
			if (!study.isFocused() || fieldFocus || !await study.webContents.executeJavaScript('window.study._editor.hasFocus()')) throw new Error('Execution stole editor focus: ' + state);
			console.log('PASS: ' + state + ' execution window, ' + action + ', editor focus retained after program load');
		}
	} catch (error) {
		console.error(error.stack);
		process.exitCode = 1;
	} finally {
		server?._fieldWin?.destroy();
		study?.destroy();
		for (const file of created) await unlink(file);
		app.exit(process.exitCode || 0);
	}
});
