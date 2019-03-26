/**
 *
 * Twin (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2019-03-26
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
const FILE_FILTERS = [{ name: 'JavaScript', extensions: ['js'] }, { name: 'All Files', extensions: ['*'] }];


class Twin {

	constructor(main, id, path) {
		this._id       = id;
		this._main     = main;
		this._studyWin = null;
		this._fieldWin = null;

		this._filePath   = null;
		this._isReadOnly = false;
		this._isModified = false;

		this._backup    = new Backup();
		this._exporter  = new Exporter();
		this._tempDirs  = [];
		this._codeCache = '';

		ipcMain.on('fromRenderer_' + this._id, (ev, msg, ...args) => {
			if (this[msg]) this[msg](...args);
		});

		this._createStudyWindow(path);
		this._main.onTwinCreated(this);
	}

	_createStudyWindow(path) {
		this._studyWin = new BrowserWindow({ show: false });
		this._studyWin.loadURL(`file://${__dirname}/renderer_study/study.html#${this._id}`);
		this._studyWin.once('ready-to-show', () => {
			this._initializeDocument();
			this._studyWin.show();
			if (path) setTimeout(() => { this._openFile(path); }, 100);
		});
		this._studyWin.on('close', (e) => {
			e.preventDefault();
			this.callStudyMethod('executeCommand', 'close');
		});
		this._studyWin.setMenu(null);
	}

	_initializeDocument(text = '', filePath = null) {
		const readOnly = filePath ? ((FS().statSync(filePath).mode & 0x0080) === 0) : false;  // Check Write Flag
		const name = filePath ? PATH().basename(filePath, PATH().extname(filePath)) : '';
		const baseName = filePath ? PATH().basename(filePath) : '';
		const dirName = filePath ? PATH().dirname(filePath) : '';

		setTimeout(() => {
			this.callStudyMethod('initializeDocument', text, filePath, name, baseName, dirName, readOnly);
		}, 100);

		this._filePath = filePath;
		this._isReadOnly = readOnly;
		this._isModified = false;
		this._backup.setFilePath(filePath);

		this.stop();
	}


	// -------------------------------------------------------------------------


	isOwnerOf(win) {  // Called By Main
		return win === this._studyWin || win === this._fieldWin;
	}

	toggleFieldDevTools() {  // Called By Main
		if (this._fieldWin) this._fieldWin.webContents.toggleDevTools();
	}

	toggleStudyDevTools() {  // Called By Main
		this._studyWin.webContents.toggleDevTools();
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

	onStudyRequestPageCapture(bcr) {
		if (this._studyWin === null) return;  // When window is closed while capturing
		const scaleFactor = electron.screen.getPrimaryDisplay().scaleFactor;
		this._studyWin.capturePage(bcr, (ni) => {
			const url = ni.toDataURL();
			this.callStudyMethod('capturedImageReceived', url, scaleFactor);
		});
	}

	onStudyCapturedImageCreated(dataUrl) {
		const ni = nativeImage.createFromDataURL(dataUrl);
		clipboard.writeImage(ni);
		setTimeout(() => { this.callStudyMethod('showServerAlert', 'copiedAsImage', 'success'); }, 0);
	}

	onStudyErrorOccurred(info) {
		this._backup.backupErrorLog(info, this._codeCache);
	}


	// -------------------------------------------------------------------------


	doOpen(defaultPath = this._filePath) {
		const fp = dialog.showOpenDialog(this._studyWin, { defaultPath: defaultPath, filters: FILE_FILTERS });
		if (fp) this._openFile(fp[0]);
	}

	doFileDropped(path) {
		try {
			const isDir = FS().statSync(path).isDirectory();
			if (!isDir) {
				this._openFile(path);
				return;
			}
			const fns = FS().readdirSync(path);
			const fps = fns.map(e => PATH().join(path, e)).filter((fp) => {
				try {
					return FS().statSync(fp).isFile() && /.*\.js$/.test(fp) && !(/.*\.lib\.js$/.test(fp));
				} catch (e) {
					return false;
				}
			});
			if (fps.length === 1) {
				this._openFile(fps[0]);
			} else if (fps.length > 1) {
				this.doOpen(path);
			}
		} catch (e) {
			if (e.code !== 'ENOENT' && e.code !== 'EPERM') throw e;
		}
	}

	_openFile(filePath) {
		FS().readFile(filePath, 'utf-8', (error, contents) => {
			if (contents === null) {
				this._outputError('', filePath);
				return;
			}
			this._initializeDocument(contents, filePath);
		});
	}

	doSaveAs(text, dlgTitle) {
		const fp = dialog.showSaveDialog(this._studyWin, { title: dlgTitle, defaultPath: this._filePath, filters: FILE_FILTERS });
		if (!fp) return;  // No file is selected.
		let writable = true;
		try {
			writable = ((FS().statSync(fp).mode & 0x0080) !== 0);  // check write flag
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

	doSave(text, dlgTitle) {
		if (this._filePath === null || this._isReadOnly) {
			this.doSaveAs(text, dlgTitle);
		} else {
			this._saveFile(this._filePath, text);
		}
	}

	_saveFile(fp, text) {
		if (fp.indexOf('.') === -1) fp += DEFAULT_EXT;
		this._filePath = fp;
		this._backup.setFilePath(fp);

		this._backup.backupExistingFile(text, this._filePath);
		try {
			FS().writeFileSync(this._filePath, text.replace(/\n/g, '\r\n'));

			const name     = PATH().basename(this._filePath, PATH().extname(this._filePath));
			const baseName = PATH().basename(this._filePath);
			const dirName  = PATH().dirname(this._filePath);
			this.callStudyMethod('setDocumentFilePath', this._filePath, name, baseName, dirName, false);

			this._isModified = false;
		} catch (e) {
			this._outputError(e, this._filePath);
		}
	}

	doSaveCopy(text, dlgTitle) {
		const fp = dialog.showSaveDialog(this._studyWin, { title: dlgTitle, defaultPath: this._filePath, filters: FILE_FILTERS });
		if (!fp) return;  // No file is selected.
		let writable = true;
		try {
			writable = ((FS().statSync(fp).mode & 0x0080) !== 0);  // check write flag
		} catch (e) {
			if (e.code !== 'ENOENT') throw e;
		}
		if (writable) {
			if (fp.indexOf('.') === -1) fp += DEFAULT_EXT;
			this._backup.backupExistingFile(text, fp);
			try {
				FS().writeFileSync(fp, text.replace(/\n/g, '\r\n'));
			} catch (e) {
				this._outputError(e, fp);
			}
		} else {
			// In Windows, the save dialog itself does not allow to select read only files.
			this._outputError(e, this._filePath);
		}
	}

	_outputError(e, dir) {
		let err = e.toString();
		let i = err.indexOf("'");
		if (i === -1) i = err.length;
		err = err.substr(0, i).trim();
		this.callStudyMethod('showServerAlert', 'error', 'error', '\n' + dir + '\n' + err);
	}

	doClose(text) {
		if (this._isModified) this._backup.backupText(text);

		this._main.onTwinDestruct(this);
		this._studyWin.destroy();
		this._studyWin = null;
		if (this._fieldWin) this._fieldWin.close();

		this._clearTempPath();
	}

	doExportAsLibrary(libName, isUseDecIncluded, text, jsonCodeStructure) {
		const codeStructure = JSON.parse(jsonCodeStructure);
		const name = libName.replace(' ', '_').replace('-', '_').replace('+', '_').replace('/', '_').replace('.', '_');
		const expDir = PATH().join(PATH().dirname(this._filePath), name + '.lib.js');

		try {
			this._exporter.exportAsLibrary(text, expDir, name.toUpperCase(), codeStructure, isUseDecIncluded);
			this.callStudyMethod('showServerAlert', 'exportedAsLibrary', 'success');
		} catch (e) {
			this._outputError(e, expDir);
		}
	}

	doExportAsWebPage(text) {
		if (this._filePath === null) return;
		const expDir = this._makeExportPath(this._filePath);
		try {
			this._rmdirSync(expDir);
			FS().mkdirSync(expDir);

			this._exporter.exportAsWebPage(text, this._filePath, expDir);
			this.callStudyMethod('showServerAlert', 'exportedAsWebPage', 'success');
		} catch (e) {
			this._outputError(e, expDir);
		}
	}

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
		} else {
			if (!this._fieldWin.isVisible()) this._fieldWin.show();
			this._execute(text);
		}
	}

	doRunWithoutWindow(text) {
		if (this._isModified) this._backup.backupText(text);
		this._codeCache = text;

		if (!this._fieldWin) {
			this._createFieldWindow();
			this._fieldWin.once('ready-to-show', () => { this._execute(text); });
		} else {
			this._fieldWin.hide();
			this._execute(text);
		}
	}

	_execute(codeStr) {
		const ret = this._exporter.checkLibraryReadable(codeStr, this._filePath);
		if (ret !== true) {
			const info = { msg: ret, library: true, isUserCode: false };
			this._backup.backupErrorLog(info, this._codeCache);
			this.callStudyMethod('addErrorMessage', info);
			return;
		}
		this._clearTempPath();
		const expDir = this._getTempPath();
		try {
			this._rmdirSync(expDir);
			FS().mkdirSync(expDir);
			const [success, expPath] = this._exporter.exportAsWebPage(codeStr, this._filePath, expDir, true);
			if (!success) {
				const info = { msg: expPath, library: true, isUserCode: false };
				this._backup.backupErrorLog(info, this._codeCache);
				this.callStudyMethod('addErrorMessage', info);
				return;
			}
			const baseUrl = 'file:///' + expPath.replace(/\\/g, '/');
			const url = baseUrl + '#' + this._id + ',' + this._exporter._userCodeOffset;
			this.callStudyMethod('openProgram', url);
		} catch (e) {
			this._outputError(e, expDir);
		}
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

	_createFieldWindow() {
		this._fieldWin = new BrowserWindow({ show: false });
		this._fieldWin.setTitle('Croqujs');
		this._fieldWin.loadURL(`file://${__dirname}/renderer_field/field.html#${this._id}`);
		this._fieldWin.on('closed', () => { this._fieldWin = null; });
		this._fieldWin.setMenu(null);
	}

}

module.exports = Twin;
