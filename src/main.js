/**
 *
 * Main (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-10-04
 *
 */


'use strict';

const VERSION = '2018-10-04';

const { app, Menu, ipcMain, dialog, clipboard } = require('electron');

const FS      = require('fs');
const PATH    = require('path');
const PROCESS = require('process');

const Shortcut   = require('./lib/appshortcut.js');
const Config     = require('./lib/config.js');
const NavMenu    = require('./lib/navmenu.js');
const Twin       = require('./twin.js');

const IS_MAC = (PROCESS.platform === 'darwin');


class Main {

	constructor() {
		this._initializeConfig();
		this._initializeResource();
		this._initializePopupMenu();
		this._initializeGlobalShortcut();

		this._twins = [];
		this._focusedTwin = null;

		app.on('ready', () => { this._createNewWindow(); });
		app.on('activate', () => { if (this._twins.length === 0) this._createNewWindow(); });
		app.on('browser-window-focus', (ev, win) => { this._onBrowserWindowFocus(ev, win); });
		app.on('window-all-closed', () => {
			this._conf.saveSync();
			if (IS_MAC) {
				Menu.setApplicationMenu(this._createNoWindowNav().menu());
			} else {
				app.quit();
			}
		});
		ipcMain.on('onClipboardChanged', () => { this._reflectClipboardState(); });
	}

	_initializeConfig() {
		this._conf = new Config(PATH.join(__dirname, '../'));
		this._conf.loadSync({
			softWrap: false,
			fontSetIdx: 0,
			lineHeightIdx: 2,
			fontSize: 16,
			isLineNumberByFunctionEnabled: false,
			languageIdx: 1/*ja*/,
			autoBackup: true,
		});
		ipcMain.on('getConfig', (ev, message) => { ev.returnValue = this._conf.getAll(); });
	}

	_initializeResource() {
		const lang = this._conf.get('languageIdx') === 0 ? 'en' : 'ja';
		const resFp = PATH.join(__dirname, '../res/lang.' + lang + '.json');
		const conFp = PATH.join(__dirname, '../res/resource.json');

		const resData = JSON.parse(FS.readFileSync(resFp), 'utf-8');
		const conData = JSON.parse(FS.readFileSync(conFp), 'utf-8');
		this._res = Object.assign(resData, conData);

		ipcMain.on('getResource', (ev, message) => { ev.returnValue = this._res; });
	}

	_initializePopupMenu() {
		const rm = this._res.menu;
		const template = [
			{ label: rm.undo, click: this._createEditorCaller('undo'), accelerator: 'CmdOrCtrl+Z' },
			{ label: rm.redo, click: this._createEditorCaller('redo'), accelerator: 'CmdOrCtrl+Shift+Z' },
			{ type: 'separator' },
			{ label: rm.cut, role: 'cut', accelerator: 'CmdOrCtrl+X' },
			{ label: rm.copy, role: 'copy', accelerator: 'CmdOrCtrl+C' },
			{ label: rm.paste, role: 'paste', accelerator: 'CmdOrCtrl+V', id: 'paste' },
			{ label: rm.delete, role: 'delete' },
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
		this._shortcut.add('CmdOrCtrl+=', this._changeFontSizeDelta.bind(this, 2));  // for US Keyboard
		this._shortcut.add('CmdOrCtrl+;', this._changeFontSizeDelta.bind(this, 2));  // for JIS Keyboard
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


	// -------------------------------------------------------------------------


	onTwinCreated(t) {
		this._twins.push(t);
	}

	onTwinDestruct(t) {
		this._twins.splice(this._twins.indexOf(t), 1);
	}

	onStudyFontSizeChanged(t, fontSize) {
		this._conf.set('fontSize', fontSize);
		for (let e of this._twins) {
			if (e !== t) e.callStudyMethod('configUpdated', this._conf.getAll());
		}
	}

	updateTwinSpecificMenuItems(ts, nav) {  // Called By Twin
		nav.menuItem('export').enabled = ts.isFileOpened;
		nav.menuItem('undo').enabled   = ts.canUndo;
		nav.menuItem('redo').enabled   = ts.canRedo;
	}

	_reflectClipboardState() {  // Called By This and Study on Event
		const f = (clipboard.availableFormats().indexOf('text/plain') !== -1);
		const text = f ? clipboard.readText('text/plain') : '';

		for (let t of this._twins) {
			t.nav().menuItem('paste').enabled = 0 < text.length;
			t.callStudyMethod('reflectClipboardState', text);
		}
	}


	// -------------------------------------------------------------------------


	_createNewWindow() {
		if (this._focusedTwin && !this._focusedTwin._isEnabled) return;
		if (this._twins.length === 0) {
			new Twin(this, this._res, this._conf, this._createNav());
		} else {
			new Twin(this, this._res, this._conf, this._createNav(), this._focusedTwin);
		}
	}

	_changeLanguage(langIdx) {
		if (!this._focusedTwin._isEnabled) return;
		this._conf.set('languageIdx', langIdx);
		dialog.showMessageBox({ type: 'info', buttons: [], message: this._res.msg.alertNextTime });
	}

	_changeFontSizeDelta(delta) {
		if (!this._focusedTwin._isEnabled) return;
		let size = this._conf.get('fontSize');
		size = Math.min(64, Math.max(10, size + delta));
		this._createConfigSetter('fontSize', size)();
	}

	_showAboutDialog() {
		if (!this._focusedTwin._isEnabled) return;
		const fp = PATH.join(__dirname, '../res/about.txt');
		const text = FS.readFileSync(fp, 'utf8');
		dialog.showMessageBox({ type: 'info', title: this._res.menu.about, buttons: [], message: 'Croqujs 4', detail: text });
	}


	// -------------------------------------------------------------------------


	_createNav() {
		const rm = this._res.menu;
		const languageIdx   = this._conf.get('languageIdx');
		const fontSetIdx    = this._conf.get('fontSetIdx');
		const lineHeightIdx = this._conf.get('lineHeightIdx');

		const fileMenu = [
			{ label: rm.newWindow, accelerator: 'CmdOrCtrl+Shift+N', click: this._createNewWindow.bind(this) },
			{ type: 'separator' },
			{ label: rm.new, accelerator: 'CmdOrCtrl+N', click: this._createTwinCaller('new') },
			{ label: rm.open, accelerator: 'CmdOrCtrl+O', click: this._createTwinCaller('open') },
			{ type: 'separator' },
			{ label: rm.save, accelerator: 'CmdOrCtrl+S', click: this._createTwinCaller('save') },
			{ label: rm.saveAs, accelerator: 'CmdOrCtrl+Shift+S', click: this._createTwinCaller('saveAs') },
			{ label: rm.saveVersion, accelerator: 'CmdOrCtrl+Alt+S', click: this._createTwinCaller('saveVersion') },
			{ type: 'separator' },
			{
				label: rm.export, id: 'export', type: 'submenu', submenu: [
					{ label: rm.asLibrary, click: this._createTwinCaller('exportAsLibrary') },
					{ label: rm.asWebPage, click: this._createTwinCaller('exportAsWebPage') },
				]
			},
			{ type: 'separator' },
			{
				label: rm.language, submenu: [
					{ type: 'radio', label: rm.english, click: this._changeLanguage.bind(this, 0), checked: languageIdx === 0 },
					{ type: 'radio', label: rm.japanese, click: this._changeLanguage.bind(this, 1), checked: languageIdx === 1 },
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
			{ label: rm.undo, id: 'undo', click: this._createEditorCaller('undo'), accelerator: 'CmdOrCtrl+Z' },
			{ label: rm.redo, id: 'redo', click: this._createEditorCaller('redo'), accelerator: 'CmdOrCtrl+Shift+Z' },
			{ type: 'separator' },
			{ label: rm.cut, role: 'cut', accelerator: 'CmdOrCtrl+X' },
			{ label: rm.copy, role: 'copy', accelerator: 'CmdOrCtrl+C' },
			{ label: rm.paste, role: 'paste', accelerator: 'CmdOrCtrl+V', id: 'paste' },
			{ label: rm.delete, role: 'delete' },
			{ type: 'separator' },
			{ label: rm.selectAll, click: this._createEditorCaller('selectAll'), accelerator: 'CmdOrCtrl+A' },
			{ type: 'separator' },
			{ label: rm.toggleComment, click: this._createEditorCaller('toggleComment'), accelerator: 'CmdOrCtrl+/' },
			{ label: rm.format, click: this._createEditorCaller('format'), accelerator: 'CmdOrCtrl+B' },
			{ type: 'separator' },
			{ label: rm.find, click: this._createEditorCaller('find'), accelerator: 'CmdOrCtrl+F' },
			{ label: rm.findNext, click: this._createEditorCaller('findNext'), accelerator: IS_MAC ? 'Cmd+G' : 'F3' },
			{ label: rm.replace, click: this._createEditorCaller('replace'), accelerator: 'CmdOrCtrl+H' },
			{ type: 'separator' },
			{ label: rm.copyAsImage, click: this._createTwinCaller('copyAsImage') },
		];
		const codeMenu = [
			{ label: rm.run, accelerator: 'CmdOrCtrl+R', click: this._createTwinCaller('run') },
			{ label: rm.runInFullScreen, accelerator: 'CmdOrCtrl+Alt+R', click: this._createTwinCaller('runInFullScreen') },
			{ label: rm.stop, accelerator: 'CmdOrCtrl+T', click: this._createTwinCaller('stop') },
			{ type: 'separator' },
			{ label: rm.runSelection, click: this._createTwinCaller('runSelection') },
			{ type: 'separator' },
			{ label: rm.runWithoutWindow, accelerator: 'CmdOrCtrl+Shift+R', click: this._createTwinCaller('runWithoutWindow') },
		];
		const viewMenu = [
			{ label: rm.tileWinH, click: this._createTwinCaller('tile') },
			{ type: 'separator' },
			{ type: 'checkbox', label: rm.softWrap, click: this._createConfigMenuSetter('softWrap'), checked: this._conf.get('softWrap') },
			{
				label: rm.font, submenu: [
					{ type: 'radio', label: rm.monospace, click: this._createConfigSetter('fontSetIdx', 0), checked: fontSetIdx === 0 },
					{ type: 'radio', label: rm.sansSerif, click: this._createConfigSetter('fontSetIdx', 1), checked: fontSetIdx === 1 },
					{ type: 'radio', label: rm.serif, click: this._createConfigSetter('fontSetIdx', 2), checked: fontSetIdx === 2 },
				]
			},
			{
				label: rm.lineHeight, submenu: [
					{ type: 'radio', label: rm.veryNarrow, click: this._createConfigSetter('lineHeightIdx', 0), checked: lineHeightIdx === 0 },
					{ type: 'radio', label: rm.narrow, click: this._createConfigSetter('lineHeightIdx', 1), checked: lineHeightIdx === 1 },
					{ type: 'radio', label: rm.normal, click: this._createConfigSetter('lineHeightIdx', 2), checked: lineHeightIdx === 2 },
					{ type: 'radio', label: rm.wide, click: this._createConfigSetter('lineHeightIdx', 3), checked: lineHeightIdx === 3 },
					{ type: 'radio', label: rm.veryWide, click: this._createConfigSetter('lineHeightIdx', 4), checked: lineHeightIdx === 4 },
				]
			},
			{ type: 'separator' },
			{ label: rm.zoomIn, accelerator: 'CmdOrCtrl+Plus', click: this._changeFontSizeDelta.bind(this, 2) },
			{ label: rm.zoomOut, accelerator: 'CmdOrCtrl+-', click: this._changeFontSizeDelta.bind(this, -2) },
			{ label: rm.zoomReset, accelerator: 'CmdOrCtrl+0', click: this._createConfigSetter('fontSize', 16) },
			{ type: 'separator' },
			{ type: 'checkbox', label: rm.showLineNumberByFunction, click: this._createConfigMenuSetter('isLineNumberByFunctionEnabled'), checked: this._conf.get('isLineNumberByFunctionEnabled') },
			{ label: rm.toggleOutputPane, accelerator: 'CmdOrCtrl+L', click: this._createStudyCaller('toggleOutputPane') },
			{ label: '', accelerator: 'F12', click: this._createTwinCaller('toggleDevTools'), visible: false },
			{ label: '', accelerator: 'CmdOrCtrl+F12', click: this._createTwinCaller('toggleFieldDevTools'), visible: false },
			{ label: '', accelerator: 'CmdOrCtrl+Shift+F12', click: this._createTwinCaller('toggleStudyDevTools'), visible: false },
		];
		const helpMenu = [
			{ label: 'Version ' + VERSION, enabled: false },
			{ label: rm.about, click: () => { this._showAboutDialog(); } }
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

	_createNoWindowNav() {  // Called By This
		const rm = this._res.menu;
		const languageIdx = this._conf.get('languageIdx');

		const appMenu = [
			{ label: rm.about },
			{ label: rm.exit, accelerator: 'Cmd+Q', role: 'quit' },
		];
		const fileMenu = [
			{ label: rm.newWindow, accelerator: 'CmdOrCtrl+Shift+N', click: this._createNewWindow.bind(this) },
			{ type: 'separator' },
			{
				label: rm.language, submenu: [
					{ type: 'radio', label: rm.english, click: this._changeLanguage.bind(this, 0), checked: languageIdx === 0 },
					{ type: 'radio', label: rm.japanese, click: this._changeLanguage.bind(this, 1), checked: languageIdx === 1 },
				]
			},
		];
		const helpMenu = [
			{ label: 'Version ' + VERSION, enabled: false },
			{ label: rm.about, click: () => { this._showAboutDialog(); } }
		];
		const bar = [
			{ label: this._res.appTitle, submenu: appMenu },
			{ label: rm.file, submenu: fileMenu },
			{ label: rm.help, submenu: helpMenu },
		];
		return new NavMenu(bar);
	}


	// -------------------------------------------------------------------------


	_createConfigSetter(cmd, val) {
		return () => {
			if (!this._focusedTwin._isEnabled) return;
			this._conf.set(cmd, val);
			for (let e of this._twins) {
				e.callStudyMethod('configUpdated', this._conf.getAll());
			}
		};
	}

	_createConfigMenuSetter(cmd) {
		return (menuItem) => {
			if (!this._focusedTwin._isEnabled) return;
			this._conf.set(cmd, menuItem.checked);
			for (let e of this._twins) {
				e.callStudyMethod('configUpdated', this._conf.getAll());
			}
		};
	}

	_createTwinCaller(method) {
		return () => { if (this._focusedTwin._isEnabled) this._focusedTwin[method](); }
	}

	_createEditorCaller(method) {
		return () => { if (this._focusedTwin._isEnabled) this._focusedTwin.callEditorMethod(method); }
	}

	_createStudyCaller(method) {
		return () => { if (this._focusedTwin._isEnabled) this._focusedTwin.callStudyMethod(method); }
	}

}

const main = new Main();
