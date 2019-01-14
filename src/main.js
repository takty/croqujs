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
const require_ = (path) => { let r; return () => { return r || (r = require(path)); }; }

const FS      = require_('fs');
const PATH    = require_('path');
const PROCESS = require_('process');
const Config  = require('./lib/config.js');
const Twin    = require('./twin.js');


class Main {

	constructor() {
		this._twins = [];
		this._focusedTwin = null;
		let path = this._getArgPath();

		this._conf = new Config(PATH().join(__dirname, '../'));
		this._conf.loadSync();
		app.setName('Croqujs');  // for Mac
		app.on('activate', () => { if (this._twins.length === 0) this._createNewWindow(); });  // for Mac
		app.on('will-finish-launching', () => {  // for Mac
			app.on('open-file', (ev, p) => {
				ev.preventDefault();
				path = this._checkArgPath(p);
			});
		});
		app.on('ready', () => {
			this._createNewWindow(path);
			globalShortcut.register('CmdOrCtrl+F12',       () => { this._focusedTwin.toggleFieldDevTools(); });
			globalShortcut.register('CmdOrCtrl+Shift+F12', () => { this._focusedTwin.toggleStudyDevTools(); });
		});
		app.on('browser-window-focus', (ev, win) => { this._focusedTwin = this._twins.find(t => t.isOwnerOf(win)); });
		app.on('window-all-closed', () => {
			this._conf.saveSync();
			globalShortcut.unregisterAll();
			app.quit();
		});
	}

	_getArgPath() {
		const argv = PROCESS().argv;
		if (argv.length === 1) return null;
		return this._checkArgPath(argv[argv.length - 1]);
	}

	_checkArgPath(path) {
		try {
			if (!FS().existsSync(path)) return null;
			if (FS().statSync(path).isDirectory()) return null;
		} catch (e) {
			return null;
		}
		return path;
	}

	_createNewWindow(path = null) {
		new Twin(this, this._conf, this._twins.length + 1, path);
	}

	onTwinCreated(t) {  // Called By Twin
		this._twins.push(t);
	}

	onTwinDestruct(t) {  // Called By Twin
		this._twins.splice(this._twins.indexOf(t), 1);
	}

}

const main = new Main();
