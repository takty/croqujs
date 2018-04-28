/**
 *
 * Twin (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-04-28
 *
 */


'use strict';

const electron = require('electron')
const {ipcMain, BrowserWindow, dialog, clipboard, nativeImage} = electron;
const FS   = require('fs');
const PATH = require('path');

const Backup   = require('./lib/backup.js');
const WinState = require('./lib/winstate.js');
const Exporter = require('./exporter.js');

const MAX_CONSOLE_OUTPUT_SIZE = 100;


class Twin {

	constructor(main, res, conf, nav, prevTwin) {
		Twin._count += 1;
		this._id = Twin._count;
		this._main = main;
		this._res = res;
		this._conf = conf;
		this._nav = nav;

		this._fieldWin = null;
		this._fieldWinBounds = null;
		this._fieldOutputCache = [];

		this._filePath = null;
		this._isReadOnly = false;
		this._isModified = false;
		this._historySize = {undo: 0, redo: 0};
		this._backup = new Backup();
		this._isEnabled = true;

		this._exporter = new Exporter();

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

		this._createStudyWindow(prevTwin);
		this._main.onTwinCreated(this);
	}


	// -------------------------------------------------------------------------


	_createStudyWindow(prevTwin) {
		const opt = {'show': false};
		if (prevTwin) {
			const b = prevTwin._studyWin.getBounds();
			Object.assign(opt, {x: b.x + 32, y: b.y + 32, width: b.width, height: b.height});
		}
		this._studyWin = new BrowserWindow(opt);
		this._studyWin.loadURL(`file://${__dirname}/renderer_study/study.html#${this._id}`);
		this._studyWin.once('ready-to-show', () => {
			this._initializeDocument();
			this._studyWin.show();
		});
		this._studyWin.on('close', (e) => {
			e.preventDefault();
			this._studyWinState._onClose();
			this.close();
		});
		this._studyWin.setMenu(this._nav.menu());
		this._studyWinState = new WinState(this._studyWin, false, prevTwin ? true : false, this._conf);
	}


	// -------------------------------------------------------------------------


	nav() {  // Called By Main
		return this._nav;
	}

	isOwnerOf(win) {  // Called By Main
		return win === this._studyWin || win === this._fieldWin;
	}

	tile() {  // Called By Main
		const d = electron.screen.getPrimaryDisplay();
		const w = d.workAreaSize.width / 2, h = d.workAreaSize.height;
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

	callEditorMethod(method, ...args) {  // Called By This and Main
		this._studyWin.webContents.send('callEditorMethod', method, ...args);
	}

	callStudyMethod(method, ...args) {  // Called By This and Main
		this._studyWin.webContents.send('callStudyMethod', method, ...args);
	}

	_callFieldMethod(method, ...args) {
		if (!this._fieldWin) return;
		this._fieldWin.webContents.send('callFieldMethod', method, ...args);
	}


	// -------------------------------------------------------------------------


	onStudyEnabled(flag) {
		this._isEnabled = flag;
	}

	onStudyModified(historySize) {
		this._isModified = true;
		this._historySize = historySize;
		this._updateUiState();
		this._updateWindowTitle();
	}

	onStudyFileDropped(path) {
		this._droppedFilePath = path;
		this._canDiscard(this._res.msg.confirmOpen, '_doFileDropped');
	}

	onStudyRequestPageCapture(ev, bcr) {
		this._studyWin.capturePage(bcr, (ni) => {
			ev.returnValue = ni.toDataURL();
		});
	}

	onStudyCapturedImageCreated(dataUrl) {
		const ni = nativeImage.createFromDataURL(dataUrl);
		clipboard.writeImage(ni);
		setTimeout(() => {
			this.callStudyMethod('showAlert', this._res.msg.copiedAsImage, 'success');
		}, 0);
	}

	onStudyRequestOutput(count) {
		if (this._fieldOutputCache.length === 0) return;
		const sub = this._fieldOutputCache.slice(Math.max(0, this._fieldOutputCache.length - count));
		this._fieldOutputCache.length = 0;
		this.callStudyMethod('addConsoleOutput', sub);
	}

	onFieldOutputOccurred(msgs) {
		if (this._ignoreFieldOutputMessage) return;
		if (MAX_CONSOLE_OUTPUT_SIZE < msgs.length) {
			this._fieldOutputCache = msgs.slice(msgs.length - MAX_CONSOLE_OUTPUT_SIZE);
		} else {
			this._fieldOutputCache = this._fieldOutputCache.concat(msgs);
		}
	}

	onFieldErrorOccurred(info) {
		if (info.import) {
			this.callStudyMethod('addErrorMessage', this._res.msg.cannotImport.replace('%s', info.msg), info);
		} else {
			const isUserCode = (info.url === this._url);
			if (isUserCode && info.line === 1) info.col -= this._exporter._userCodeOffset;
			const fileName = info.url ? info.url.replace(this._baseUrl, '') : '';
			const file = isUserCode ? '' : `(${fileName}) `;
			const msg = `${file}%lineno% [${info.col}] - ${this._main.translateError(info.msg)}`;
			// When an error occurred in a library file, the 2nd param must be 'undefined'!
			this.callStudyMethod('addErrorMessage', msg, isUserCode ? info : undefined, info.line);
		}
	}


	// -------------------------------------------------------------------------


	_updateUiState() {
		const state = {
			isFileOpened: this._filePath != null,
			canUndo: this._historySize.undo > 0,
			canRedo: this._historySize.redo > 0,
		};
		this._main.updateTwinSpecificMenuItems(state, this._nav);
		this.callStudyMethod('reflectTwinState', state);
	}

	_updateWindowTitle() {
		const prefix = (this._isModified ? '* ' : '') + (this._isReadOnly ? `(${this._res.readOnly}) ` : '');
		const fn = (this._filePath === null) ? this._res.untitled : PATH.basename(this._filePath);
		const fp = (this._filePath === null) ? '' : (' — ' + PATH.dirname(this._filePath) + '');
		const title = prefix + fn + fp + ' — ' + this._res.appTitle;
		if (this._studyWin.getTitle() !== title) this._studyWin.setTitle(title);
	}

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


	// -------------------------------------------------------------------------


	_canDiscard(msg, returnMsg) {
		if (this._isModified) {
			if (this._studyWin.isMinimized()) this._studyWin.restore();
			this._ensureWindowTop(this._studyWin);
			this.callStudyMethod('showConfirm', msg, 'warning', returnMsg);
		} else {
			this[returnMsg]();
		}
	}

	new() {
		this._canDiscard(this._res.msg.confirmNew, '_initializeDocument');
	}

	open() {
		this._canDiscard(this._res.msg.confirmOpen, '_doOpen');
	}

	_doOpen(defaultPath = this._filePath) {
		const fp = dialog.showOpenDialog(this._studyWin, {defaultPath: defaultPath, filters: this._res.fileFilters});
		if (fp) this._openFile(fp[0]);
	}

	_openFile(filePath) {
		FS.readFile(filePath, 'utf-8', (error, contents) => {
			if (contents == null) {
				this._outputError('', filePath);
				return;
			}
			this._initializeDocument(contents, filePath);
		});
	}

	_initializeDocument(text = '', filePath = null) {
		const readOnly = filePath ? ((FS.statSync(filePath).mode & 0x0080) === 0) : false;  // Check Write Flag

		this.callStudyMethod('clearCurrentState');
		this.callEditorMethod('enabled', false);
		this.callEditorMethod('value', text);
		this.callEditorMethod('readOnly', readOnly);

		this._filePath    = filePath;
		this._isReadOnly  = readOnly;
		this._isModified  = false;
		this._historySize = { undo: 0, redo: 0 };
		this._backup.setFilePath(filePath);

		this._updateUiState();
		this._updateWindowTitle();
		this.stop();
		this.callEditorMethod('enabled', true);
	}

	_doFileDropped() {
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
				this._doOpen(this._droppedFilePath);
			}
		} catch (e) {
			if (e.code !== 'ENOENT' && e.code !== 'EPERM') throw e;
		}
	}

	saveAs() {
		const fp = dialog.showSaveDialog(this._studyWin, {defaultPath: this._filePath, filters: this._res.fileFilters});
		if (!fp) return;  // No file is selected.
		let writable = true;
		try {
			writable = ((FS.statSync(fp).mode & 0x0080) !== 0);  // check write flag
		} catch (e) {
			if (e.code !== 'ENOENT') throw e;
		}
		if (writable) {
			this._saveFile(fp);
		} else {
			// In Windows, the save dialog itself does not allow to select read only files.
			this.callStudyMethod('showConfirm', this._res.msg.confirmReadOnly, 'warning', 'saveAs');
		}
	}

	save() {
		if (this._filePath === null || this._isReadOnly) {
			this.saveAs();
		} else {
			this._saveFile(this._filePath);
		}
	}

	_saveFile(fp) {
		if (fp.indexOf('.') === -1) fp += this._res.defaultExt;
		if (this._conf.get('autoBackup')) this._backup.backupExistingFile(fp);

		this._filePath = fp;
		this._backup.setFilePath(fp);
		this.callStudyMethod('sendBackText', '_doSaveFile');
	}

	_doSaveFile(text) {
		try {
			FS.writeFileSync(this._filePath, text.replace(/\n/g, '\r\n'));
			this._isModified = false;
			this._updateUiState();
			this._updateWindowTitle();
		} catch (e) {
			this._outputError(e, this._filePath);
		}
	}

	saveVersion() {
		const fp = dialog.showSaveDialog(this._studyWin, {defaultPath: this._filePath, filters: this._res.fileFilters});
		if (!fp) return;  // No file is selected.
		let writable = true;
		try {
			writable = ((FS.statSync(fp).mode & 0x0080) !== 0);  // check write flag
	    } catch (e) {
	      	if (e.code !== 'ENOENT') throw e;
	    }
		if (writable) {
			if (fp.indexOf('.') === -1) fp += this._res.defaultExt;
			if (this._conf.get('autoBackup')) this._backup.backupExistingFile(fp);
			this._filePathVersion = fp;
			this.callStudyMethod('sendBackText', '_doSaveFileVersion');
		} else {
			// In Windows, the save dialog itself does not allow to select read only files.
			this.callStudyMethod('showConfirm', this._res.msg.confirmReadOnly, 'warning', 'saveVersion');
		}
	}

	_doSaveFileVersion(text) {
		try {
			FS.writeFileSync(this._filePathVersion, text.replace(/\n/g, '\r\n'));
		} catch (e) {
			this._outputError(e, this._filePathVersion);
		}
	}

	_outputError(e, dir) {
		let err = e.toString(), i = err.indexOf("'");
		if (i === -1) i = err.length;
		err = err.substr(0, i).trim();
		this._ensureWindowTop(this._studyWin);
		this.callStudyMethod('showAlert', this._res.msg.error + '\n' + dir + '\n' + err, 'error');
	}

	close() {
		this._canDiscard(this._res.msg.confirmExit, '_doClose');
	}

	_doClose() {
		this.callStudyMethod('sendBackText', '__doClose');
	}

	__doClose(text) {
		if (this._conf.get('autoBackup') && this._isModified) this._backup.backup(text);

		this._main.onTwinDestruct(this);
		this._studyWin.destroy();
		this._studyWin = null;
		if (this._fieldWin) this._fieldWin.close();
	}

	exportAsLibrary() {
		if (this._filePath === null) return;
		const name = PATH.basename(this._filePath, PATH.extname(this._filePath));
		this._ensureWindowTop(this._studyWin);
		this.callStudyMethod('showPrompt', this._res.msg.enterLibraryName, 'input', '_doExportAsLibrary', this._res.msg.libraryName, name);
	}

	_doExportAsLibrary(val) {
		this._libraryNameTemp = val;
		this.callStudyMethod('sendBackText', '__doExportAsLibrary');
	}

	__doExportAsLibrary(text) {
		const val = this._libraryNameTemp;
		const name = val.replace(' ', '_').replace('-', '_').replace('+', '_').replace('/', '_').replace('.', '_');
		const expDir = PATH.join(PATH.dirname(this._filePath), name + '.lib.js');

		try {
			this._exporter.exportAsLibrary(text, expDir, name.toUpperCase());
			this._ensureWindowTop(this._studyWin);
			this.callStudyMethod('showAlert', this._res.msg.exportedAsLibrary, 'success');
		} catch (e) {
			this._outputError(e, expDir);
		}
	}

	exportAsWebPage() {
		if (this._filePath === null) return;
		const expDir = this._makeExportPath(this._filePath);
		try {
			this._rmdirSync(expDir);
			FS.mkdirSync(expDir);
			this.callStudyMethod('sendBackText', '_doExportAsWebPage');
		} catch (e) {
			this._outputError(e, expDir);
		}
	}

	_doExportAsWebPage(text) {
		const expDir = this._makeExportPath(this._filePath);
		try {
			this._exporter.exportAsWebPage(text, this._filePath, expDir);
			this._ensureWindowTop(this._studyWin);
			this.callStudyMethod('showAlert', this._res.msg.exportedAsWebPage, 'success');
		} catch (e) {
			this._outputError(e, expDir);
		}
	}

	_makeExportPath(fp) {
		const ext = PATH.extname(fp);
		const name = PATH.basename(fp, ext);
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


	copyAsImage() {
		this.callStudyMethod('sendBackCapturedImages');
	}


	// -------------------------------------------------------------------------


	stop() {
		if (!this._fieldWin) return;
		this._callFieldMethod('terminateProgram');
		this._fieldWin.close();
	}

	run() {
		this._prepareExecution(false, '_doRun');
	}

	runSelection() {
		this._prepareExecution(true, '_doRun');
	}

	runWithoutWindow() {
		this._prepareExecution(false, '_doRunWithoutWindow');
	}

	runInFullScreen() {
		this._prepareExecution(false, '_doRunInFullScreen');
	}

	_prepareExecution(selected, nextMethod) {
		this._ignoreFieldOutputMessage = true;
		this._fieldOutputCache.length = 0;
		this.callStudyMethod('prepareExecution', selected, nextMethod);
	}

	_doRun(text) {
		if (this._conf.get('autoBackup') && this._isModified) this._backup.backup(text);

		if (!this._fieldWin) {
			this._createFieldWindow();
			this._fieldWin.once('ready-to-show', () => {
				this._fieldWin.show();
				this._execute(text);
			});
			this._fieldWin.once('show', () => {this._ensureWindowTop(this._studyWin);});
		} else {
			this._callFieldMethod('terminateProgram');
			if (!this._fieldWin.isVisible()) this._fieldWin.show();
			this._ensureWindowsFocused(this._studyWin, this._fieldWin);
			this._execute(text);
		}
	}

	_doRunWithoutWindow(text) {
		if (this._conf.get('autoBackup') && this._isModified) this._backup.backup(text);

		if (!this._fieldWin) {
			this._createFieldWindow();
			this._fieldWin.once('ready-to-show', () => {this._execute(text);});
		} else {
			this._callFieldMethod('terminateProgram');
			this._fieldWin.hide();
			this._execute(text);
		}
	}

	_doRunInFullScreen(text) {
		if (this._conf.get('autoBackup') && this._isModified) this._backup.backup(text);

		if (!this._fieldWin) {
			this._createFieldWindow();
			this._fieldWin.once('ready-to-show', () => {
				this._fieldWin.setFullScreen(true);
				this._fieldWin.show();
				this._execute(text);
			});
			this._fieldWin.once('show', () => {this._ensureWindowTop(this._fieldWin);});
		} else {
			this._callFieldMethod('terminateProgram');
			this._fieldWin.setFullScreen(true);
			if (!this._fieldWin.isVisible()) this._fieldWin.show();
			this._ensureWindowTop(this._fieldWin);
			this._execute(text);
		}
	}

	_execute(codeStr, windowShouldBeTop) {
		const ret = this._exporter.readLibrarySources(codeStr, this._filePath);
		if (!Array.isArray(ret)) {
			this.onFieldErrorOccurred({msg: ret, import: true});
			return;
		}
		this._ignoreFieldOutputMessage = false;

		const expDir = this._getTempPath();
		try {
			this._rmdirSync(expDir);
			FS.mkdirSync(expDir);
			const expPath = this._exporter.exportAsWebPage(codeStr, this._filePath, expDir);
			this._url = 'file:///' + expPath.replace(/\\/g, '/');
			this._baseUrl = 'file:///' + PATH.dirname(expPath).replace(/\\/g, '/') + '/';
			this._callFieldMethod('openProgram', this._url);
		} catch (e) {
			this._outputError(e, expDir);
		}
	}

	_getTempPath() {
		let dir = PATH.join(__dirname, '../');
		if (PATH.extname(dir) === '.asar') {
			dir = PATH.dirname(dir);
		}
		return PATH.join(dir, '.temp');
	}

	_createFieldWindow() {
		const opt = Object.assign({show: false}, this._fieldWinBounds || {});
		this._fieldWin = new BrowserWindow(opt);
		this._fieldWin.setTitle(this._res.appTitle);
		this._fieldWin.loadURL(`file://${__dirname}/renderer_field/field.html#${this._id}`);
		this._fieldWin.on('closed', () => {this._fieldWin = null;});
		this._fieldWin.on('enter-full-screen', () => {this._callFieldMethod('onWindowFullscreenEntered');});
		this._fieldWin.on('leave-full-screen', () => {this._callFieldMethod('onWindowFullscreenLeft');});
		this._fieldWin.setMenu(null);
		this._fieldWinState = new WinState(this._fieldWin, false, this._fieldWinBounds ? true : false, this._conf, 'fieldWindowState');
	}

	toggleFieldWinFullScreen() {
		if (!this._fieldWin) return;
		this._fieldWin.setFullScreen(!this._fieldWin.isFullScreen());
		if (this._fieldWin.isFullScreen()) this._ensureWindowTop(this._fieldWin);
	}

	toggleDevTools() {
		if (this._fieldWin) this._callFieldMethod('toggleDevTools');
	}

	toggleFieldDevTools() {
		if (this._fieldWin) this._fieldWin.webContents.toggleDevTools();
	}

	toggleStudyDevTools() {
		this._studyWin.webContents.toggleDevTools();
	}

}

Twin._count = 0;

module.exports = Twin;
