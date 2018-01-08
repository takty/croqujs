/*
 * Shortcut
 * 2016-08-18
 */

'use strict';

const {app, BrowserWindow, globalShortcut} = require('electron')
const shortcuts = [];

const unregisterAllShortcuts = () => {shortcuts.forEach(sc => globalShortcut.unregister(sc.accelerator));};
const registerAllShortcuts = () => {shortcuts.forEach(sc => globalShortcut.register(sc.accelerator, sc.callback));};

const register = (accelerator, callback) => {
	shortcuts.push({accelerator, callback});
	if (BrowserWindow.getFocusedWindow()) {
		globalShortcut.register(accelerator, callback);
	}
}

const unregister = (accelerator) => {
	const i = indexOf(accelerator);
	if (i !== -1) {
		globalShortcut.unregister(accelerator);
		shortcuts.splice(i, 1);
	}
}

const indexOf = (accelerator) => {
	for (let i = 0, I = shortcuts.length; i < I; i += 1) {
		if (shortcuts[i].accelerator === accelerator) return i;
	}
	return -1;
}

const unregisterAll = () => {
	unregisterAllShortcuts();
	shortcuts.length = 0;
};

app.on('browser-window-focus', (e, win) => {registerAllShortcuts();});
app.on('browser-window-blur', (e, win) => {unregisterAllShortcuts();});

module.exports = {
	register,
	unregister,
	unregisterAll,
};
