/**
 *
 * Main (JS)
 *
 * @author Takuto Yanagida
 * @version 2021-02-24
 *
 */


'use strict';

const { app } = require('electron');
const require_ = (path) => { let r; return () => { return r || (r = require(path)); }; }

const FS   = require_('fs');
const PROC = require_('process');
const Twin = require('./twin.js');

require('./auto-updater');


class Main {

	constructor() {
		this._gs      = [];
		this._gId     = 0;
		this._isReady = false;
		this._macPath = null;

		if (!app.requestSingleInstanceLock()) app.quit();

		app.on('activate', () => {  // for Mac
			if (this._gs.length === 0) this._createWindow();
		});
		app.on('will-finish-launching', () => {  // for Mac
			app.on('open-file', (e, p) => {
				e.preventDefault();
				if (this._isReady) this._createWindow(this._checkArgPath(p));
				else this._macPath = this._checkArgPath(p);
			});
		});
		app.on('ready', () => {
			this._createWindow(this._macPath ? this._macPath : this._getArgPath());
			this._macPath = null;
			this._isReady = true;
		});
		app.on('second-instance', (e, argv, workDir) => {
			this._createWindow(this._getArgPath(argv));
		});
		app.on('window-all-closed', () => {
			app.quit();
		});
	}

	_getArgPath(argv = PROC().argv) {
		if (argv.length === 1) return null;
		return this._checkArgPath(argv[argv.length - 1]);
	}

	_checkArgPath(path) {
		try {
			if (!FS().existsSync(path)) return null;
			if (FS().statSync(path).isDirectory()) return null;
		} catch (e) {
			console.error(e);
			return null;
		}
		return path;
	}

	_createWindow(path = null) {
		this._gId += 1;
		const g = new Twin(this._gId, path);
		g._studyWin.on('closed', () => { this._gs.splice(this._gs.indexOf(g), 1); });
		this._gs.push(g);
	}

}

const main = new Main();
