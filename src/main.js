/**
 *
 * Main (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-11-27
 *
 */


'use strict';

const { app, Menu } = require('electron');

const PATH    = require('path');
const PROCESS = require('process');
const Config  = require('./lib/config.js');
const Twin    = require('./twin.js');

const IS_MAC = (PROCESS.platform === 'darwin');


class Main {

	constructor() {
		this._conf = new Config(PATH.join(__dirname, '../'));
		this._conf.loadSync();

		this._twins = [];
		this._focusedTwin = null;

		app.setName('Croqujs');  // for Mac
		app.on('ready', () => { this._createNewWindow(); });
		app.on('activate', () => { if (this._twins.length === 0) this._createNewWindow(); });
		app.on('window-all-closed', () => {
			this._conf.saveSync();
			app.quit();
		});
		app.on('browser-window-focus', (ev, win) => {
			if (IS_MAC && this._twins.length === 0) {
				// Menu.setApplicationMenu(this._createNav());
			} else {
				this._focusedTwin = this._twins.find(t => t.isOwnerOf(win));
				// if (IS_MAC) Menu.setApplicationMenu(this._focusedTwin.menu());
			}
		});
		// if (IS_MAC) Menu.setApplicationMenu(this._createNav());
	}

	_createNewWindow() {
		const t = new Twin(this, this._conf);
		t.setMenu(this._createNav());
	}

	_createNav() {
		return Menu.buildFromTemplate([{ label: 'File', submenu: [
			{ label: 'New Window', accelerator: 'CmdOrCtrl+Shift+N',   click: this._createNewWindow.bind(this) },
			{ label: 'Quit',       accelerator: 'CmdOrCtrl+Q',         role: 'quit' },
			{ label: '',           accelerator: 'CmdOrCtrl+F12',       click: () => { this._focusedTwin['toggleFieldDevTools'](); }, visible: false },
			{ label: '',           accelerator: 'CmdOrCtrl+Shift+F12', click: () => { this._focusedTwin['toggleStudyDevTools'](); }, visible: false },
		] }]);
	}

	onTwinCreated(t) {  // Called By Twin
		this._twins.push(t);
	}

	onTwinDestruct(t) {  // Called By Twin
		this._twins.splice(this._twins.indexOf(t), 1);
	}

}

const main = new Main();
