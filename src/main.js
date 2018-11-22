/**
 *
 * Main (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-11-22
 *
 */


'use strict';

const { app, Menu, ipcMain, clipboard } = require('electron');

const FS      = require('fs');
const PATH    = require('path');
const PROCESS = require('process');

const Config   = require('./lib/config.js');
const NavMenu  = require('./lib/navmenu.js');
const Twin     = require('./twin.js');

const IS_MAC = (PROCESS.platform === 'darwin');


class Main {

	constructor() {
		this._conf = new Config(PATH.join(__dirname, '../'));
		this._conf.loadSync();
		this._initializeResource();

		this._twins = [];
		this._focusedTwin = null;

		app.on('ready', () => { this._createNewWindow(); });
		app.on('activate', () => { if (this._twins.length === 0) this._createNewWindow(); });
		app.on('window-all-closed', () => {
			this._conf.saveSync();
			if (IS_MAC) Menu.setApplicationMenu(this._createNoWindowNav().menu());
			else app.quit();
		});
		app.on('browser-window-focus', (ev, win) => { this._onBrowserWindowFocus(ev, win); });
		ipcMain.on('onClipboardChanged', () => { this._reflectClipboardState(this._res.menu); });
	}

	_initializeResource() {
		ipcMain.on('getResource', (ev, arg) => {
			const lang = arg;
			const resFp = PATH.join(__dirname, '/res/lang.' + lang + '.json');
			const conFp = PATH.join(__dirname, '/res/resource.json');

			const resData = JSON.parse(FS.readFileSync(resFp), 'utf-8');
			const conData = JSON.parse(FS.readFileSync(conFp), 'utf-8');
			this._res = Object.assign(resData, conData);

			for (let t of this._twins) {
				t._res = this._res;
				t.setNav(this._createNav());
			}
			ev.returnValue = this._res;
		});
	}

	_createNewWindow() {
		if (this._twins.length === 0) {
			new Twin(this, this._res, this._conf);
		} else {
			new Twin(this, this._res, this._conf, this._focusedTwin);
		}
	}

	_onBrowserWindowFocus(ev, win) {
		if (IS_MAC && this._twins.length === 0) {
			Menu.setApplicationMenu(this._createNoWindowNav().menu());
			return;
		}
		this._focusedTwin = this._twins.find(t => t.isOwnerOf(win));
		if (IS_MAC) Menu.setApplicationMenu(this._focusedTwin.nav().menu());
		this._reflectClipboardState();
	}

	_reflectClipboardState() {
		const f = (clipboard.availableFormats().indexOf('text/plain') !== -1);
		const text = f ? clipboard.readText('text/plain') : '';

		for (let t of this._twins) {
			t.callStudyMethod('reflectClipboardState', text);
		}
	}


	// -------------------------------------------------------------------------


	_createNav() {
		const rm = this._res.menu;
		const appMenu = [
			{ label: rm.about },
			{ label: rm.exit, accelerator: 'Cmd+Q', role: 'quit' },
		];
		const fileMenu = [
			{ label: rm.newWindow, accelerator: 'CmdOrCtrl+Shift+N', click: this._createNewWindow.bind(this) },
			{ label: '', accelerator: 'CmdOrCtrl+F12',       click: this._createTwinCaller('toggleFieldDevTools'), visible: false },
			{ label: '', accelerator: 'CmdOrCtrl+Shift+F12', click: this._createTwinCaller('toggleStudyDevTools'), visible: false },
		];
		if (IS_MAC) {
			return new NavMenu([
				{ label: this._res.appTitle, submenu: appMenu },
				{ label: rm.file, submenu: fileMenu },
			]);
		}
		return new NavMenu([{ label: rm.file, submenu: fileMenu }]);
	}

	_createNoWindowNav() {
		const rm = this._res.menu;
		const appMenu = [
			{ label: rm.about },
			{ label: rm.exit, accelerator: 'Cmd+Q', role: 'quit' },
		];
		const fileMenu = [
			{ label: rm.newWindow, accelerator: 'CmdOrCtrl+Shift+N', click: this._createNewWindow.bind(this) },
		];
		return new NavMenu([
			{ label: this._res.appTitle, submenu: appMenu },
			{ label: rm.file, submenu: fileMenu },
		]);
	}

	_createTwinCaller(method) {
		return () => { this._focusedTwin[method](); }
	}


	// -------------------------------------------------------------------------


	onTwinCreated(t) {  // Called By Twin
		this._twins.push(t);
	}

	onTwinDestruct(t) {  // Called By Twin
		this._twins.splice(this._twins.indexOf(t), 1);
	}

}

const main = new Main();
