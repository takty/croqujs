/**
 *
 * Preload
 *
 * @author Takuto Yanagida
 * @version 2020-11-21
 *
 */


const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
	'ipc', {
		send: (ch, ...args) => {
			ipcRenderer.send(ch, ...args);
		},
		invoke: (ch, ...args) => {
			return ipcRenderer.invoke(ch, ...args);
		},
		on: (ch, func) => {
			ipcRenderer.on(ch, (event, ...args) => func(event, ...args));
		}
	}
);
