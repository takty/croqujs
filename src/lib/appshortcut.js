/**
 *
 * AppShortcut (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-04-27
 *
 */


'use strict';

const { app, BrowserWindow, globalShortcut } = require('electron');


class AppShortcut {

	constructor() {
		this._shortcuts = {};
		app.on('browser-window-focus', (e, win) => { 
			this._registerAll();
		});
		app.on('browser-window-blur', (e, win) => {
			this._unregisterAll();
		});
	}
	
	add(accelerator, callback) {
		this._shortcuts[accelerator] = callback;
		if (BrowserWindow.getFocusedWindow()) {
			globalShortcut.register(accelerator, callback);
		}
	}

	remove(accelerator) {
		const callback = this._shortcuts[accelerator];
		if (callback) {
			globalShortcut.unregister(accelerator);
			delete this._shortcuts[accelerator];
		}
	}

	removeAll() {
		this._unregisterAll();
		this._shortcuts = {};
	}

	_registerAll() {
		for (let sc of Object.keys(this._shortcuts)) {
			globalShortcut.register(sc, this._shortcuts[sc]);
		}
	}

	_unregisterAll() {
		for (let sc of Object.keys(this._shortcuts)) {
			globalShortcut.unregister(sc);
		}
	}

}

module.exports = AppShortcut;
