/**
 * Croqujs study-window integration checks using the real Electron renderer.
 */

const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
const { readFile, writeFile, unlink } = require('node:fs/promises');
const path = require('node:path');
const { withStudyInstance } = require('./renderer-html.cjs');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'app/study/study.integration.html');
app.setPath('userData', path.join(ROOT, 'test/.profiles/study-integration'));
app.commandLine.appendSwitch('disable-gpu');

const calls = [];
let window;
let created = false;

app.whenReady().then(async () => {
	try {
		const { allowPaste } = await (await import('./session-module.mjs')).loadSessionModule();
		const html = await readFile(path.join(ROOT, 'app/study/index.html'), 'utf8');
		await writeFile(HTML, await withStudyInstance(html), { flag: 'wx' });
		created = true;
		ipcMain.on('notifyServer_integration', (_event, method) => { calls.push({ method }); });
		ipcMain.handle('callServer_integration', async (_event, method, ...args) => {
			calls.push({ method, args });
			if (method === 'testReadClipboard') return clipboard.readText();
			if (method === 'doReady') return ['init', [null, 'sample', null, null, false, [], 'function initial() { return 1; }']];
			return ['test-complete'];
		});
		window = new BrowserWindow({
			show: false,
			width: 1000,
			height: 750,
			webPreferences: {
				contextIsolation: true,
				enableDeprecatedPaste: true,
				nodeIntegration: false,
				preload: path.join(ROOT, 'app/electron/preload.js'),
			},
		});
		await allowPaste(window.webContents, HTML);
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
			const OutputPane = s._outputPane.constructor;
			const styleUrls = () => [...document.querySelectorAll('link[rel="stylesheet"]')].map(link => link.href);
			const initialStyles = styleUrls();
			check(initialStyles.filter(url => url.includes('/assets/')).length === 1, 'Study and all UI components share one bundled stylesheet');
			const output = document.querySelector('#output-pane');
			s._outputPane.addError('Output error', 'err');
			check(output.offsetHeight > 0, 'Output error opens the pane through the host callback');
			s._outputPane.toggle();
			check(output.offsetHeight === 0, 'Output pane toggle closes the host layout');
			s._outputPane.toggle();
			check(output.offsetHeight > 0, 'Output pane toggle restores the host layout');
			s._outputPane.initialize();
			check(output.offsetHeight === 0 && s._outputPane.getErrorCount() === 0, 'Output initialization clears errors and closes the pane');
			const standalone = document.createElement('div');
			standalone.style.height = '0px';
			document.body.appendChild(standalone);
			const pane = new OutputPane(standalone, { typeLabels: [{ type: 'number', label: 'Number' }] }, {
				onVisibilityChange: visible => { standalone.style.height = visible ? '120px' : '0px'; },
			});
			const waitFor = async predicate => {
				const deadline = Date.now() + 3000;
				while (!predicate()) {
					if (Date.now() > deadline) throw new Error('Output pane did not update');
					await new Promise(resolve => setTimeout(resolve, 20));
				}
			};
			try {
				let clicked = 0;
				pane.addError('Clickable error', 'err', () => { clicked += 1; });
				const msg = '<span class="type-number">42</span>';
				pane.addOutput([{ type: 'std', msg, count: 1 }, { type: 'std', msg, count: 1 }]);
				await waitFor(() => standalone.querySelector('.count'));
				check(standalone.querySelector('.count').textContent === '2' && standalone.querySelector('.type-number').title === 'Number', 'Standalone worker combines repeated output and assigns type labels');
				standalone.querySelector('.err').click();
				check(clicked === 1 && output.offsetHeight === 0, 'Standalone output preserves error callbacks without operating the Study handle');
				pane.addOutput(Array.from({ length: 105 }, (_, i) => ({ type: 'std', msg: String(i), count: 1 })));
				await waitFor(() => standalone.firstChild.lastChild?.textContent === '104');
				check(standalone.firstChild.children.length === 100 && standalone.firstChild.firstChild.textContent === '5', 'Output retains the latest 100 lines');
			} finally {
				pane.destroy();
				standalone.remove();
			}
			const menu = document.querySelector('.side-menu');
			const Splitter = s._splitter.constructor;
			const handle = document.querySelector('#handle');
			handle.click();
			check(output.offsetHeight === 100 && document.querySelector('#editor').offsetHeight + 40 + 8 + output.offsetHeight === document.body.offsetHeight, 'Splitter handle opens output and resizes the editor');
			handle.click();
			check(output.offsetHeight === 0, 'Splitter handle closes output');
			const host = document.createElement('div');
			host.style.cssText = 'position: fixed; top: 60px; left: 20px; width: 200px; height: 400px';
			host.innerHTML = '<div></div><div></div><div style="height: 0"></div>';
			document.body.appendChild(host);
			const [mainPane, divider, subPane] = host.children;
			let resizeCount = 0;
			const split = new Splitter(host, { main: mainPane, handle: divider, sub: subPane, onResize: () => { resizeCount += 1; } });
			const drag = mainHeight => {
				divider.dispatchEvent(new MouseEvent('mousedown', { clientY: divider.getBoundingClientRect().top + 2 }));
				document.dispatchEvent(new MouseEvent('mousemove', { clientY: host.getBoundingClientRect().top + mainHeight + 2, cancelable: true }));
				document.dispatchEvent(new MouseEvent('mouseup', { cancelable: true }));
				divider.click();
			};
			try {
				drag(220);
				check(mainPane.offsetHeight === 220 && subPane.offsetHeight === 172, 'Standalone splitter accounts for container position and suppresses click after drag');
				split.setVisible(false);
				split.setVisible(true);
				check(subPane.offsetHeight === 172, 'Splitter restores the last dragged height');
				drag(10);
				check(mainPane.offsetHeight === 100, 'Splitter preserves the minimum main pane height');
				drag(380);
				check(subPane.offsetHeight === 0, 'Splitter collapses output below its minimum height');
				host.style.height = '450px';
				await waitFor(() => mainPane.offsetHeight === 442);
				check(true, 'Splitter responds to container resizing');
				split.destroy();
				const count = resizeCount;
				divider.dispatchEvent(new MouseEvent('mousedown'));
				divider.click();
				host.style.height = '500px';
				await new Promise(resolve => setTimeout(resolve, 50));
				check(resizeCount === count, 'Splitter destroy removes listeners and observer');
			} finally {
				split.destroy();
				host.remove();
			}
			const toolbar = document.querySelector('.toolbar');
			toolbar.style.transition = 'none';
			document.documentElement.style.setProperty('--color-window', 'rgb(12, 34, 56)');
			try {
				check(getComputedStyle(toolbar).backgroundColor === 'rgb(12, 34, 56)' && getComputedStyle(menu).backgroundColor === 'rgb(12, 34, 56)', 'Shared CSS custom properties update both toolbar and menu');
			} finally {
				document.documentElement.style.removeProperty('--color-window');
				getComputedStyle(toolbar).backgroundColor;
				toolbar.style.removeProperty('transition');
			}
			check(!window.SideMenu && !window.Toolbar && !document.querySelector('script[src$="side-menu.js"], script[src$="toolbar.js"]'), 'Menu and toolbar are loaded as modules');
			check([...toolbar.querySelectorAll('[data-cmd]')].map(btn => btn.dataset.cmd).join(',') === 'menu,save,saveCopy,undo,copy,paste,tileWin,run' && toolbar.querySelectorAll('.filler').length === 2, 'JSON toolbar preserves button order and spacing');
			check(getComputedStyle(toolbar).height === '40px' && getComputedStyle(toolbar.querySelector('.btn')).width === '64px', 'Standalone toolbar CSS preserves dimensions');
			const menuButton = toolbar.querySelector('[data-cmd="menu"]');
			menuButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
			check(menu.style.display === 'block', 'Toolbar opens menu through host callback');
			menuButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
			check(menu.style.display === 'none' && e.hasFocus(), 'Toolbar closes menu and restores editor focus');
			const originalExecuteCommand = s.executeCommand;
			const toolbarCommands = [];
			s.executeCommand = cmd => toolbarCommands.push(cmd);
			try {
				const save = toolbar.querySelector('[data-cmd="save"]');
				const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
				save.dispatchEvent(down);
				save.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
				check(down.defaultPrevented && e.hasFocus() && toolbarCommands.join(',') === 'save', 'Toolbar forwards command once and prevents mouse focus change');
			} finally {
				s.executeCommand = originalExecuteCommand;
			}
			s._toolbar.reflectClipboard('clipboard preview');
			const paste = toolbar.querySelector('[data-cmd="paste"]');
			check(!paste.classList.contains('disabled') && paste.title === s._res.menu.paste + '\\nclipboard preview', 'Toolbar preserves clipboard tooltip');
			s._toolbar.reflectClipboard('');
			check(paste.classList.contains('disabled') && paste.title === s._res.menu.paste, 'Toolbar disables empty clipboard');
			s._toolbar.showMessage('Drop a file', true);
			check(toolbar.querySelector('.overlap').textContent === 'Drop a file' && getComputedStyle(toolbar.querySelector('.overlap')).display === 'flex' && !toolbar.classList.contains('toolbar-shadow'), 'Toolbar preserves message overlay and shadow control');
			s._toolbar.hideMessage();
			await new Promise(resolve => setTimeout(resolve, 20));
			check(getComputedStyle(toolbar.querySelector('.overlap')).display === 'none' && toolbar.classList.contains('toolbar-shadow'), 'Toolbar hides message and restores shadow');
			const menuStyle = getComputedStyle(menu);
			check(menuStyle.position === 'absolute' && menuStyle.top === '40px' && menuStyle.backgroundColor === 'rgb(248, 248, 248)' && menuStyle.fontSize === '14px', 'Standalone menu CSS receives host settings');
			menu.style.setProperty('--side-menu-top', '60px');
			menu.style.setProperty('--side-menu-padding', '15px');
			menu.style.setProperty('--side-menu-background', 'rgb(1, 2, 3)');
			check(getComputedStyle(menu).top === '60px' && getComputedStyle(menu).backgroundColor === 'rgb(1, 2, 3)' && getComputedStyle(menu.querySelector('.caption')).paddingTop === '15px', 'Menu custom properties can be overridden externally');
			for (const name of ['top', 'padding', 'background']) menu.style.removeProperty('--side-menu-' + name);
			const checkedItem = menu.querySelector('[data-cmd="toggleSoftWrap"]');
			const wasChecked = checkedItem.classList.contains('checked');
			checkedItem.classList.add('checked');
			check(getComputedStyle(checkedItem, '::before').backgroundImage.includes('/assets/icon-check-'), 'Host check icon resolves from the host stylesheet');
			checkedItem.classList.toggle('checked', wasChecked);
			check(menu.querySelectorAll('.caption').length === 5, 'JSON menu creates all sections');
			check(menu.querySelector('[data-cmd="save"]').firstChild.textContent === s._res.menu.save, 'Menu label defaults to command key');
			check(menu.querySelector('[data-cmd="showAbout"]').textContent === s._res.version && !s._res.version.includes('%VERSION'), 'Explicit resource key renders the built version exactly once');
			check(!menu.querySelector('[data-cmd="setLanguageJa"]').matches('.mi, .icon'), 'Grouped text items retain compact styling');
			check(menu.querySelector('[data-cmd="undo"]').title.startsWith(s._res.menu.undo), 'Icon items retain localized tooltips');
			const menuCommands = [];
			const onCommand = s._sideMenu._onCommand;
			s._sideMenu._onCommand = (cmd, close) => menuCommands.push([cmd, close]);
			try {
				menu.querySelector('[data-cmd="save"]').dispatchEvent(new MouseEvent('mouseup'));
				menu.querySelector('[data-cmd="fontSizeMinus"]').dispatchEvent(new MouseEvent('mouseup'));
				menu.querySelector('[data-alt-cmd]').dispatchEvent(new MouseEvent('mouseup', { altKey: true }));
				window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, metaKey: true }));
				check(JSON.stringify(menuCommands) === JSON.stringify([['save', true], ['fontSizeMinus', false], ['toggleLamono', false], ['save', true]]), 'Generated menu preserves commands, stay, Alt action, and shortcuts');
			} finally {
				s._sideMenu._onCommand = onCommand;
			}
			const rendererErrors = [];
			const onError = event => rendererErrors.push(event.message);
			window.addEventListener('error', onError);
			s._sideMenu.open();
			document.querySelector('[data-cmd="showAbout"]').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 100));
			window.removeEventListener('error', onError);
			check(!!document.querySelector('.swal2-popup h1')?.textContent.includes('Croqujs'), 'About dialog opens from menu: ' + rendererErrors.join('; '));
			check(!window.Swal && !document.querySelector('script[src*="sweetalert2"]'), 'SweetAlert2 is private to the DialogBox module');
			check(getComputedStyle(document.querySelector('.swal2-popup')).fontSize === '14px' && getComputedStyle(document.querySelector('.swal2-confirm')).backgroundColor === 'rgb(245, 162, 0)', 'Dialog styles load before display with host settings');
			document.querySelector('.swal2-confirm').click();
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
			const confirmation = s._dialogBox.showConfirm('Confirm test', 'warning');
			check(e.getState().disabled, 'Dialog disables editor');
			document.querySelector('.swal2-cancel').click();
			check((await confirmation).isDismissed, 'Dialog cancellation preserves result');
			check(e.getState().readOnly && !e.getState().disabled, 'Dialog restores read-only state');
			check(e.hasFocus(), 'Dialog restores focus through public API');
			const accepted = s._dialogBox.showConfirm('Confirm test', 'question');
			document.querySelector('.swal2-confirm').click();
			check((await accepted).isConfirmed, 'Dialog confirmation preserves result');
			const prompt = s._dialogBox.showPromptWithOption('Name', 'info', 'Enter a name', 'Initial', 'Include libraries');
			document.querySelector('#swal-input').value = 'Example';
			document.querySelector('#swal-checkbox').checked = true;
			document.querySelector('.swal2-confirm').click();
			check(JSON.stringify((await prompt).value) === JSON.stringify(['Example', true]), 'Dialog prompt preserves text and checkbox result');
			const promptCancel = s._dialogBox.showPromptWithOption('Name', 'info', '', '', 'Option');
			document.querySelector('.swal2-cancel').click();
			check((await promptCancel).isDismissed && !e.getState().disabled, 'Prompt cancellation restores editor');
			check(JSON.stringify(styleUrls()) === JSON.stringify(initialStyles), 'Creating components and opening dialogs adds no stylesheets');
			s._initDocument(null, 'exported', null, null, false, [], 'function exported() { return 3; }');
			check(!e.getState().canUndo && !s._isModified, 'Document replacement resets modified state and history');
			s._dialogBox.showPromptWithOption = async () => ({ value: ['Example', false] });
			await s._onExportAsLibrary();
			await s._handleSaving(text => s._session.doSave(text, 'Save'));
			await s._handleExecution(text => s._session.doRun(text));
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
			const clipboardText = await window.ipc.invoke('callServer_integration', 'testReadClipboard');
			if (clipboardText) {
				e.setSettings({ readOnly: false, disabled: false, autoFormat: false });
				e.loadDocument('');
				e.focus();
				s._reflectClipboardState(clipboardText);
				toolbar.querySelector('[data-cmd="paste"]').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
				await new Promise(resolve => setTimeout(resolve, 100));
				check(e.getValue().replaceAll('\\r\\n', '\\n') === clipboardText.replaceAll('\\r\\n', '\\n'), 'Toolbar inserts actual system clipboard text through the original editor command');
			} else {
				checks.push('SKIPPED: real paste check requires nonempty system clipboard text');
			}
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
