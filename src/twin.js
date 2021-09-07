/**
 *
 * Twin (JS)
 *
 * @author Takuto Yanagida
 * @version 2021-09-08
 *
 */


'use strict';


const electron = require('electron');
const { ipcMain, BrowserWindow, dialog, clipboard, nativeImage } = electron;
const require_ = (path) => { let r; return () => { return r || (r = require(path)); }; }

const OS       = require_('os');
const FS       = require_('fs');
const PATH     = require_('path');
const Backup   = require('./backup.js');
const Exporter = require('./exporter.js');

const DEFAULT_EXT = '.js';
const FILE_FILTERS = [
	{ name: 'JavaScript', extensions: ['js'] },
	{ name: 'All Files', extensions: ['*'] }
];


class Twin {

	constructor(id, path) {
		this._id       = id;
		this._studyWin = null;
		this._fieldWin = null;

		if (path) this._initPath = path;

		this._filePath   = null;
		this._isReadOnly = false;
		this._isModified = false;

		this._backup    = new Backup();
		this._exporter  = new Exporter();
		this._tempDirs  = [];
		this._codeCache = '';

		ipcMain.on('notifyServer_' + this._id, (ev, msg, ...args) => { this[msg](...args); });
		ipcMain.handle('callServer_' + this._id, (ev, msg, ...args) => {
			try {
				return this[msg](...args);
			} catch (e) {
				console.error(e);
			}
		});

		this._createStudyWindow();
		// this._studyWin.show();
		// this._studyWin.webContents.toggleDevTools();
	}

	_createStudyWindow() {
		this._studyWin = new BrowserWindow({ show: false, webPreferences: { nativeWindowOpen: true, contextIsolation: true, nodeIntegration: false, preload: `${__dirname}/study/preload.js` } });
		this._studyWin.loadURL(`file://${__dirname}/study/study.html#${this._id}`);
		this._studyWin.setMenu(null);
		this._studyWin.on('close', (e) => {
			e.preventDefault();
			this._studyWin.webContents.send('windowClose');
		});
		this._studyWin.webContents.on('new-window', (e, url) => {
			if (!url.startsWith(`file://${__dirname}/`)) {
				e.preventDefault();
				electron.shell.openExternal(url);
			}
		});
	}

	_createFieldWindow() {
		this._fieldWin = new BrowserWindow({ show: false, webPreferences: { nativeWindowOpen: true, contextIsolation: true } });
		return new Promise(resolve => {
			this._fieldWin.once('ready-to-show', resolve);
			this._fieldWin.on('closed', () => { this._fieldWin = null; });
			this._fieldWin.setMenu(null);
			this._fieldWin.loadURL(`file://${__dirname}/field/field.html#${this._id}`);
		});
	}

	_initializeDocument(text = '', filePath = null) {
		this._tempFilePath = null;
		if (filePath && filePath.trim().endsWith('.template.js')) {
			this._tempFilePath = filePath;
			filePath = null;
		}
		const readOnly = filePath ? ((FS().statSync(filePath).mode & 0x0080) === 0) : false;  // Check Write Flag
		const name     = filePath ? PATH().basename(filePath, PATH().extname(filePath)) : '';
		const baseName = filePath ? PATH().basename(filePath) : '';
		const dirName  = filePath ? PATH().dirname(filePath) : '';

		this._filePath   = filePath;
		this._isReadOnly = readOnly;
		this._isModified = false;
		this._backup.setFilePath(filePath);

		const defJsons = this._loadDefJsons(text, this._tempFilePath ?? filePath);

		this.stop();
		this._studyWin.show();
		return [filePath, name, baseName, dirName, readOnly, defJsons, text];
	}

	_loadDefJsons(text, filePath) {
		let ret = [];
		if (text !== '' && filePath) ret = this._exporter.loadDefJsons(text, filePath);
		return ret;
	}


	// -------------------------------------------------------------------------


	onStudyModified() {
		this._isModified = true;
	}

	onStudyTitleChanged(title) {
		this._studyWin.setTitle(title);
	}

	onStudyErrorOccurred(info) {
		this._backup.backupErrorLog(info, this._codeCache);
	}

	onStudyProgramClosed() {
		this.stop();
	}

	onStudyToggleDevTools() {
		this._studyWin.webContents.toggleDevTools();
	}

	onStudyToggleDevToolsField() {
		if (this._fieldWin) this._fieldWin.webContents.toggleDevTools();
	}

	_returnAlertError(e, dir) {
		let err = e.toString();
		let i = err.indexOf("'");
		if (i === -1) i = err.length;
		err = err.substr(0, i).trim();
		return ['alert_error', `\n${dir}\n${err}`];
	}

	_returnExecutionError(msg) {
		const info = { msg: msg, library: true, isUserCode: false };
		this._backup.backupErrorLog(info, this._codeCache);
		return ['error', info];
	}


	// -------------------------------------------------------------------------


	doReady() {
		if (this._initPath) {
			return this._openFile(this._initPath);
		} else {
			return this.doNew();
		}
	}

	async doCapturePage(bcr) {
		if (this._studyWin === null) return;  // When window is closed while capturing
		const scaleFactor = electron.screen.getPrimaryDisplay().scaleFactor;
		const ni = await this._studyWin.capturePage(bcr);
		const url = ni.toDataURL();
		return [url, scaleFactor];
	}

	doCopyImageToClipboard(dataUrl) {
		const ni = nativeImage.createFromDataURL(dataUrl);
		clipboard.writeImage(ni);
		return ['success'];
	}

	doUnmaximize() {
		this._studyWin.unmaximize();
	}


	// -------------------------------------------------------------------------


	doNew() {
		return ['init', this._initializeDocument()];
	}

	doOpen(dirPath = '') {
		if (dirPath !== '' && this._filePath) dirPath = this._filePath;
		const fp = dialog.showOpenDialogSync(this._studyWin, { defaultPath: dirPath, filters: FILE_FILTERS });
		if (fp) return this._openFile(fp[0]);
		return ['nop'];
	}

	doFileDropped(path) {
		try {
			const isDir = FS().statSync(path).isDirectory();
			if (!isDir) return this._openFile(path);

			const fns = FS().readdirSync(path);
			const fps = fns.map(e => PATH().join(path, e)).filter((fp) => {
				try {
					return FS().statSync(fp).isFile() && /.*\.js$/.test(fp) && !(/.*\.lib\.js$/.test(fp));
				} catch (e) {
					return ['nop'];
				}
			});
			if (fps.length === 1) return this._openFile(fps[0]);
			if (fps.length > 1)   return this.doOpen(path);
		} catch (e) {
			if (e.code !== 'ENOENT' && e.code !== 'EPERM') return this._returnAlertError(e, path);
		}
	}

	async _openFile(filePath) {
		const text = await new Promise(resolve => {
			FS().readFile(filePath, 'utf-8', (error, contents) => { resolve(contents); });
		});
		if (text === null) return this._returnAlertError('', filePath);
		return ['init', this._initializeDocument(text, filePath)];
	}

	doSave(text, dlgTitle) {
		if (this._filePath === null || this._isReadOnly) {
			return this.doSaveAs(text, dlgTitle);
		} else {
			return this._save(this._filePath, text);
		}
	}

	doSaveAs(text, dlgTitle) {
		return this._prepareSaving(text, dlgTitle, false);
	}

	doSaveCopy(text, dlgTitle) {
		return this._prepareSaving(text, dlgTitle, true);
	}

	_prepareSaving(text, dlgTitle, copy) {
		const fp = dialog.showSaveDialogSync(this._studyWin, { title: dlgTitle, defaultPath: this._filePath ? this._filePath : '', filters: FILE_FILTERS });
		if (!fp) return ['nop'];  // No file is selected.
		let writable = true;
		try {
			writable = ((FS().statSync(fp).mode & 0x0080) !== 0);  // check write flag
		} catch (e) {
			if (e.code !== 'ENOENT') return this._returnAlertError(e, fp);
		}
		if (writable) {
			if (copy && this._tempFilePath === null) return this._saveCopy(fp, text);
			else return this._save(fp, text);
		}
		// In Windows, the save dialog itself does not allow to select read only files.
		return this._returnAlertError('', fp);
	}

	_save(fp, text) {
		if (fp.indexOf('.') === -1) fp += DEFAULT_EXT;
		this._filePath = fp;
		this._backup.setFilePath(fp);
		this._backup.backupExistingFile(text, this._filePath);
		try {
			FS().writeFileSync(this._filePath, text.replace(/\n/g, '\r\n'));
			if (this._tempFilePath) {
				this._exporter.copyLibraryOfTemplate(text, this._tempFilePath, PATH().dirname(this._filePath));
				this._tempFilePath = null;
			}

			const name     = PATH().basename(this._filePath, PATH().extname(this._filePath));
			const baseName = PATH().basename(this._filePath);
			const dirName  = PATH().dirname(this._filePath);

			const defJsons = this._loadDefJsons(text, this._filePath);

			this._isModified = false;
			return ['path', [this._filePath, name, baseName, dirName, false, defJsons]];
		} catch (e) {
			return this._returnAlertError(e, this._filePath);
		}
	}

	_saveCopy(fp, text) {
		if (fp.indexOf('.') === -1) fp += DEFAULT_EXT;
		this._backup.backupExistingFile(text, fp);
		try {
			FS().writeFileSync(fp, text.replace(/\n/g, '\r\n'));
			return ['nop'];
		} catch (e) {
			return this._returnAlertError(e, fp);
		}
	}

	doClose(text) {
		if (this._isModified) this._backup.backupText(text);

		this._studyWin.destroy();
		this._studyWin = null;
		if (this._fieldWin) this._fieldWin.close();

		this._clearTempPath();
	}

	doExportAsLibrary(text, libName, isUseDecIncluded, jsonCodeStructure) {
		const codeStructure = JSON.parse(jsonCodeStructure);
		const name = libName.replace(' ', '_').replace('-', '_').replace('+', '_').replace('/', '_').replace('.', '_');
		const expDir = PATH().join(PATH().dirname(this._filePath), name + '.lib.js');

		try {
			this._exporter.exportAsLibrary(text, expDir, name.toUpperCase(), codeStructure, isUseDecIncluded);
			return ['success_export', 'exportedAsLibrary'];
		} catch (e) {
			return this._returnAlertError(e, expDir);
		}
	}

	doExportAsWebPage(text) {
		if (this._filePath === null) return ['nop'];
		const expDir = this._makeExportPath(this._filePath);
		try {
			this._rmdirSync(expDir);
			FS().mkdirSync(expDir);

			this._exporter.exportAsWebPage(text, this._filePath, expDir);
			return ['success_export', 'exportedAsWebPage'];
		} catch (e) {
			return this._returnAlertError(e, expDir);
		}
	}


	// -------------------------------------------------------------------------


	stop() {
		if (!this._fieldWin) return;
		this._fieldWin.close();
	}

	async doRun(text) {
		if (this._isModified) this._backup.backupText(text);
		this._codeCache = text;

		if (!this._fieldWin) {
			await this._createFieldWindow();
		}
		this._fieldWin.show();
		while (!this._fieldWin.isVisible()) {
			await new Promise(resolve => setTimeout(resolve, 200));
		}
		return this._execute(text);
	}

	async doRunWithoutWindow(text) {
		if (this._isModified) this._backup.backupText(text);
		this._codeCache = text;

		if (!this._fieldWin) {
			await this._createFieldWindow();
		} else {
			this._fieldWin.hide();
		}
		return this._execute(text);
	}

	_execute(codeStr) {
		const ret = this._exporter.checkLibraryReadable(codeStr, this._filePath ?? this._tempFilePath);
		if (ret !== true) return this._returnExecutionError(ret);

		this._clearTempPath();
		const expDir = this._getTempPath();
		try {
			this._rmdirSync(expDir);
			FS().mkdirSync(expDir);
			const [success, expPath] = this._exporter.exportAsWebPage(codeStr, this._filePath ?? this._tempFilePath, expDir, true);
			if (!success) return this._returnExecutionError(expPath);

			const baseUrl = 'file:///' + expPath.replace(/\\/g, '/');
			const url = baseUrl + '#' + this._id + ',' + this._exporter._userCodeOffset;
			return ['open', url];
		} catch (e) {
			return this._returnAlertError(e, expDir);
		}
	}


	// -------------------------------------------------------------------------


	_makeExportPath(fp) {
		const name = PATH().basename(fp, PATH().extname(fp));
		return PATH().join(PATH().dirname(fp), name + '.export');
	}

	_rmdirSync(dirPath) {
		if (!FS().existsSync(dirPath)) return;
		for (let fp of FS().readdirSync(dirPath)) {
			fp = PATH().join(dirPath, fp);
			if (FS().lstatSync(fp).isDirectory()) {
				this._rmdirSync(fp);
			} else {
				FS().unlinkSync(fp);
			}
		}
		FS().rmdirSync(dirPath);
	}

	_getTempPath() {
		const tmpdir = OS().tmpdir();
		const name = 'croqujs-' + Date.now();
		const path = PATH().join(tmpdir, name);
		this._tempDirs.push(path);
		return path;
	}

	_clearTempPath() {
		for (let td of this._tempDirs) this._rmdirSync(td);
		this._tempDirs = [];
	}

}

module.exports = Twin;
