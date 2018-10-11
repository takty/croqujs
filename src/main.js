/**
 *
 * Main (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-10-11
 *
 */


'use strict';

const { app, Menu, ipcMain, clipboard } = require('electron');

const FS      = require('fs');
const PATH    = require('path');
const PROCESS = require('process');

const Shortcut = require('./lib/appshortcut.js');
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
			if (IS_MAC) Menu.setApplicationMenu(this._createNoWindowNav(this._res).menu());
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

			this._initializePopupMenu();
			this._initializeGlobalShortcut();

			for (let t of this._twins) {
				t._res = this._res;
				t.setNav(this._createNav(this._res));
			}
			ev.returnValue = this._res;
		});
	}

	_initializePopupMenu() {
		const rm = this._res.menu;
		const template = [
			{ label: rm.undo, click: this._createCommand('undo'), accelerator: 'CmdOrCtrl+Z' },
			{ label: rm.redo, click: this._createCommand('redo'), accelerator: 'CmdOrCtrl+Shift+Z' },
			{ type: 'separator' },
			{ label: rm.cut, role: 'cut', accelerator: 'CmdOrCtrl+X' },
			{ label: rm.copy, role: 'copy', accelerator: 'CmdOrCtrl+C' },
			{ label: rm.paste, role: 'paste', accelerator: 'CmdOrCtrl+V', id: 'paste' },
			{ type: 'separator' },
			{ label: rm.selectAll, role: 'selectall', accelerator: 'CmdOrCtrl+A' },
		];
		const menu = Menu.buildFromTemplate(template);
		app.on('browser-window-created', (event, win) => {
			win.webContents.on('context-menu', (e, ps) => {
				if (this._focusedTwin._isEnabled && ps.isEditable) menu.popup(win, ps.x, ps.y);
			});
		});
	}

	_initializeGlobalShortcut() {
		this._shortcut = new Shortcut();
		this._shortcut.add(IS_MAC ? 'Cmd+Ctrl+F' : 'F11', this._createTwinCaller('toggleFieldWinFullScreen'));
		this._shortcut.add('CmdOrCtrl+T', this._createTwinCaller('stop'));
		this._shortcut.add('CmdOrCtrl+=', this._createCommand('fontSizePlus'));  // for US Keyboard
		this._shortcut.add('CmdOrCtrl+;', this._createCommand('fontSizePlus'));  // for JIS Keyboard
	}

	_createNewWindow() {
		if (this._focusedTwin && !this._focusedTwin._isEnabled) return;
		if (this._twins.length === 0) {
			new Twin(this, this._res, this._conf);
		} else {
			new Twin(this, this._res, this._conf, this._focusedTwin);
		}
	}

	_onBrowserWindowFocus(ev, win) {
		if (IS_MAC && this._twins.length === 0) {
			Menu.setApplicationMenu(this._createNoWindowNav(this._res).menu());
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
			t.nav().menuItem('paste').enabled = 0 < text.length;
			t.callStudyMethod('reflectClipboardState', text);
		}
	}


	// -------------------------------------------------------------------------


	onTwinCreated(t) {  // Called By Twin
		this._twins.push(t);
	}

	onTwinDestruct(t) {  // Called By Twin
		this._twins.splice(this._twins.indexOf(t), 1);
	}

	updateMenuItems(ts, nav) {  // Called By Twin
		nav.menuItem('export').enabled = ts.isFileOpened;
		if (ts.canUndo) nav.menuItem('undo').enabled = ts.canUndo;
		if (ts.canRedo) nav.menuItem('redo').enabled = ts.canRedo;
		if (ts.softWrap) nav.menuItem('softWrap').checked = ts.softWrap;
		if (ts.functionLineNumber) nav.menuItem('functionLineNumber').checked = ts.functionLineNumber;
		if (ts.language) {
			if (ts.language === 'ja') {
				nav.menuItem('setLanguageJa').checked = true;
			} else {
				nav.menuItem('setLanguageEn').checked = true;
			}
		}
	}


	// -------------------------------------------------------------------------


	_createNav(res) {
		const rm = res.menu;
		const fileMenu = [
			{ label: rm.newWindow, accelerator: 'CmdOrCtrl+Shift+N', click: this._createNewWindow.bind(this) },
			{ type: 'separator' },
			{ label: rm.new, accelerator: 'CmdOrCtrl+N', click: this._createCommand('new') },
			{ label: rm.open, accelerator: 'CmdOrCtrl+O', click: this._createCommand('open') },
			{ type: 'separator' },
			{ label: rm.save, accelerator: 'CmdOrCtrl+S', click: this._createCommand('save') },
			{ label: rm.saveAs, accelerator: 'CmdOrCtrl+Shift+S', click: this._createCommand('saveAs') },
			{ type: 'separator' },
			{
				label: rm.export, id: 'export', enabled: false, type: 'submenu', submenu: [
					{ label: rm.asLibrary, click: this._createCommand('exportAsLibrary') },
					{ label: rm.asWebPage, click: this._createCommand('exportAsWebPage') },
				]
			},
			{ type: 'separator' },
			{
				label: rm.language, submenu: [
					{ type: 'radio', label: rm.english, id: 'setLanguageEn', click: this._createCommand('setLanguageEn') },
					{ type: 'radio', label: rm.japanese, id: 'setLanguageJa', click: this._createCommand('setLanguageJa') },
				]
			},
		];
		if (IS_MAC) {
			fileMenu.splice(3, 0,
				{ type: 'separator' },
				{ label: rm.close, accelerator: 'CmdOrCtrl+W', role: 'close' }
			);
		} else {
			fileMenu.push({ type: 'separator' });
			fileMenu.push({ label: rm.exit, accelerator: 'Alt+F4', role: 'close' });
		}
		const editMenu = [
			{ label: rm.undo, id: 'undo', click: this._createCommand('undo'), accelerator: 'CmdOrCtrl+Z' },
			{ label: rm.redo, id: 'redo', click: this._createCommand('redo'), accelerator: 'CmdOrCtrl+Shift+Z' },
			{ type: 'separator' },
			{ label: rm.cut, role: 'cut', accelerator: 'CmdOrCtrl+X' },
			{ label: rm.copy, role: 'copy', accelerator: 'CmdOrCtrl+C' },
			{ label: rm.paste, role: 'paste', accelerator: 'CmdOrCtrl+V', id: 'paste' },
			{ type: 'separator' },
			{ label: rm.selectAll, click: this._createCommand('selectAll'), accelerator: 'CmdOrCtrl+A' },
			{ type: 'separator' },
			{ label: rm.toggleComment, click: this._createCommand('toggleComment'), accelerator: 'CmdOrCtrl+/' },
			{ label: rm.format, click: this._createCommand('format'), accelerator: 'CmdOrCtrl+B' },
			{ type: 'separator' },
			{ label: rm.find, click: this._createCommand('find'), accelerator: 'CmdOrCtrl+F' },
			{ label: rm.findNext, click: this._createCommand('findNext'), accelerator: IS_MAC ? 'Cmd+G' : 'F3' },
			{ label: rm.replace, click: this._createCommand('replace'), accelerator: 'CmdOrCtrl+H' },
			{ type: 'separator' },
			{ label: rm.copyAsImage, click: this._createCommand('copyAsImage') },
		];
		const codeMenu = [
			{ label: rm.run, accelerator: 'CmdOrCtrl+R', click: this._createCommand('run') },
			{ label: rm.runInFullScreen, accelerator: 'CmdOrCtrl+Alt+R', click: this._createCommand('runInFullScreen') },
			{ label: rm.stop, accelerator: 'CmdOrCtrl+T', click: this._createCommand('stop') },
			{ type: 'separator' },
			{ label: rm.runWithoutWindow, accelerator: 'CmdOrCtrl+Shift+R', click: this._createCommand('runWithoutWindow') },
		];
		const viewMenu = [
			{ label: rm.tileWin, click: this._createTwinCaller('tileWin') },
			{ type: 'separator' },
			{ label: rm.zoomIn, accelerator: 'CmdOrCtrl+Plus', click: this._createCommand('fontSizePlus') },
			{ label: rm.zoomOut, accelerator: 'CmdOrCtrl+-', click: this._createCommand('fontSizeMinus') },
			{ label: rm.zoomReset, accelerator: 'CmdOrCtrl+0', click: this._createCommand('fontSizeReset') },
			{ type: 'separator' },
			{ label: rm.lineHeightPlus, click: this._createCommand('lineHeightPlus') },
			{ label: rm.lineHeightMinus, click: this._createCommand('lineHeightMinus') },
			{ label: rm.lineHeightReset, click: this._createCommand('lineHeightReset') },
			{ type: 'separator' },
			{ type: 'checkbox', label: rm.toggleSoftWrap, id: 'softWrap', click: this._createCommand('toggleSoftWrap') },
			{ type: 'checkbox', label: rm.toggleFunctionLineNumber, id: 'functionLineNumber', click: this._createCommand('toggleFunctionLineNumber') },
			{ label: rm.toggleOutputPane, accelerator: 'CmdOrCtrl+L', click: this._createCommand('toggleOutputPane') },
			{ label: '', accelerator: 'F12', click: this._createTwinCaller('toggleDevTools'), visible: false },
			{ label: '', accelerator: 'CmdOrCtrl+F12', click: this._createTwinCaller('toggleFieldDevTools'), visible: false },
			{ label: '', accelerator: 'CmdOrCtrl+Shift+F12', click: this._createTwinCaller('toggleStudyDevTools'), visible: false },
		];
		const helpMenu = [
			{ label: rm.about, click: this._createCommand('showAbout') }
		];
		const bar = [
			{ label: rm.file, submenu: fileMenu },
			{ label: rm.edit, submenu: editMenu },
			{ label: rm.code, submenu: codeMenu },
			{ label: rm.view, submenu: viewMenu },
			{ label: rm.help, submenu: helpMenu },
		];
		if (IS_MAC) {
			const appMenu = [
				{ label: rm.about },
				{ label: rm.exit, accelerator: 'Cmd+Q', role: 'quit' },
			];
			bar.splice(0, 0, { label: this._res.appTitle, submenu: appMenu });
		}
		return new NavMenu(bar);
	}

	_createNoWindowNav(res) {
		const rm = res.menu;
		const appMenu = [
			{ label: rm.about },
			{ label: rm.exit, accelerator: 'Cmd+Q', role: 'quit' },
		];
		const fileMenu = [
			{ label: rm.newWindow, accelerator: 'CmdOrCtrl+Shift+N', click: this._createNewWindow.bind(this) },
			{ type: 'separator' },
			{
				label: rm.language, submenu: [
					{ type: 'radio', label: rm.english, id: 'setLanguageEn', click: this._createCommand('setLanguageEn') },
					{ type: 'radio', label: rm.japanese, id: 'setLanguageJa', click: this._createCommand('setLanguageJa') },
				]
			},
		];
		const helpMenu = [
			{ label: rm.about, click: this._createCommand('showAbout') }
		];
		const bar = [
			{ label: this._res.appTitle, submenu: appMenu },
			{ label: rm.file, submenu: fileMenu },
			{ label: rm.help, submenu: helpMenu },
		];
		return new NavMenu(bar);
	}

	_createTwinCaller(method) {
		return () => { if (this._focusedTwin._isEnabled) this._focusedTwin[method](); }
	}

	_createCommand(cmd) {
		return () => { if (this._focusedTwin._isEnabled) this._focusedTwin.callStudyMethod('executeCommand', cmd); }
	}

}

const main = new Main();
