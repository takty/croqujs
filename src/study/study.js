/**
 *
 * Study (JS)
 *
 * @author Takuto Yanagida
 * @version 2021-08-13
 *
 */


'use strict';


class Study {

	constructor() {
		this._id = window.location.hash;
		if (this._id) this._id = this._id.replace('#', '');

		this._winstate = new WinState(window, '$winstate_study');
		this._config = new Config({ fontSize: 16, lineHeight: 165, softWrap: false, functionLineNumber: false, autoIndent: true, language: 'ja' });
		this._config.addEventListener((cfg) => this._configUpdated(cfg));
		this._lang = this._config.getItem('language', 'ja');
		this._permissions = {};
		this._permissionRequests = [];

		window.ipc.on('windowClose', () => this.executeCommand('close'));
		window.onbeforeunload = (e) => {
			if (!this._isModified) return;
			e.preventDefault();
			e.returnValue = this._res.msg.confirmExit;
			this._cleanLocalStorage();
		}

		window.addEventListener('keydown', (e) => {
			if (!this._editor._comp.hasFocus() && e.ctrlKey && e.key === 'a') e.preventDefault();
			if ((e.ctrlKey || e.metaKey) && e.key === 'F12') this._notifyServer('onStudyToggleDevTools');
		});

		this._initImeStateIndication();
		this._loadPlugin(this._lang);
		this._initFileDrop();
		this._initialize();
	}

	_initImeStateIndication() {
		let isImeOn = false;
		let st = null;
		const turnOffImeCursor = () => {
			if (isImeOn) this._editor._elem.classList.remove('ime');
			isImeOn = false;
		}
		window.addEventListener('compositionstart', (e) => {
			if (!isImeOn) this._editor._elem.classList.add('ime');
			isImeOn = true;
		});
		window.addEventListener('compositionend', (e) => {
			clearTimeout(st);
			st = setTimeout(turnOffImeCursor, 1000);
		});
	}

	_cleanLocalStorage() {
		const keys = [];
		for (let i = 0; i < window.localStorage.length; i += 1) keys.push(window.localStorage.key(i));
		for (let key of keys) {
			if (key[0] !== '$') window.localStorage.removeItem(key);
		}
	}

	_initFileDrop() {
		let flag = false;
		window.addEventListener('dragenter', (e) => {
			flag = true;
		}, true);
		window.addEventListener('dragleave', (e) => {
			if (!flag) this._toolbar.hideMessage();
			flag = false;
		}, true);
		window.addEventListener('dragover', (e) => {
			if (flag) this._toolbar.showMessage(this._res.msg.openFile);
			flag = false;
			e.preventDefault();
		}, true);
		window.addEventListener('drop', (e) => {
			this._toolbar.hideMessage();
			this._onFileDropped(e);
		}, true);
	}

	_loadPlugin(lang) {
		const se = document.createElement('script');
		se.src = 'lib/jshint/' + (lang === 'en' ? 'jshint.js' : 'ja-edu/jshint.js');
		document.getElementsByTagName('head')[0].appendChild(se);
		setTimeout(() => {
			const se2 = document.createElement('script');
			se2.src = 'lib/codemirror/addon/lint/javascript-lint.js';
			document.getElementsByTagName('head')[0].appendChild(se2);
		}, 100);
	}

	async _initialize() {
		const rets = await loadJSON(['res/lang.' + this._lang + '.json', 'res/resource.json']);
		this._res = Object.assign(rets[0], rets[1]);
		this._initEditor();

		this._toolbar    = new Toolbar(this, this._res);
		this._sideMenu   = new SideMenu(this, this._res);
		this._dialogBox  = new DialogBox(this, this._res);
		this._outputPane = new OutputPane(this._res);

		this._filePath    = null;
		this._name        = null;
		this._baseName    = null;
		this._dirName     = null;
		this._isReadOnly  = false;
		this._isModified  = false;
		this._historySize = { undo: 0, redo: 0 };
		this._errorMarker = null;

		this._initWindowResizing(this._editor);
		this._initFieldConnection();

		document.addEventListener('focus', (e) => {
			navigator.clipboard.readText().then(clipText => this._reflectClipboardState(clipText));
		});
		setTimeout(() => { this._editor.refresh(); }, 0);  // For making the gutter width correct

		this._config.notify();

		const [msg, arg] = await this._callServer('doReady');
		this._handleServerResponse(msg, arg);

		navigator.clipboard.readText().then(clipText => this._reflectClipboardState(clipText));
		window.focus();
	}

	_initEditor() {
		this._editor = new Editor(this, document.querySelector('#editor'));
		this._editor.fontFamily(this._res.fontSet);
		this._editor.rulerEnabled(true);
		const ec = this._editor.getComponent();

		const w = new Worker('worker-analyzer.js');
		w.addEventListener('message', (e) => {
			this._codeStructure = e.data;
			this._editor.setCodeStructureData(this._codeStructure);
		}, false);
		const analyze = createDelayFunction(() => { w.postMessage(ec.getValue()); }, 600);

		ec.on('change', () => {
			this._clearErrorMarker();
			if (this._editor.enabled()) {
				this._isModified  = true;
				this._historySize = this._editor._comp.getDoc().historySize();
				this._notifyServer('onStudyModified');
				this._reflectState();
			}
			analyze();
		});
		ec.on('focus', () => { this._sideMenu.close(); });
		ec.on('copy', (cm, e) => { this._reflectClipboardState(cm.getDoc().getSelection()); });
		ec.on('cut',  (cm, e) => { this._reflectClipboardState(cm.getDoc().getSelection()); });
	}

	_initWindowResizing(ed) {
		const main   = document.querySelector('.main');
		const editor = document.querySelector('#editor');
		const handle = document.querySelector('#handle');
		const sub    = document.querySelector('.sub');

		const TH = document.querySelector('.toolbar').offsetHeight;
		const HH = 8;
		const MIN_MAIN_H = 100;
		const MIN_SUB_H  = 32;

		const setSubPaneHeight = (h) => {
			const bh = document.body.offsetHeight;
			editor.style.height = (bh - (TH + HH + h)) + 'px';
			main.style.height   = (bh - (HH + h)) + 'px';
			sub.style.height    = h + 'px';
			ed.refresh();
		};

		let pressed = false, resizing = false;
		let lastSubH = 100, py;

		const onHandleDown = (e) => {
			py = e.pageY - handle.offsetTop;
			pressed = true;
			resizing = false;
		};
		const onHandleMove = (e) => {
			if (!pressed) return;
			resizing = true;

			const bh = document.body.offsetHeight;
			const mainH = e.pageY - py;

			let subH = bh - (mainH + HH);
			if (mainH - TH < MIN_MAIN_H) subH = bh - (TH + MIN_MAIN_H + HH);
			if (subH < MIN_SUB_H) subH = 0;
			setSubPaneHeight(subH);
			e.preventDefault();
		};
		const onHandleUp = (e) => {
			if (!pressed) return;
			pressed = false;
			if (MIN_SUB_H < sub.offsetHeight) lastSubH = sub.offsetHeight;
			e.preventDefault();
		};
		handle.addEventListener('mousedown', onHandleDown);
		handle.addEventListener('mousemove', onHandleMove);
		handle.addEventListener('mouseup', onHandleUp);
		handle.addEventListener('click', () => {
			if (!resizing) setSubPaneHeight(sub.offsetHeight === 0 ? lastSubH : 0);
		});
		document.body.addEventListener('mousemove', onHandleMove);
		document.body.addEventListener('mouseup', onHandleUp);
		document.body.addEventListener('mouseenter', (e) => {
			if (pressed && !e.buttons) pressed = false;
		});
		window.addEventListener('resize', () => { setSubPaneHeight(sub.offsetHeight); });
		setSubPaneHeight(sub.offsetHeight);
	}

	_initFieldConnection() {
		const msg_id = '#study_' + this._id;
		window.addEventListener('storage', () => {
			const v = window.localStorage.getItem(msg_id);
			if (!v) return;
			window.localStorage.removeItem(msg_id);
			const ma = JSON.parse(v);

			if (ma.message === 'error') {
				this._notifyServer('onStudyErrorOccurred', ma.params);
				this._addErrorMessage(ma.params);
			} else if (ma.message === 'output') {
				this._outputPane.addOutput(ma.params);
			} else if (ma.message === 'requestPermission') {
				this._permissionRequests.push(ma.params);
				if (this._permissionRequests.length === 1) this._handlePermission();
			} else if (ma.message === 'toggleDevTools') {
				this._notifyServer('onStudyToggleDevToolsField');
			}
		});
	}

	async _handlePermission() {
		while (this._permissionRequests.length) {
			await this._doHandlePermission(this._permissionRequests[0]);
			this._permissionRequests.shift();
		}
	}

	async _doHandlePermission(type) {
		if (this._permissions[type] !== true) {
			const { value: res } = await this._dialogBox.showConfirm(this._res.msg.permission[type], 'warning');
			this._permissions[type] = res;
		}
		if (this._permissions[type] === true) {
			switch (type) {
				case 'user_media_a':
					if (this._permissions['user_media_v'] === true) this._permissions['user_media_av'] = true;
					break;
				case 'user_media_v':
					if (this._permissions['user_media_a'] === true) this._permissions['user_media_av'] = true;
					break;
				case 'user_media_av':
					this._permissions['user_media_a'] = true;
					this._permissions['user_media_v'] = true;
					break;
			}
		}
		window.localStorage.setItem('#injection_' + this._id, JSON.stringify({ message: 'permission', params: { type: type, result: this._permissions[type] } }));
	}


	// -------------------------------------------------------------------------


	_notifyServer(msg, ...args) {
		window.ipc.send('notifyServer_' + this._id, msg, ...args);
	}

	_callServer(msg, ...args) {
		return window.ipc.invoke('callServer_' + this._id, msg, ...args);
	}

	_callField(method, ...args) {
		window.localStorage.setItem('#field_' + this._id, JSON.stringify({ message: 'callFieldMethod', params: { method: method, args: args } }));
	}


	// -------------------------------------------------------------------------


	_configUpdated(cfg) {
		this._lang = cfg.language;

		this._editor.lineWrapping(cfg.softWrap);
		this._editor.lineHeight(parseInt(cfg.lineHeight, 10) + '%');
		this._editor.fontSize(parseInt(cfg.fontSize, 10));
		this._editor.functionLineNumberEnabled(cfg.functionLineNumber);
		this._editor.autoIndentEnabled(cfg.autoIndent);

		const pane = document.querySelector('.sub');
		pane.style.fontSize = parseInt(cfg.fontSize, 10) + 'px';

		this._editor.refresh();
		this._sideMenu.reflectConfig(cfg);
	}

	_reflectClipboardState(text) {
		this._toolbar.reflectClipboard(text);
		this._sideMenu.reflectClipboard(text);
	}

	_reflectState() {
		const state = {
			isFileOpened: this._filePath !== null,
			canUndo     : this._historySize.undo > 0,
			canRedo     : this._historySize.redo > 0,
		}
		this._toolbar.reflectState(state);
		this._sideMenu.reflectState(state);
	}


	// -------------------------------------------------------------------------


	_initDocument(filePath, name, baseName, dirName, readOnly, defJsons, text) {
		this._setDocumentFile(filePath, name, baseName, dirName, readOnly, defJsons);

		this._editor.enabled(false);
		this._editor.value(text);
		this._editor.enabled(true);

		this._clearErrorMarker();
		this._outputPane.initialize();
	}

	_setDocumentFile(filePath, name, baseName, dirName, readOnly, defJsons) {
		if (defJsons) {
			const defs = [];
			for (let d of defJsons) {
				try {
					defs.push(JSON.parse(d));
				} catch(e) {
					console.error(d);
				}
			}
			this._editor.updateAutoComplete(defs);
		}
		this._filePath    = filePath;
		this._name        = name;
		this._baseName    = baseName;
		this._dirName     = dirName;
		this._isReadOnly  = readOnly;
		this._isModified  = false;
		this._historySize = { undo: 0, redo: 0 };
		this._reflectState();

		this._editor.readOnly(readOnly);
		this._updateWindowTitle();
	}

	_updateWindowTitle() {
		const prefix = (this._isModified ? '* ' : '') + (this._isReadOnly ? `(${this._res.readOnly}) ` : '');
		const fn = (this._filePath === null) ? this._res.untitled : this._baseName;
		const fp = (this._filePath === null) ? '' : (' — ' + this._dirName + '');
		const title = prefix + fn + fp + ' — ' + 'Croqujs';
		if (window.title !== title) {
			window.title = title;
			this._notifyServer('onStudyTitleChanged', title);
		}
	}

	_addErrorMessage(info) {
		let msg;
		if (info.library) {
			msg = this._res.msg.cannotReadLibrary.replace('%s', info.msg);
		} else {
			const transMsg = new ErrorTranslator(this._lang).translate(info.msg);
			if (info.isPromise) {
				msg = `[in promise] - ${transMsg}`;
			} else {
				const file = info.isUserCode ? '' : `(${info.fileName}) `;
				msg = `${file}%lineno% [${info.col}] - ${transMsg}`;

				if (!info.isUserCode) {
					const lc = this._extractErrorLocation(info);
					if (lc) {
						info.line       = lc[0];
						info.col        = lc[1];
						info.isUserCode = true;
						msg = `%lineno% [${info.col}] (${info.fileName}) - ${transMsg}`;
					}
				}
				if (info.isUserCode && this._editor.isFunctionLineNumberEnabled()) {
					const lnf = this._editor.getFunctionLineNumber(info.line - 1);
					msg = msg.replace('%lineno%', lnf[0] + ':' + lnf[1]);
				} else {
					msg = msg.replace('%lineno%', info.line);
				}
			}
		}
		if (info.isUserCode) {
			const doc = this._editor.getComponent().getDoc();
			const jump = () => {
				doc.setCursor(info.line - 1, info.col - 1, { scroll: true });
				this._editor.getComponent().focus();
			};
			this._outputPane.addError(msg, 'err', jump);
			this._errorMarker = doc.addLineClass(info.line - 1, 'wrap', 'error-line');
			if (this._outputPane.getErrorCount() === 1) jump();
		} else {
			this._outputPane.addError(msg, 'err');
		}
	}

	_clearErrorMarker() {
		if (!this._errorMarker) return;
		this._editor.getComponent().getDoc().removeLineClass(this._errorMarker, 'wrap', 'error-line');
		this._errorMarker = null;
	}

	_extractErrorLocation(info) {
		if (!info.stack) return false;
		const stack = info.stack.split('\n').map((e) => e.trim());
		for (let s of stack) {
			if (s.startsWith('at ')) {
				const [, , path] = s.split(' ');
				if (path && path.includes('index.html')) {
					const p = path.indexOf('index.html');
					let loc = path.substr(p + 11);
					if (loc.endsWith(')')) loc = loc.substr(0, loc.length - 1);
					return loc.split(':');
				}
			}
		}
		return false;
	}


	// -------------------------------------------------------------------------


	_cmdTileWindow() {
		this._callServer('doUnmaximize');
		const x = window.screen.availLeft, y = window.screen.availTop;
		const w = window.screen.availWidth / 2, h = window.screen.availHeight;
		window.moveTo(x, y);
		window.resizeTo(w, h);
		this._callField('alignWindow', x + w, y, w, h);

		const state = { x: x + w, y: y, width: w, height: h };
		window.localStorage.setItem('$winstate_field', JSON.stringify(state));
	}

	_cmdCopyAsImage() {
		const orig = this._editor.setSimpleView();
		this._toolbar.showMessage(this._res.msg.copyingAsImage, true);

		const comp     = this._editor._comp;
		const count    = comp.getDoc().lineCount();
		const lh       = comp.defaultTextHeight();
		const height   = lh * count + lh * 0.25;
		const topDelta = lh * 10;

		const bcr = this._editor._elem.getBoundingClientRect();
		const r = {x: bcr.left | 0, y: bcr.top | 0, width: bcr.width | 0, height: bcr.height | 0};

		comp.scrollTo(0, 0);
		comp.refresh();
		this._editor.enabled(false);  // After showing modal, it becomes true.

		let c = null;
		let top = 0;

		const capture = () => {
			this._callServer('doCapturePage', r).then(([url, scaleFactor]) => {
				if (c === null) c = this._createTempCanvas(r.width, height, scaleFactor);
				top += topDelta;
				const finished = (top > height);
				setTimeout(() => {
					this._addImageToCanvas(c, comp.getScrollInfo().top * scaleFactor, url, finished);
					this._goNextStep(top, finished, orig, capture);
				}, 0);
			});
		};
		setTimeout(capture, 400);
	}

	_createTempCanvas(width, height, scaleFactor) {
		const c = document.createElement('canvas');
		c.width  = width * scaleFactor;
		c.height = height * scaleFactor;
		return c;
	}

	_addImageToCanvas(c, y, dataUrl, finished) {
		const img = new Image();
		img.onload = async () => {
			const ctx = c.getContext('2d');
			ctx.drawImage(img, 0, y);
			if (finished) {
				const [res] = await this._callServer('doCopyImageToClipboard', c.toDataURL('image/png'));
				if (res === 'success') this._dialogBox.showAlert(this._res.msg['copiedAsImage'], 'success');
			}
		};
		img.src = dataUrl;
	}

	_goNextStep(nextTop, finished, orig, capture) {
		if (finished) {
			this._toolbar.hideMessage(200);
			setTimeout(() => {
				this._editor.restoreOriginalView(orig);
				this._editor._comp.scrollTo(0, 0);
			}, 200);
		} else {
			this._editor._comp.scrollTo(0, nextTop);
			this._editor._comp.refresh();
			setTimeout(capture, 200);
		}
	}


	// -------------------------------------------------------------------------


	executeCommand(cmd, close = true) {
		if (close) this._sideMenu.close();
		this._editor.setLineSelectionMode(false);

		const minmax = (val, min, max) => Math.min(max, Math.max(min, val));

		setTimeout(() => {
			const cfg = this._config;

			if (this._executeCommandFile(cmd)) return;
			if (this._executeCommandCode(cmd)) return;

			if      (cmd === 'undo')          this._editor.undo();
			else if (cmd === 'redo')          this._editor.redo();
			else if (cmd === 'cut')           this._editor.cut();
			else if (cmd === 'copy')          this._editor.copy();
			else if (cmd === 'paste')         this._editor.paste();
			else if (cmd === 'selectAll')     this._editor.selectAll();
			else if (cmd === 'toggleComment') this._editor.toggleComment();
			else if (cmd === 'format')        this._editor.format();
			else if (cmd === 'find')          this._editor.find();
			else if (cmd === 'findNext')      this._editor.findNext();
			else if (cmd === 'replace')       this._editor.replace();

			else if (cmd === 'copyAsImage')   this._cmdCopyAsImage();
			else if (cmd === 'tileWin')       this._cmdTileWindow();
			else if (cmd === 'showAbout')     this._dialogBox.showAlert(this._res.about.join('\n'), 'info');

			else if (cmd === 'fontSizePlus')     cfg.setItem('fontSize', minmax(cfg.getItem('fontSize') + 2, 10, 64));
			else if (cmd === 'fontSizeMinus')    cfg.setItem('fontSize', minmax(cfg.getItem('fontSize') - 2, 10, 64));
			else if (cmd === 'fontSizeReset')    cfg.setItem('fontSize', 16);
			else if (cmd === 'lineHeightPlus')   cfg.setItem('lineHeight', minmax(cfg.getItem('lineHeight') + 15, 135, 195));
			else if (cmd === 'lineHeightMinus')  cfg.setItem('lineHeight', minmax(cfg.getItem('lineHeight') - 15, 135, 195));
			else if (cmd === 'lineHeightReset')  cfg.setItem('lineHeight', 165);
			else if (cmd === 'toggleSoftWrap')   cfg.setItem('softWrap', !cfg.getItem('softWrap'));
			else if (cmd === 'toggleFnLineNum')  cfg.setItem('functionLineNumber', !cfg.getItem('functionLineNumber'));
			else if (cmd === 'toggleAutoIndent') cfg.setItem('autoIndent', !cfg.getItem('autoIndent'));
			else if (cmd === 'toggleOutputPane') this._outputPane.toggle();

			if (cmd === 'setLanguageJa') {
				cfg.setItem('language', 'ja');
				this._dialogBox.showAlert(this._res.msg.alertNextTime, 'info');
			} else if (cmd === 'setLanguageEn') {
				cfg.setItem('language', 'en');
				this._dialogBox.showAlert(this._res.msg.alertNextTime, 'info');
			}

			// Experimental
			if (cmd === 'toggleLamono') {
				const ff = this._editor.fontFamily();
				if (ff.indexOf('LaMono') === -1) this._editor.fontFamily('LaMono, ' + this._res.fontSet);
				else this._editor.fontFamily(this._res.fontSet);
				setTimeout(() => { this._editor.refresh(true); }, 0);
			}
		}, 0);
	}

	_handleServerResponse(msg, arg) {
		if (msg === 'init') {
			this._initDocument(...arg);
		} else if (msg === 'path') {
			this._setDocumentFile(...arg);
		} else if (msg === 'success_export') {
			this._dialogBox.showAlert(this._res.msg[arg], 'success');
		} else if (msg === 'open') {
			this._callField('openProgram', arg);
		} else if (msg === 'alert_error') {
			this._dialogBox.showAlert(this._res.msg['error'] + arg, 'error');
		} else if (msg === 'error') {
			this._addErrorMessage(arg);
		}
	}


	// -------------------------------------------------------------------------


	_executeCommandFile(cmd) {
		switch (cmd) {
			case 'new':
				this._handleOpening(this._res.msg.confirmNew, 'doNew');
				return true;
			case 'open':
				this._handleOpening(this._res.msg.confirmOpen, 'doOpen');
				return true;
			case 'close':
				this._handleOpening(this._res.msg.confirmExit, 'doClose', this._editor.value());
				return true;
			case 'save':
				this._handleSaving('doSave', this._res.dialogTitle.saveAs);
				return true;
			case 'saveAs':
				this._handleSaving('doSaveAs', this._res.dialogTitle.saveAs);
				return true;
			case 'saveCopy':
				this._handleSaving('doSaveCopy', this._res.dialogTitle.saveCopy);
				return true;
			case 'exportAsLibrary':
				this._onExportAsLibrary();
				return true;
			case 'exportAsWebPage':
				this._handleSaving('doExportAsWebPage');
				return true;
		}
		return false;
	}

	async _onFileDropped(e) {
		e.preventDefault();
		if (e.dataTransfer.files.length > 0) {
			const filePath = e.dataTransfer.files[0].path;
			this._handleOpening(this._res.msg.confirmOpen, 'doFileDropped', filePath);
		}
	}

	async _onExportAsLibrary() {
		const { value: [libName, flag] } = await this._dialogBox.showPromptWithOption(this._res.msg.enterLibName, '', this._res.msg.libName, this._name, this._res.msg.includeUsedLibs);
		if (libName) {
			this._handleSaving('doExportAsLibrary', libName, flag, JSON.stringify(this._codeStructure));
		}
		return true;
	}

	async _handleOpening(text, method, ...args) {
		if (this._isModified) {
			const { value: res } = await this._dialogBox.showConfirm(text, 'warning');
			if (!res) return;
		}
		const [msg, arg] = await this._callServer(method, ...args);
		this._handleServerResponse(msg, arg);
	}

	async _handleSaving(method, ...opts) {
		const [msg, arg] = await this._callServer(method, this._editor.value(), ...opts);
		this._handleServerResponse(msg, arg);
	}


	// -------------------------------------------------------------------------


	_executeCommandCode(cmd) {
		switch (cmd) {
			case 'run':
				this._handleExecution('doRun');
				return true;
			case 'runWithoutWindow':
				this._handleExecution('doRunWithoutWindow');
				return true;
			case 'stop':
				this._callField('closeProgram');
				this._notifyServer('onStudyProgramClosed');
				return true;
		}
		return false;
	}

	async _handleExecution(method) {
		await this._resetOutputPane();
		const [msg, arg] = await this._callServer(method, this._editor.value());
		this._handleServerResponse(msg, arg);
	}

	_resetOutputPane() {
		this._callField('closeProgram');
		this._outputPane.setMessageReceivable(false);

		return new Promise(resolve => {
			setTimeout(() => {
				this._clearErrorMarker();
				this._outputPane.initialize();
				this._outputPane.setMessageReceivable(true);
				resolve();
			}, 100);
		});
	}

}
