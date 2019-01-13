/**
 *
 * Main (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2019-01-14
 *
 */


'use strict';

const { app, globalShortcut } = require('electron');

const PATH    = require('path');
const PROCESS = require('process');
const Config  = require('./lib/config.js');
const Twin    = require('./twin.js');


class Main {

	constructor() {
		this._twins = [];
		this._focusedTwin = null;

		this._conf = new Config(PATH.join(__dirname, '../'));
		this._conf.loadSync();
		app.setName('Croqujs');  // for Mac
		app.on('ready', () => {
			this._createNewWindow();
			globalShortcut.register('CmdOrCtrl+F12',       () => { this._focusedTwin.toggleFieldDevTools(); });
			globalShortcut.register('CmdOrCtrl+Shift+F12', () => { this._focusedTwin.toggleStudyDevTools(); });
		});
		app.on('activate', () => { if (this._twins.length === 0) this._createNewWindow(); });
		app.on('browser-window-focus', (ev, win) => { this._focusedTwin = this._twins.find(t => t.isOwnerOf(win)); });
		app.on('window-all-closed', () => {
			this._conf.saveSync();
			globalShortcut.unregisterAll();
			app.quit();
		});
	}

	_createNewWindow() {
		new Twin(this, this._conf, this._twins.length + 1);
	}

	onTwinCreated(t) {  // Called By Twin
		this._twins.push(t);
	}

	onTwinDestruct(t) {  // Called By Twin
		this._twins.splice(this._twins.indexOf(t), 1);
	}

}

const main = new Main();
