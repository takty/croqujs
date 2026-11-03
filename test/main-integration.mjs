import { app } from 'electron';
import { fileURLToPath } from 'node:url';
import '../app/main.js';
import { SessionServer } from '../app/session-server.js';

let initialized = false;
const doReady = SessionServer.prototype.doReady;
SessionServer.prototype.doReady = async function (...args) {
	const result = await doReady.apply(this, args);
	initialized = result[0] === 'init';
	return result;
};

app.setPath('userData', fileURLToPath(new URL('./.profiles/main-integration', import.meta.url)));
app.commandLine.appendSwitch('disable-gpu');
const timeout = setTimeout(() => {
	console.error('Main process did not initialize the editor');
	app.exit(1);
}, 15000);

app.on('browser-window-created', (_event, window) => {
	window.webContents.on('console-message', (event) => {
		if (event.level === 'error') console.error(event.message);
	});
	window.webContents.once('did-finish-load', async () => {
		try {
			for (let i = 0; i < 100; i++) {
				const ready = await window.webContents.executeJavaScript('!!window.ipc && !!document.querySelector(".CodeMirror")');
				if (ready && initialized) {
					console.log('PASS: ESM main entry initializes the editor through preload and IPC');
					clearTimeout(timeout);
					app.exit(0);
					return;
				}
				await new Promise(resolve => setTimeout(resolve, 50));
			}
			throw new Error('Editor did not finish initialization: ' + JSON.stringify(await window.webContents.executeJavaScript('({ url: location.href, ipc: !!window.ipc, editor: !!document.querySelector(".CodeMirror"), buttons: document.querySelectorAll("button").length })')) + ', visible=' + window.isVisible());
		} catch (error) {
			console.error(error);
			app.exit(1);
		}
	});
});
