/**
 * Croqujs study-window integration checks using the real Electron renderer.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const { readFile, writeFile, unlink } = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'app/study/study.integration.html');
app.setPath('userData', path.join(ROOT, 'test/.profiles/study-integration'));
app.commandLine.appendSwitch('disable-gpu');

const calls = [];
let window;
let created = false;

app.whenReady().then(async () => {
	try {
		const html = await readFile(path.join(ROOT, 'app/study/study.html'), 'utf8');
		await writeFile(HTML, html.replace('new Study();', 'window.study = new Study();'), { flag: 'wx' });
		created = true;
		ipcMain.on('notifyServer_integration', (_event, method) => { calls.push({ method }); });
		ipcMain.handle('callServer_integration', async (_event, method, ...args) => {
			calls.push({ method, args });
			if (method === 'doReady') return ['init', [null, 'sample', null, null, false, [], 'function initial() { return 1; }']];
			if (method === 'doCapturePage') return [(await window.capturePage(args[0])).toDataURL(), 1];
			if (method === 'doCopyImageToClipboard') return ['success'];
			return ['test-complete'];
		});
		window = new BrowserWindow({
			show: false,
			width: 1000,
			height: 750,
			webPreferences: {
				contextIsolation: true,
				nodeIntegration: false,
				preload: path.join(ROOT, 'app/study/preload.js'),
			},
		});
		await window.loadFile(HTML, { hash: 'integration' });
		const checks = await window.webContents.executeJavaScript(`(async () => {
			const checks = [];
			const check = (condition, message) => {
				if (!condition) throw new Error(message);
				checks.push(message);
			};
			await window.study.ready;
			const s = window.study;
			const e = s._editor;
			const rendererErrors = [];
			const onError = event => rendererErrors.push(event.message);
			window.addEventListener('error', onError);
			s._sideMenu.open();
			document.querySelector('[data-cmd="showAbout"]').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 100));
			window.removeEventListener('error', onError);
			check(!!document.querySelector('.swal2-popup h1')?.textContent.includes('Croqujs'), 'About dialog opens from menu: ' + rendererErrors.join('; '));
			Swal.clickConfirm();
			await new Promise(resolve => setTimeout(resolve, 100));
			check(!e.getState().disabled, 'Closing About dialog restores editor');
			e.blur();
			check(!e.hasFocus(), 'Public API releases editor focus');
			e.focus();
			check(e.hasFocus(), 'Public API restores editor focus');
			check(!!document.querySelector('.croq-mirror'), 'Croqujs mounts croq-mirror');
			for (const font of ['16px Inconsolata', '400 16px LaMono', '700 16px LaMono']) {
				const faces = await document.fonts.load(font);
				check(faces.length > 0 && faces.every(face => face.status === 'loaded'), 'Host font loads: ' + font);
			}
			check(e.getSettings().fontFamily.startsWith('Inconsolata'), 'Host selects Inconsolata');
			s.executeCommand('toggleLamono');
			await new Promise(resolve => setTimeout(resolve, 20));
			check(e.getSettings().fontFamily.startsWith('LaMono'), 'Host switches to LaMono');
			s.executeCommand('toggleLamono');
			await new Promise(resolve => setTimeout(resolve, 20));
			check(e.getSettings().fontFamily.startsWith('Inconsolata'), 'Host restores Inconsolata');
			check(!window.CodeMirror && !window.acorn && !window.tern, 'No legacy editor library globals');
			check(e.getValue().includes('initial') && !s._isModified, 'Initial document is not marked modified');
			e.replaceDocument('function edited() { return 2; }');
			check(s._isModified && e.getState().canUndo, 'Editing marks document modified and enables undo');
			s.executeCommand('undo');
			await new Promise(resolve => setTimeout(resolve, 20));
			check(e.getValue().includes('initial'), 'Host undo command reaches component');
			s._config.setItem('fontSize', 22);
			check(e.getSettings().fontSize === 22, 'Persistent config updates component');
			e.setSettings({ fontSize: 20 });
			check(s._config.getItem('fontSize') === 20, 'Editor zoom updates persistent config');
			document.querySelector('#editor .CodeMirror').dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -1 }));
			check(e.getSettings().fontSize === 22 && s._config.getItem('fontSize') === 22, 'Wheel zoom preserves two-pixel steps and persists settings');
			e.setSettings({ readOnly: true });
			s._dialogBox._disableBackground();
			check(e.getState().disabled, 'Dialog disables editor');
			s._dialogBox._enableBackground();
			check(e.getState().readOnly && !e.getState().disabled, 'Dialog restores read-only state');
			check(e.hasFocus(), 'Dialog restores focus through public API');
			s._initDocument(null, 'exported', null, null, false, [], 'function exported() { return 3; }');
			check(!e.getState().canUndo && !s._isModified, 'Document replacement resets modified state and history');
			s._dialogBox.showPromptWithOption = async () => ({ value: ['Example', false] });
			await s._onExportAsLibrary();
			await s._handleSaving('doSave', 'Save');
			await s._handleExecution('doRun');
			s._addErrorMessage({ msg: 'Error', isUserCode: true, line: 1, col: 2 });
			check(!!document.querySelector('#editor .error-line'), 'Runtime error highlights editor line');
			s._clearErrorMarker();
			check(!document.querySelector('#editor .error-line'), 'Runtime error highlight clears');
			s._addErrorMessage({ msg: 'Error', isUserCode: true, line: 999, col: 1 });
			check(e.getLineCount() === 1 && !!document.querySelector('#editor .error-line'), 'Out-of-range error line is clamped through public API');
			s._clearErrorMarker();
			const reflectedClipboard = [];
			const reflectClipboard = s._reflectClipboardState;
			try {
				s._reflectClipboardState = text => reflectedClipboard.push(text);
				e.execute('selectAll');
				for (const type of ['copy', 'cut']) {
					document.querySelector('#editor textarea').dispatchEvent(new ClipboardEvent(type, { bubbles: true, cancelable: true, clipboardData: new DataTransfer() }));
				}
			} finally {
				s._reflectClipboardState = reflectClipboard;
			}
			check(reflectedClipboard.length === 2 && reflectedClipboard.every(text => text === 'function exported() { return 3; }'), 'Public clipboard events update host state before cutting');
			const commands = [];
			const originalExec = document.execCommand;
			try {
				document.execCommand = command => { commands.push(command); return true; };
				for (const command of ['cut', 'copy', 'paste']) s.executeCommand(command);
				await new Promise(resolve => setTimeout(resolve, 20));
			} finally {
				document.execCommand = originalExec;
			}
			check(commands.join(',') === 'cut,copy,paste', 'Host clipboard commands reach component');
			e.replaceDocument(Array.from({ length: 45 }, (_, i) => '// capture line ' + i).join('\\n'));
			s._dialogBox.showAlert = async (_message, type) => { if (type === 'error') throw new Error(_message); };
			await s._cmdCopyAsImage();
			check(!e.getState().disabled && !document.querySelector('#editor .simple'), 'Image capture restores editor state');
			e.destroy();
			return checks;
		})()`);
		const exported = calls.find(call => call.method === 'doExportAsLibrary');
		if (!exported || exported.args[0] !== JSON.parse(exported.args[3]).text) throw new Error('Export source and analysis are not matched');
		if (!JSON.parse(exported.args[3]).fnNames.includes('exported')) throw new Error('Export did not use current analysis');
		checks.push('Export uses the matching current source and analysis');
		for (const method of ['doSave', 'doRun']) {
			const call = calls.find(call => call.method === method);
			if (!call || call.args[0] !== exported.args[0]) throw new Error(method + ' did not receive the current document');
		}
		checks.push('Save and run receive the component document');
		if (!calls.some(call => call.method === 'doCopyImageToClipboard' && call.args[0].startsWith('data:image/png'))) throw new Error('Image capture did not reach host');
		checks.push('Image capture reaches host without writing the OS clipboard in tests');
		if (calls.filter(call => call.method === 'doCapturePage').length < 2) throw new Error('Long document did not request multiple captures');
		checks.push('Component requests multiple Electron captures for a long document');
		const result = { passed: true, electron: process.versions.electron, checks };
		await writeFile(path.join(__dirname, 'study-integration-result.json'), JSON.stringify(result, null, '\t') + '\n');
		console.log(JSON.stringify(result, null, '\t'));
	} catch (error) {
		console.error(error.stack);
		process.exitCode = 1;
	} finally {
		window?.destroy();
		if (created) await unlink(HTML);
		app.exit(process.exitCode || 0);
	}
});
