/**
 *
 * Twin (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-11-22
 *
 */


'use strict';

const electron = require('electron');
const {ipcMain, BrowserWindow, dialog, clipboard, nativeImage} = electron;
const FS   = require('fs');
const PATH = require('path');
const OS   = require('os');

const Backup   = require('./lib/backup.js');
const WinState = require('./lib/winstate.js');
const Exporter = require('./exporter.js');


class Twin {

	constructor(main, res, conf) {
		Twin._count += 1;
		this._id   = Twin._count;
		this._main = main;
		this._res  = res;
		this._conf = conf;
		this._nav  = null;

		this._fieldWin       = null;
		this._fieldWinBounds = null;

		this._filePath   = null;
		this._isReadOnly = false;
		this._isModified = false;

		this._backup    = new Backup();
		this._exporter  = new Exporter();
		this._tempDirs  = [];
		this._codeCache = '';

		ipcMain.on('fromRenderer_' + this._id, (ev, msg, ...args) => {
			if (this[msg]) {
				this[msg](...args);
			} else {
				this._main[msg](this, ...args);
			}
		});
		ipcMain.on('fromRendererSync_' + this._id, (ev, msg, ...args) => {
			if (this[msg]) {
				this[msg](ev, ...args);
			} else {
				this._main[msg](this, ...args);
			}
		});

		this._createStudyWindow();
		this._main.onTwinCreated(this);
	}


	// -------------------------------------------------------------------------


	_createStudyWindow() {
		this._studyWin = new BrowserWindow({ 'show': false });
		this._studyWin.loadURL(`file://${__dirname}/renderer_study/study.html#${this._id}`);
		this._studyWin.once('ready-to-show', () => {
			this._initializeDocument();
			this._studyWin.show();
		});
		this._studyWin.on('close', (e) => {
			e.preventDefault();
			this._studyWinState._onClose();
			this.callStudyMethod('executeCommand', 'close');
		});
		if (this._nav) this._studyWin.setMenu(this._nav.menu());
		this._studyWinState = new WinState(this._studyWin, false, prevTwin ? true : false, this._conf);
	}


	// -------------------------------------------------------------------------


	nav() {  // Called By Main
		return this._nav;
	}

	setNav(nav) {  // Called By Main
		this._nav = nav;
		this._studyWin.setMenu(this._nav.menu());
	}

	isOwnerOf(win) {  // Called By Main
		return win === this._studyWin || win === this._fieldWin;
	}

	tileWin() {  // Called By Main
		const d = electron.screen.getPrimaryDisplay();
		const w = 0 | (d.workAreaSize.width / 2), h = d.workAreaSize.height;
		if (this._studyWin.isMaximized()) {
			this._studyWin.unmaximize();
		}
		this._studyWin.setBounds({x: 0, y: 0, width: w, height: h});
		if (this._fieldWin) {
			if (this._fieldWin.isMaximized()) {
				this._fieldWin.unmaximize();
			}
			this._fieldWin.setBounds({x: w, y: 0, width: w, height: h});
		} else {
			this._fieldWinBounds = {x: w, y: 0, width: w, height: h};
		}
	}

	callStudyMethod(method, ...args) {
		this._studyWin.webContents.send('callStudyMethod', method, ...args);
	}


	// -------------------------------------------------------------------------


	onStudyModified() {
		this._isModified = true;
	}

	onStudyTitleChanged(title) {
		this._studyWin.setTitle(title);
	}

	onStudyRequestPageCapture(ev, bcr) {
		if (this._studyWin === null) return;  // When window is closed while capturing
		this._studyWin.capturePage(bcr, (ni) => { ev.returnValue = ni.toDataURL(); });
	}

	onStudyCapturedImageCreated(dataUrl) {
		const ni = nativeImage.createFromDataURL(dataUrl);
		clipboard.writeImage(ni);
		setTimeout(() => { this.callStudyMethod('showAlert', this._res.msg.copiedAsImage, 'success'); }, 0);
	}

	onStudyErrorOccurred(info) {
		this._backup.backupErrorLog(info, this._codeCache);
	}


	// -------------------------------------------------------------------------


	_ensureWindowTop(win) {
		win.setAlwaysOnTop(true);
		win.setAlwaysOnTop(false);
		win.focus();
	}

	_ensureWindowsFocused(main, sub) {
		sub.setAlwaysOnTop(true);
		main.setAlwaysOnTop(true);
		if (sub.isMinimized()) sub.restore();
		sub.setAlwaysOnTop(false);
		main.setAlwaysOnTop(false);
		main.focus();
	}

	_initializeDocument(text = '', filePath = null) {
		const readOnly = filePath ? ((FS.statSync(filePath).mode & 0x0080) === 0) : false;  // Check Write Flag

		const name     = filePath ? PATH.basename(filePath, PATH.extname(filePath)) : '';
		const baseName = filePath ? PATH.basename(filePath) : '';
		const dirName  = filePath ? PATH.dirname(filePath) : '';
		this.callStudyMethod('initializeDocument', text, filePath, name, baseName, dirName, readOnly);

		this._filePath   = filePath;
		this._isReadOnly = readOnly;
		this._isModified = false;
		this._backup.setFilePath(filePath);

		this.stop();
	}


	// -------------------------------------------------------------------------


	doOpen(defaultPath = this._filePath) {
		const fp = dialog.showOpenDialog(this._studyWin, { defaultPath: defaultPath, filters: this._res.fileFilters });
		if (fp) this._openFile(fp[0]);
	}

	doFileDropped(path) {
		this._droppedFilePath = path;
		let isDir = false;
		try {
			isDir = FS.statSync(this._droppedFilePath).isDirectory();
			if (!isDir) {
				this._openFile(this._droppedFilePath);
				return;
			}
			const fns = FS.readdirSync(this._droppedFilePath);
			const fps = fns.map(e => PATH.join(this._droppedFilePath, e)).filter((fp) => {
				try {
					return FS.statSync(fp).isFile() && /.*\.js$/.test(fp) && !(/.*\.lib\.js$/.test(fp));
				} catch (e) {
					return false;
				}
			});
			if (fps.length === 1) {
				this._openFile(fps[0]);
			} else if (fps.length > 1) {
				this.doOpen(this._droppedFilePath);
			}
		} catch (e) {
			if (e.code !== 'ENOENT' && e.code !== 'EPERM') throw e;
		}
	}

	_openFile(filePath) {
		FS.readFile(filePath, 'utf-8', (error, contents) => {
			if (contents === null) {
				this._outputError('', filePath);
				return;
			}
			this._initializeDocument(contents, filePath);
		});
	}

	doSaveAs(text) {
		const fp = dialog.showSaveDialog(this._studyWin, { defaultPath: this._filePath, filters: this._res.fileFilters });
		if (!fp) return;  // No file is selected.
		let writable = true;
		try {
			writable = ((FS.statSync(fp).mode & 0x0080) !== 0);  // check write flag
		} catch (e) {
			if (e.code !== 'ENOENT') throw e;
		}
		if (writable) {
			this._saveFile(fp, text);
		} else {
			// In Windows, the save dialog itself does not allow to select read only files.
			this._outputError(e, this._filePath);
		}
	}

	doSave(text) {
		if (this._filePath === null || this._isReadOnly) {
			this.doSaveAs(text);
		} else {
			this._saveFile(this._filePath, text);
		}
	}

	_saveFile(fp, text) {
		if (fp.indexOf('.') === -1) fp += this._res.defaultExt;
		this._filePath = fp;
		this._backup.setFilePath(fp);

		this._backup.backupExistingFile(text, this._filePath);
		try {
			FS.writeFileSync(this._filePath, text.replace(/\n/g, '\r\n'));

			const name     = PATH.basename(this._filePath, PATH.extname(this._filePath));
			const baseName = PATH.basename(this._filePath);
			const dirName  = PATH.dirname(this._filePath);
			this.callStudyMethod('setDocumentFilePath', this._filePath, name, baseName, dirName, false);

			this._isModified = false;
		} catch (e) {
			this._outputError(e, this._filePath);
		}
	}

	_outputError(e, dir) {
		let err = e.toString();
		let i = err.indexOf("'");
		if (i === -1) i = err.length;
		err = err.substr(0, i).trim();
		this.callStudyMethod('showAlert', this._res.msg.error + '\n' + dir + '\n' + err, 'error');
	}

	doClose(text) {
		if (this._isModified) this._backup.backupText(text);

		this._main.onTwinDestruct(this);
		this._studyWin.destroy();
		this._studyWin = null;
		if (this._fieldWin) this._fieldWin.close();

		this._clearTempPath();
	}

	doExportAsLibrary(val, text, jsonCodeStructure) {
		const codeStructure = JSON.parse(jsonCodeStructure);
		const name = val.replace(' ', '_').replace('-', '_').replace('+', '_').replace('/', '_').replace('.', '_');
		const expDir = PATH.join(PATH.dirname(this._filePath), name + '.lib.js');

		try {
			this._exporter.exportAsLibrary(text, expDir, name.toUpperCase(), codeStructure);
			this.callStudyMethod('showAlert', this._res.msg.exportedAsLibrary, 'success');
		} catch (e) {
			this._outputError(e, expDir);
		}
	}

	doExportAsWebPage(text) {
		if (this._filePath === null) return;
		const expDir = this._makeExportPath(this._filePath);
		try {
			this._rmdirSync(expDir);
			FS.mkdirSync(expDir);

			this._exporter.exportAsWebPage(text, this._filePath, expDir);
			this.callStudyMethod('showAlert', this._res.msg.exportedAsWebPage, 'success');
		} catch (e) {
			this._outputError(e, expDir);
		}
	}

	_makeExportPath(fp) {
		const name = PATH.basename(fp, PATH.extname(fp));
		return PATH.join(PATH.dirname(fp), name + '.export');
	}

	_rmdirSync(dirPath) {
		if (!FS.existsSync(dirPath)) return;
		for (let fp of FS.readdirSync(dirPath)) {
			fp = PATH.join(dirPath, fp);
			if (FS.lstatSync(fp).isDirectory()) {
				this._rmdirSync(fp);
			} else {
				FS.unlinkSync(fp);
			}
		}
		FS.rmdirSync(dirPath);
	}


	// -------------------------------------------------------------------------


	stop() {
		if (!this._fieldWin) return;
		this._fieldWin.close();
	}

	doRun(text) {
		if (this._isModified) this._backup.backupText(text);
		this._codeCache = text;

		if (!this._fieldWin) {
			this._createFieldWindow();
			this._fieldWin.once('ready-to-show', () => {
				this._fieldWin.show();
				this._execute(text);
			});
			this._fieldWin.once('show', () => {this._ensureWindowTop(this._studyWin);});
		} else {
			if (!this._fieldWin.isVisible()) this._fieldWin.show();
			this._ensureWindowsFocused(this._studyWin, this._fieldWin);
			this._execute(text);
		}
	}

	doRunWithoutWindow(text) {
		if (this._isModified) this._backup.backupText(text);
		this._codeCache = text;

		if (!this._fieldWin) {
			this._createFieldWindow();
			this._fieldWin.once('ready-to-show', () => {this._execute(text);});
		} else {
			this._fieldWin.hide();
			this._execute(text);
		}
	}

	_execute(codeStr) {
		const ret = this._exporter.readLibrarySources(codeStr, this._filePath);
		if (!Array.isArray(ret)) {
			const info = { msg: ret, import: true, isUserCode: false };
			this._backup.backupErrorLog(info, this._codeCache);
			this.callStudyMethod('addErrorMessage', info);
			return;
		}
		this._clearTempPath();
		const expDir = this._getTempPath();
		try {
			this._rmdirSync(expDir);
			FS.mkdirSync(expDir);
			const expPath = this._exporter.exportAsWebPage(codeStr, this._filePath, expDir, true);
			const baseUrl = 'file:///' + expPath.replace(/\\/g, '/');
			const url = baseUrl + '#' + this._id + ',' + this._exporter._userCodeOffset;
			this.callStudyMethod('openProgram', url);
		} catch (e) {
			this._outputError(e, expDir);
		}
	}

	_getTempPath() {
		const tmpdir = OS.tmpdir();
		const name = 'croqujs-' + Date.now();
		const path = PATH.join(tmpdir, name);
		this._tempDirs.push(path);
		return path;
	}

	_clearTempPath() {
		for (let td of this._tempDirs) this._rmdirSync(td);
		this._tempDirs = [];
	}

	_createFieldWindow() {
		const opt = Object.assign({show: false}, this._fieldWinBounds || {});
		this._fieldWin = new BrowserWindow(opt);
		this._fieldWin.setTitle(this._res.appTitle);
		this._fieldWin.loadURL(`file://${__dirname}/renderer_field/field.html#${this._id}`);
		this._fieldWin.on('closed', () => {this._fieldWin = null;});
		this._fieldWin.setMenu(null);
		this._fieldWinState = new WinState(this._fieldWin, false, this._fieldWinBounds ? true : false, this._conf, 'fieldWindowState');
	}


	// -------------------------------------------------------------------------


	toggleFieldDevTools() {
		if (this._fieldWin) this._fieldWin.webContents.toggleDevTools();
	}

	toggleStudyDevTools() {
		this._studyWin.webContents.toggleDevTools();
	}

}

Twin._count = 0;
module.exports = Twin;
