const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test } = require('node:test');

async function checkRenderer() {
	const { BrowserWindow } = require('electron');
	const window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
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
