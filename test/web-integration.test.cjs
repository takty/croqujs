const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test } = require('node:test');

async function checkRenderer() {
	const { BrowserWindow } = require('electron');
	const window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: 'web-integration-' + process.pid } });
	window.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { show: false } }));
	const errors = [];
	window.webContents.on('console-message', event => {
		if (event.level === 'error') errors.push(event.message);
	});
	const evaluate = code => window.webContents.executeJavaScript(code, true);
	async function waitFor(code, contents = window.webContents) {
		for (let i = 0; i < 200; i++) {
			if (await contents.executeJavaScript(code)) return;
			await new Promise(resolve => setTimeout(resolve, 50));
		}
		throw new Error('Timed out: ' + code + '\n' + errors.join('\n'));
	}
	try {
		await window.loadURL(process.env.CROQUJS_TEST_URL);
		await waitFor('!!document.querySelector(".CodeMirror") && document.title.includes(" — Croqujs")');
		assert.equal(await evaluate('typeof window.ipc'), 'undefined');
		assert.equal(await evaluate('[...document.styleSheets].some(sheet => sheet.href?.endsWith("/croq-mirror.min.css"))'), true);
		assert.equal(await evaluate('location.href'), process.env.CROQUJS_TEST_URL);
		assert.equal(await evaluate('(async () => { const images = [...document.querySelectorAll("img")]; await Promise.all(images.map(image => image.decode())); return images.length > 0 && images.every(image => image.naturalWidth > 0); })()'), true);
		assert.equal(await evaluate('[...document.querySelectorAll(".toolbar img, .side-menu img")].every(image => image.src.startsWith("data:image/svg+xml"))'), true);
		assert.equal(await evaluate('getComputedStyle(document.querySelector(".toolbar")).height'), '40px');
		assert.equal(await evaluate('document.querySelector("[data-cmd=showAbout]").textContent.includes("%VERSION")'), false);
		assert.equal(await evaluate('(async () => (await document.fonts.load("16px Inconsolata")).some(font => font.status === "loaded"))()'), true);
		await evaluate('document.querySelector(".CodeMirror textarea").focus()');
		// Edit through the editor model because the test window is intentionally hidden.
		await evaluate(`document.querySelector('.CodeMirror').CodeMirror.replaceRange('const webExample = 42;', { line: 0, ch: 0 }, undefined, '+input')`);
		await waitFor('document.querySelector(".CodeMirror-code").textContent.includes("webExample")');
		await evaluate('document.querySelector(".toolbar [data-cmd=save]").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))');
		await waitFor('!!document.querySelector("dialog")');
		assert.equal(await evaluate('document.querySelector("dialog [data-action=file]").disabled'), true);
		await evaluate('document.querySelector("dialog [data-action=cancel]").click()');
		await waitFor('!document.querySelector("dialog")');
		assert.equal(await evaluate('document.querySelector(".CodeMirror-code").textContent.includes("webExample")'), true);
		await evaluate('document.querySelector("[data-cmd=new]").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))');
		await waitFor('!!document.querySelector(".swal2-confirm")');
		await evaluate('document.querySelector(".swal2-confirm").click()');
		await waitFor('!document.querySelector(".CodeMirror-code").textContent.includes("webExample")');
		const runHidden = async value => {
			await evaluate(`document.querySelector('.CodeMirror').CodeMirror.setValue('window.result = ${value}; console.log("hidden-${value}");')`);
			await evaluate('document.querySelector("[data-cmd=runWithoutWindow]").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))');
			await waitFor(`document.querySelector('iframe[data-croqujs-execution]')?.contentWindow?.result === ${value}`);
			await waitFor(`document.querySelector('#output-pane').textContent.includes('hidden-${value}')`);
			assert.equal(await evaluate('document.querySelector("iframe[data-croqujs-execution]").getBoundingClientRect().height'), 0);
		};
		await runHidden(40);
		assert.equal(BrowserWindow.getAllWindows().length, 1);
		const hiddenUrl = await evaluate('document.querySelector("iframe[data-croqujs-execution]").src');
		await runHidden(41);
		assert.equal(await evaluate(`document.querySelector('iframe[data-croqujs-execution]').contentWindow.fetch(${JSON.stringify(hiddenUrl)}).then(response => response.status)`), 404);
		const run = async value => {
			await evaluate(`document.querySelector('.CodeMirror').CodeMirror.setValue('window.result = ${value}; console.log("run-${value}");')`);
			await evaluate('document.querySelector(".toolbar [data-cmd=run]").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))');
		};
		await evaluate(`window.originalOpen = window.open;
			window.open = (...args) => {
				const popup = originalOpen(...args);
				if (args[1]?.startsWith('croqujs-field-')) window.testField = popup;
				return popup;
			}; void 0;`);
		const opened = new Promise(resolve => window.webContents.once('did-create-window', resolve));
		await run(42);
		const field = await opened;
		await waitFor('document.querySelector("iframe")?.contentWindow?.result === 42', field.webContents);
		assert.equal(await evaluate('!!document.querySelector("iframe[data-croqujs-execution]")'), false);
		assert.match(field.webContents.getURL(), /\/field\/#/);
		const firstUrl = await field.webContents.executeJavaScript('window.previousFrame = document.querySelector("iframe"); previousFrame.src');
		assert.match(new URL(firstUrl).pathname, /\/__croqujs_run__\/[0-9a-f-]+\/$/);
		await waitFor('document.querySelector("#output-pane").textContent.includes("run-42")');
		await run(43);
		await waitFor('document.querySelector("iframe")?.contentWindow?.result === 43', field.webContents);
		assert.equal(await field.webContents.executeJavaScript('previousFrame !== document.querySelector("iframe")'), true);
		assert.equal(BrowserWindow.getAllWindows().length, 2);
		assert.equal(await field.webContents.executeJavaScript(`document.querySelector('iframe').contentWindow.fetch(${JSON.stringify(firstUrl)}).then(response => response.status)`), 404);
		await runHidden(45);
		await waitFor('!document.querySelector("iframe")', field.webContents);
		assert.equal(BrowserWindow.getAllWindows().length, 2);
		await evaluate('document.querySelector("[data-cmd=stop]").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))');
		await waitFor('!document.querySelector("iframe[data-croqujs-execution]")');
		await run(43);
		await waitFor('document.querySelector("iframe")?.contentWindow?.result === 43', field.webContents);
		await evaluate(`document.querySelector('.CodeMirror').CodeMirror.setValue('throw new Error("web-error");')`);
		await evaluate('document.querySelector(".toolbar [data-cmd=run]").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))');
		await waitFor('document.querySelector("#output-pane").textContent.includes("web-error")');
		await evaluate('document.querySelector("[data-cmd=stop]").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))');
		await waitFor('!document.querySelector("iframe")', field.webContents);
		assert.equal(field.isDestroyed(), false);
		await waitFor('(async () => (await caches.keys()).filter(name => name.startsWith("croqujs-execution-v1:")).length === 0)()');
		field.destroy();
		await waitFor('testField.closed');
		const reopened = new Promise(resolve => window.webContents.once('did-create-window', resolve));
		await run(44);
		const nextField = await reopened;
		await waitFor('document.querySelector("iframe")?.contentWindow?.result === 44', nextField.webContents);
		nextField.destroy();
		// Replace only native picker UI; use real directory/file handles and worker reads.
		await evaluate(`(async () => {
			const storage = await navigator.storage.getDirectory();
			window.projectRoots = [];
			window.projectScripts = [];
			for (const value of [101, 202]) {
				const root = await storage.getDirectoryHandle('project-' + value, { create: true });
				const test = await root.getDirectoryHandle('test', { create: true });
				for (const [directory, name, code] of [[root, 'support.js', 'window.libraryReady = true;'], [test, 'local.js', 'window.localReady = true;']]) {
					const dependency = await (await directory.getFileHandle(name, { create: true })).createWritable();
					await dependency.write(code);
					await dependency.close();
				}
				const script = await test.getFileHandle('main.js', { create: true });
				let writer = await script.createWritable();
				await writer.write('// @need ../support ./local\\nfetch("../data.json").then(r => r.json()).then(data => { if (!window.libraryReady || !window.localReady) throw new Error("Dependency missing"); window.result = data.value; });');
				await writer.close();
				writer = await (await root.getFileHandle('data.json', { create: true })).createWritable();
				await writer.write(JSON.stringify({ value }));
				await writer.close();
				projectRoots.push(root);
				projectScripts.push(script);
			}
			window.rootChoice = 0;
			window.scriptChoice = 0;
			window.cancelPicker = false;
			window.showDirectoryPicker = async options => {
				if (options.mode !== 'read') throw new Error('Expected read-only root access');
				if (cancelPicker) throw new DOMException('Cancelled', 'AbortError');
				return projectRoots[rootChoice];
			};
			window.showOpenFilePicker = async options => {
				if (!options.startIn) throw new Error('Expected root as picker starting directory');
				if (cancelPicker) throw new DOMException('Cancelled', 'AbortError');
				return [projectScripts[scriptChoice]];
			};
		})()`);
		const openDialog = async () => {
			await evaluate('document.querySelector("[data-cmd=open]").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))');
			await waitFor('!!document.querySelector("dialog[open], .swal2-confirm")');
			if (await evaluate('!!document.querySelector(".swal2-confirm")')) await evaluate('document.querySelector(".swal2-confirm").click()');
			await waitFor('!!document.querySelector("dialog[open]")');
		};
		const choose = action => evaluate(`document.querySelector('dialog [data-action="${action}"]').click()`);
		await openDialog();
		assert.equal(await evaluate('document.querySelector("dialog [data-action=file]").disabled'), true);
		await evaluate('window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", ctrlKey: true, metaKey: true, bubbles: true }))');
		assert.equal(await evaluate('!!document.querySelector(".swal2-popup")'), false);
		await choose('cancel');
		await waitFor('!document.querySelector("dialog")');
		assert.equal(await evaluate('document.querySelector(".CodeMirror-code").textContent.includes("run-44")'), true);
		await openDialog();
		await choose('root');
		await waitFor('!document.querySelector("dialog [data-action=file]").disabled');
		await evaluate('scriptChoice = 1');
		await choose('file');
		await waitFor('!!document.querySelector("dialog [role=alert]").textContent');
		assert.equal(await evaluate('document.querySelector("dialog [data-action=open]").disabled'), true);
		await evaluate('scriptChoice = 0');
		await choose('file');
		await waitFor('!document.querySelector("dialog [data-action=open]").disabled');
		await evaluate('cancelPicker = true');
		await choose('root');
		await waitFor('!document.querySelector("dialog [data-action=open]").disabled');
		assert.equal(await evaluate('document.querySelector("dialog [data-value=file]").textContent'), 'test/main.js');
		await evaluate('cancelPicker = false');
		await evaluate('(async () => (await projectRoots[0].getDirectoryHandle("test")).removeEntry("main.js"))()');
		await choose('open');
		await waitFor('!!document.querySelector("dialog [role=alert]").textContent');
		assert.equal(await evaluate('document.querySelector(".CodeMirror-code").textContent.includes("run-44")'), true);
		await evaluate(`(async () => {
			const directory = await projectRoots[0].getDirectoryHandle('test');
			projectScripts[0] = await directory.getFileHandle('main.js', { create: true });
			const writer = await projectScripts[0].createWritable();
			await writer.write('// @need ../support ./local\\nfetch("../data.json").then(r => r.json()).then(data => { if (!window.libraryReady || !window.localReady) throw new Error("Dependency missing"); window.result = data.value; });');
			await writer.close();
		})()`);
		await choose('open');
		await waitFor('!document.querySelector("dialog") && document.title.includes("main.js")');
		const projectOpened = new Promise(resolve => window.webContents.once('did-create-window', resolve));
		await evaluate('document.querySelector(".toolbar [data-cmd=run]").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))');
		const projectField = await projectOpened;
		await waitFor('document.querySelector("iframe")?.contentWindow?.result === 101', projectField.webContents);
		assert.match(await projectField.webContents.executeJavaScript('document.querySelector("iframe").src'), /\/test\/#/);
		await openDialog();
		assert.equal(await evaluate('document.querySelector("dialog [data-value=root]").textContent'), 'project-101');
		await choose('file');
		await waitFor('!document.querySelector("dialog [data-action=open]").disabled');
		await evaluate('rootChoice = 1; scriptChoice = 1');
		await choose('root');
		await waitFor('document.querySelector("dialog [data-value=root]").textContent === "project-202"');
		assert.equal(await evaluate('document.querySelector("dialog [data-action=open]").disabled'), true);
		await choose('file');
		await waitFor('!document.querySelector("dialog [data-action=open]").disabled');
		await choose('open');
		await waitFor('!document.querySelector("dialog")');
		await evaluate('document.querySelector(".toolbar [data-cmd=run]").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))');
		await waitFor('document.querySelector("iframe")?.contentWindow?.result === 202', projectField.webContents);
		projectField.destroy();
		// Exercise the browser-only window methods through the existing Study commands.
		await evaluate(`window.fullscreenExits = 0;
			window.originalExitFullscreen = document.exitFullscreen;
			Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.body });
			document.exitFullscreen = async () => { fullscreenExits++; };
			document.querySelector('[data-cmd=tileWin]').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));`);
		await waitFor('fullscreenExits === 1');
		await evaluate('delete document.fullscreenElement; document.exitFullscreen = originalExitFullscreen; void 0');
		if (process.env.CROQUJS_TEST_MODE === 'dev') {
			const translations = await evaluate(`(async () => {
				const { showOpenProjectDialog, showSaveProjectDialog } = await import('/study/ui/project-dialog.js');
				const result = [];
				for (const language of ['ja', 'en']) {
					const res = await (await fetch('/res/lang.' + language + '.json')).json();
					for (const show of [showOpenProjectDialog, showSaveProjectDialog]) {
						const pending = show({ res });
						const dialog = document.querySelector('dialog');
						result.push([dialog.querySelector('h2').textContent, dialog.querySelector('[data-action=cancel]').textContent]);
						dialog.querySelector('[data-action=cancel]').click();
						await pending;
					}
				}
				return result;
			})()`);
			assert.deepEqual(translations, [['スクリプトを開く', 'キャンセル'], ['スクリプトを保存', 'キャンセル'], ['Open script', 'Cancel'], ['Save script', 'Cancel']]);
			const saved = await evaluate(`(async () => {
				const { SessionLocal } = await import('/session/session-local.js');
				const { BrowserFileSystem } = await import('/fs/fs-browser.js');
				const resources = await (await fetch('/res/lang.en.json')).json();
				const makeSession = (id, options) => {
					const session = new SessionLocal(id, options);
					session.setResources(resources);
					return session;
				};
				const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('saving', { create: true });
				const files = new BrowserFileSystem(root);
				await files.makeDirectory('sample');
				await files.writeText('sample/main.js', 'old text');
				await files.writeText('support.js', 'window.support = true;');
				const session = makeSession('saving-test', { files, filePath: 'sample/main.js' });
				session.onStudyModified();
				const save = await session.doSave('function hello() {}');
				const backupNames = await files.listDirectory('sample/.main.backup');
				const backup = await files.readText('sample/.main.backup/' + backupNames[0]);
				const web = await session.doExportAsWebPage('// @need ../support.js\\nfunction hello() {}');
				const html = await files.readText('sample/main.export/index.html');
				const support = await files.readText('sample/main.export/_/support.js');
				const library = await session.doExportAsLibrary('function hello() {}', 'hello', false, JSON.stringify({ fnNames: ['hello'] }));
				const libraryText = await files.readText('sample/hello.lib.js');
				const failed = await session.doExportAsWebPage('// @need missing.js');
				const preserved = await files.readText('sample/main.export/index.html') === html;
				session.onStudyModified();
				const run = await session.doRunWithoutWindow('window.backupRun = true;');
				await session.onStudyErrorOccurred({ msg: 'test error' });
				session.onStudyProgramClosed();
				const backups = await Promise.all((await files.listDirectory('sample/.main.backup')).filter(name => name.endsWith('.js')).map(name => files.readText('sample/.main.backup/' + name)));
				const logs = (await files.listDirectory('sample/.main.backup')).filter(name => name.endsWith('.log'));
				const originalPermission = root.requestPermission.bind(root);
				root.requestPermission = async () => 'denied';
				const denied = await session.doSave('must not be written');
				root.requestPermission = originalPermission;
				const text = await files.readText('sample/main.js');
				const originalDirectoryPicker = window.showDirectoryPicker;
				const originalSavePicker = window.showSaveFilePicker;
				window.showDirectoryPicker = async () => root;
				let destination = await root.getFileHandle('first.js', { create: true });
				window.showSaveFilePicker = async () => destination;
				const button = action => document.querySelector('dialog [data-action="' + action + '"]');
				const fresh = makeSession('untitled-test');
				let pending = fresh.doSave('first');
				await button('root').onclick();
				await button('file').onclick();
				await button('open').onclick();
				if (document.querySelector('dialog')?.open) throw new Error(document.querySelector('dialog [role=alert]').textContent || 'Save did not complete');
				const untitled = await pending;
				const secondRoot = await (await navigator.storage.getDirectory()).getDirectoryHandle('saving-second', { create: true });
				const secondFiles = new BrowserFileSystem(secondRoot);
				window.showDirectoryPicker = async () => secondRoot;
				destination = await secondRoot.getFileHandle('copy.js', { create: true });
				pending = fresh.doSaveCopy('copied');
				const fixedRoot = button('root').disabled;
				await button('root').onclick();
				await button('file').onclick();
				await button('open').onclick();
				if (document.querySelector('dialog')?.open) throw new Error(document.querySelector('dialog [role=alert]').textContent || 'Save did not complete');
				const copy = await pending;
				await fresh.doSave('updated original');
				const originalText = await files.readText('first.js');
				const copyText = await secondFiles.readText('copy.js');
				pending = fresh.doSaveAs('renamed');
				destination = await (await navigator.storage.getDirectory()).getFileHandle('outside-save.js', { create: true });
				await button('file').onclick();
				const outsideRejected = !!document.querySelector('dialog [role=alert]').textContent && button('open').disabled;
				window.showSaveFilePicker = async () => { throw new DOMException('Cancelled', 'AbortError'); };
				await button('file').onclick();
				button('cancel').click();
				const cancelled = await pending;
				window.showSaveFilePicker = async () => secondRoot.getFileHandle('renamed.js', { create: true });
				pending = fresh.doSaveAs('renamed');
				await button('root').onclick();
				await button('file').onclick();
				await button('open').onclick();
				if (document.querySelector('dialog')?.open) throw new Error(document.querySelector('dialog [role=alert]').textContent || 'Save did not complete');
				const renamed = await pending;
				await fresh.doSave('updated renamed');
				const renamedText = await secondFiles.readText('renamed.js');
				const dropped = makeSession('drop-test');
				const firstHandle = await root.getFileHandle('first.js');
				let captured = false;
				const capturedHandle = dropped.getDroppedFile({ items: [{ kind: 'file', getAsFileSystemHandle() { captured = true; return Promise.resolve(firstHandle); } }] });
				const waitDialog = async () => {
					for (let i = 0; i < 100 && !document.querySelector('dialog'); i++) await new Promise(resolve => setTimeout(resolve, 10));
					if (!document.querySelector('dialog')) throw new Error('Drop dialog missing');
				};
				pending = dropped.doFileDropped(capturedHandle);
				await waitDialog();
				const droppedName = document.querySelector('dialog [data-value=file]').textContent;
				await button('root').onclick();
				const wrongDropRoot = button('open').disabled && !!document.querySelector('dialog [role=alert]').textContent;
				window.showDirectoryPicker = async () => root;
				await button('root').onclick();
				await button('open').onclick();
				const firstDrop = await pending;
				const directDrop = await dropped.doFileDropped(Promise.resolve(firstHandle));
				pending = dropped.doFileDropped(Promise.resolve(await secondRoot.getFileHandle('renamed.js')));
				await waitDialog();
				button('cancel').click();
				await pending;
				const afterDropCancel = await dropped.doSave('after drop cancel');
				pending = dropped.doFileDropped(Promise.resolve(secondRoot));
				await waitDialog();
				const folderRoot = document.querySelector('dialog [data-value=root]').textContent;
				const oldOpenPicker = window.showOpenFilePicker;
				window.showOpenFilePicker = async () => [await secondRoot.getFileHandle('renamed.js')];
				await button('file').onclick();
				await button('open').onclick();
				const folderDrop = await pending;
				window.showOpenFilePicker = oldOpenPicker;
				window.showDirectoryPicker = originalDirectoryPicker;
				window.showSaveFilePicker = originalSavePicker;
				return { save, backup, web, html, support, library, libraryText, failed, preserved, logs, denied, text, untitled, run, backups, fixedRoot, copy, originalText, copyText, outsideRejected, cancelled, renamed, renamedText, captured, droppedName, wrongDropRoot, firstDrop, directDrop, afterDropCancel, folderRoot, folderDrop };
			})()`);
			assert.equal(saved.save[0], 'path');
			assert.equal(saved.save[1][0], 'sample/main.js');
			assert.equal(saved.backup, 'old text');
			assert.equal(saved.web[0], 'success_export');
			assert.doesNotMatch(saved.html, /injection\.js/);
			assert.equal(saved.support, 'window.support = true;');
			assert.equal(saved.library[0], 'success_export');
			assert.match(saved.libraryText, /hello/);
			assert.equal(saved.failed[0], 'alert_error');
			assert.equal(saved.preserved, true);
			assert.equal(saved.logs.length, 1);
			assert.equal(saved.run[0], 'nop');
			assert.ok(saved.backups.includes('window.backupRun = true;'));
			assert.equal(saved.denied[0], 'alert_error');
			assert.equal(saved.text, 'function hello() {}');
			assert.equal(saved.untitled[0], 'path');
			assert.equal(saved.untitled[1][0], 'first.js');
			assert.equal(saved.fixedRoot, false);
			assert.equal(saved.copy[0], 'nop');
			assert.equal(saved.originalText, 'updated original');
			assert.equal(saved.copyText, 'copied');
			assert.equal(saved.outsideRejected, true);
			assert.equal(saved.cancelled[0], 'nop');
			assert.equal(saved.renamed[1][0], 'renamed.js');
			assert.equal(saved.renamedText, 'updated renamed');
			assert.equal(saved.captured, true);
			assert.equal(saved.droppedName, 'first.js');
			assert.equal(saved.wrongDropRoot, true);
			assert.equal(saved.firstDrop[1][0], 'first.js');
			assert.equal(saved.directDrop[1][0], 'first.js');
			assert.equal(saved.afterDropCancel[1][0], 'first.js');
			assert.equal(saved.folderRoot, 'saving-second');
			assert.equal(saved.folderDrop[1][0], 'renamed.js');
			const result = await evaluate(`(async () => {
				const { SessionLocal } = await import('/session/session-local.js');
				window.beforeCloseHandler = window.onbeforeunload;
				return new SessionLocal('close-test').doClose();
			})()`);
			assert.equal(result[0], 'alert_error');
			assert.match(result[1], /ブラウザ|browser controls/);
			assert.equal(await evaluate('window.onbeforeunload === beforeCloseHandler'), true);
			assert.equal(await evaluate('document.querySelector(".CodeMirror-code").textContent.includes("libraryReady")'), true);
			const childOpened = new Promise(resolve => window.webContents.once('did-create-window', resolve));
			await evaluate('window.open(location.href, "closable-study"); void 0');
			const childStudy = await childOpened;
			await waitFor('!!document.querySelector(".CodeMirror") && document.title.includes(" — Croqujs")', childStudy.webContents);
			const childClosed = new Promise(resolve => childStudy.once('closed', resolve));
			await childStudy.webContents.executeJavaScript(`import('/session/session-local.js').then(({ SessionLocal }) => { new SessionLocal('close-test-child').doClose(); }); void 0`);
			await childClosed;
		}
		assert.deepEqual(errors, []);
	} finally {
		for (const view of BrowserWindow.getAllWindows()) view.destroy();
	}
}

if (process.versions.electron) {
	const { app } = require('electron');
	app.commandLine.appendSwitch('disable-gpu');
	app.whenReady().then(checkRenderer).then(() => app.exit(0), error => {
		console.error(error);
		app.exit(1);
	});
} else {
	for (const mode of ['dev', 'preview', 'subdirectory']) {
		test('web Study initializes and edits without IPC through Vite ' + mode, async () => {
			const { createServer, preview } = await import('vite');
			const options = { host: '127.0.0.1', port: 0, open: false };
			const config = { configFile: path.resolve(__dirname, '../vite.config.mjs'), mode: 'web', ...(mode === 'subdirectory' ? { base: '/hoge/' } : {}) };
			const server = mode === 'dev' ? await createServer({ ...config, server: options }) : await preview({ ...config, preview: options });
			if (mode === 'dev') await server.listen();
			try {
				const env = { ...process.env, CROQUJS_TEST_MODE: mode, CROQUJS_TEST_URL: server.resolvedUrls.local[0] };
				delete env.ELECTRON_RUN_AS_NODE;
				await new Promise((resolve, reject) => {
					const child = spawn(require('electron'), [__filename], { env, windowsHide: true, stdio: 'pipe' });
					let output = '';
					child.stdout.on('data', data => { output += data; });
					child.stderr.on('data', data => { output += data; });
					const timer = setTimeout(() => { child.kill(); reject(new Error('Browser test timed out\n' + output)); }, 30000);
					child.on('error', error => { clearTimeout(timer); reject(error); });
					child.on('exit', code => { clearTimeout(timer); if (code === 0) { if (output.trim()) console.log(output.trim()); resolve(); } else reject(new Error(output)); });
				});
			} finally {
				if (mode === 'dev') await server.close();
				else await new Promise(resolve => server.httpServer.close(resolve));
			}
		});
	}
}
