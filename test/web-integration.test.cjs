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
		assert.equal(await evaluate('getComputedStyle(document.querySelector(".toolbar")).height'), '40px');
		assert.equal(await evaluate('document.querySelector("[data-cmd=showAbout]").textContent.includes("%VERSION")'), false);
		assert.equal(await evaluate('(async () => (await document.fonts.load("16px Inconsolata")).some(font => font.status === "loaded"))()'), true);
		await evaluate('document.querySelector(".CodeMirror textarea").focus()');
		// Edit through the editor model because the test window is intentionally hidden.
		await evaluate(`document.querySelector('.CodeMirror').CodeMirror.replaceRange('const webExample = 42;', { line: 0, ch: 0 }, undefined, '+input')`);
		await waitFor('document.querySelector(".CodeMirror-code").textContent.includes("webExample")');
		await evaluate('document.querySelector(".toolbar [data-cmd=save]").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))');
		await waitFor('!!document.querySelector(".swal2-popup")');
		assert.match(await evaluate('document.querySelector(".swal2-popup").textContent'), /Web版|web version/);
		await evaluate('document.querySelector(".swal2-confirm").click()');
		await waitFor('!document.querySelector(".swal2-popup")');
		assert.equal(await evaluate('document.querySelector(".CodeMirror-code").textContent.includes("webExample")'), true);
		await evaluate('document.querySelector("[data-cmd=new]").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))');
		await waitFor('!!document.querySelector(".swal2-confirm")');
		await evaluate('document.querySelector(".swal2-confirm").click()');
		await waitFor('!document.querySelector(".CodeMirror-code").textContent.includes("webExample")');
		const run = async value => {
			await evaluate(`document.querySelector('.CodeMirror').CodeMirror.setValue('window.result = ${value}; console.log("run-${value}");')`);
			await evaluate('document.querySelector(".toolbar [data-cmd=run]").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))');
		};
		const opened = new Promise(resolve => window.webContents.once('did-create-window', resolve));
		await run(42);
		const field = await opened;
		await waitFor('document.querySelector("iframe")?.contentWindow?.result === 42', field.webContents);
		assert.match(field.webContents.getURL(), /\/field\/#/);
		const firstUrl = await field.webContents.executeJavaScript('window.previousFrame = document.querySelector("iframe"); previousFrame.src');
		assert.match(new URL(firstUrl).pathname, /\/__croqujs_run__\/[0-9a-f-]+\/$/);
		await waitFor('document.querySelector("#output-pane").textContent.includes("run-42")');
		await run(43);
		await waitFor('document.querySelector("iframe")?.contentWindow?.result === 43', field.webContents);
		assert.equal(await field.webContents.executeJavaScript('previousFrame !== document.querySelector("iframe")'), true);
		assert.equal(BrowserWindow.getAllWindows().length, 2);
		assert.equal(await field.webContents.executeJavaScript(`document.querySelector('iframe').contentWindow.fetch(${JSON.stringify(firstUrl)}).then(response => response.status)`), 404);
		await evaluate(`document.querySelector('.CodeMirror').CodeMirror.setValue('throw new Error("web-error");')`);
		await evaluate('document.querySelector(".toolbar [data-cmd=run]").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))');
		await waitFor('document.querySelector("#output-pane").textContent.includes("web-error")');
		await evaluate('document.querySelector("[data-cmd=stop]").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))');
		await waitFor('!document.querySelector("iframe")', field.webContents);
		assert.equal(field.isDestroyed(), false);
		await waitFor('(async () => (await caches.keys()).filter(name => name.startsWith("croqujs-execution-v1:")).length === 0)()');
		field.destroy();
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
				const env = { ...process.env, CROQUJS_TEST_URL: server.resolvedUrls.local[0] };
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
