/**
 * Preload
 *
 * @author Takuto Yanagida
 * @version 2026-08-22
 */

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld(
	'ipc', {
		send: (ch, ...args) => {
			ipcRenderer.send(ch, ...args);
		},
		invoke: (ch, ...args) => {
			return ipcRenderer.invoke(ch, ...args);
		},
		on: (ch, func) => {
			ipcRenderer.on(ch, (_event, ...args) => func(...args));
		},
		getPathForFile: (file) => {
			return webUtils.getPathForFile(file);
		}
	}
);
