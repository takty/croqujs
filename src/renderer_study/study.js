/**
 *
 * Study (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2019-03-28
 *
 */


'use strict';

const { ipcRenderer } = require('electron');


class Study {

	constructor() {
		this._errorMarker = null;
		this._id = window.location.hash;
		if (this._id) this._id = this._id.replace('#', '');
		ipcRenderer.on('callStudyMethod', (ev, method, ...args) => { this[method](...args); });

		window.ondragover = (e) => { e.preventDefault(); return false; };
		window.ondrop     = (e) => { e.preventDefault(); return false; };
		window.onkeydown  = (e) => {
			if (!this._editor._comp.hasFocus() && e.ctrlKey && e.keyCode === 'A'.charCodeAt(0)) {
				e.preventDefault();
				return false;
			}
		}
		this._config = new Config({ fontSize: 16, lineHeight: 165, softWrap: false, functionLineNumber: false, language: 'ja' });
		this._config.addEventListener((conf) => this._configUpdated(conf));
		this._winstate = new WinState(window, 'winstate_study');
		this._lang = this._config.getItem('language');
		if (!this._lang) this._lang = 'ja';

		loadJSON(['res/lang.' + this._lang + '.json', 'res/resource.json'], (ret) => {
			this._res = Object.assign(ret[0], ret[1]);
			this._constructorSecond();
		});
	}

	_twinMessage(msg, ...args) {
		ipcRenderer.send('fromRenderer_' + this._id, msg, ...args);
	}

	_constructorSecond() {
		this._initEditor();

		this._toolbar    = new Toolbar(this, this._res);
		this._sideMenu   = new SideMenu(this, this._res);
		this._dialogBox  = new DialogBox(this, this._res);
		this._outputPane = new OutputPane();

		this._filePath    = null;
		this._name        = null;
		this._baseName    = null;
		this._dirName     = null;
		this._isReadOnly  = false;
		this._isModified  = false;
		this._historySize = { undo: 0, redo: 0 };

		this._initWindowResizing(this._editor);

		window.addEventListener('storage', (e) => {
			if ('study_' + this._id !== e.key) return;
			window.localStorage.removeItem(e.key);
			const ma = JSON.parse(e.newValue);
			if (ma.message === 'error') {
				this._twinMessage('onStudyErrorOccurred', ma.params);
				this.addErrorMessage(ma.params);
			} else if (ma.message === 'output') {
				this._outputPane.addOutput(ma.params);
			}
		});
		window.addEventListener('focus', (e) => {
			navigator.clipboard.readText().then(clipText => this._reflectClipboardState(clipText));
		});
		setTimeout(() => { navigator.clipboard.readText().then(clipText => this._reflectClipboardState(clipText)); }, 200);
		setTimeout(() => { this._editor.refresh(); }, 0);  // For making the gutter width correct

		this._config.notify();
	}

	_callFieldMethod(method, ...args) {
		window.localStorage.setItem('field_' + this._id, JSON.stringify({ message: 'callFieldMethod', params: { method: method, args: args } }));
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
		const analyze = createDelayFunction(() => { w.postMessage(ec.getValue()); }, 400);

		ec.on('change', () => {
			this._clearErrorMarker();
			if (this._editor.enabled()) {
				this._isModified  = true;
				this._historySize = this._editor._comp.getDoc().historySize();
				this._twinMessage('onStudyModified');
				this._reflectState();
			}
			analyze();
		});
		ec.on('drop', (em, ev) => {
			ev.preventDefault();
			if (ev.dataTransfer.files.length > 0) {
				const filePath = ev.dataTransfer.files[0].path;
				this._checkCanDiscard(this._res.msg.confirmOpen, 'doFileDropped', filePath);
			}
		});
		ec.on('focus', () => { this._sideMenu.close(); });
		ec.on('copy', (cm, ev) => { this._reflectClipboardState(cm.getDoc().getSelection()); });
		ec.on('cut',  (cm, ev) => { this._reflectClipboardState(cm.getDoc().getSelection()); });
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


	// -------------------------------------------------------------------------


	_configUpdated(conf) {
		this._lang = conf.language;

		this._editor.lineWrapping(conf.softWrap);
		this._editor.lineHeight(parseInt(conf.lineHeight, 10) + '%');
		this._editor.fontSize(parseInt(conf.fontSize, 10));
		this._editor.functionLineNumberEnabled(conf.functionLineNumber);

		const pane = document.querySelector('.sub');
		pane.style.fontSize = parseInt(conf.fontSize, 10) + 'px';

		if (!this._jsHintLoaded) {
			const se = document.createElement('script');
			se.src = './lib/jshint/' + (this._lang === 'en' ? 'jshint.js' : 'jshint-ja-edu.js');
			document.getElementsByTagName('head')[0].appendChild(se);
			this._jsHintLoaded = true;
		}
		this._editor.refresh();
		this._sideMenu.reflectConfig(conf);
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


	initializeDocument(text, filePath, name, baseName, dirName, readOnly) {  // Called By Twin
		this._filePath   = filePath;
		this._name       = name;
		this._baseName   = baseName;
		this._dirName    = dirName;
		this._isReadOnly = readOnly;
		this._isModified = false;
		this._reflectState();

		this._editor.enabled(false);
		this._editor.value(text);
		this._editor.readOnly(readOnly);
		this._editor.enabled(true);

		this._clearErrorMarker();
		this._outputPane.initialize();
		this._updateWindowTitle();
	}

	setDocumentFilePath(filePath, name, baseName, dirName, readOnly) {  // Called By Twin
		this._filePath   = filePath;
		this._name       = name;
		this._baseName   = baseName;
		this._dirName    = dirName;
		this._isReadOnly = readOnly;
		this._isModified = false;
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
			this._twinMessage('onStudyTitleChanged', title);
		}
	}

	openProgram(url) {
		this._callFieldMethod('openProgram', url);
	}

	addErrorMessage(info) {  // Called By Twin
		let msg;
		if (info.library) {
			msg = this._res.msg.cannotReadLibrary.replace('%s', info.msg);
		} else {
			const file = info.isUserCode ? '' : `(${info.fileName}) `;
			const transMsg = new ErrorTranslator(this._lang).translate(info.msg);
			msg = `${file}%lineno% [${info.col}] - ${transMsg}`;
			if (info.isUserCode && this._editor.isFunctionLineNumberEnabled()) {
				const lnf = this._editor.getFunctionLineNumber(info.line - 1);
				msg = msg.replace('%lineno%', lnf[0] + ':' + lnf[1]);
			} else {
				msg = msg.replace('%lineno%', info.line);
			}
		}
		if (info.isUserCode) {
			const doc = this._editor.getComponent().getDoc();
			const jump = () => {
				doc.setCursor(info.line - 1, info.col - 1, { scroll: true });
				this._editor.getComponent().focus();
			};
			this._outputPane.setError(msg, 'err', jump);
			this._clearErrorMarker();
			this._errorMarker = doc.addLineClass(info.line - 1, 'wrap', 'error-line');
			jump();
		} else {
			this._outputPane.setError(msg, 'err');
		}
	}

	_clearErrorMarker() {
		if (this._errorMarker) {
			this._editor.getComponent().getDoc().removeLineClass(this._errorMarker, 'wrap', 'error-line');
			this._errorMarker = null;
		}
	}


	// -------------------------------------------------------------------------


	sendBackCapturedImages() {
		const orig = this._editor.setSimpleView();
		this._toolbar.showMessage(this._res.msg.copyingAsImage, true);

		const count = this._editor._comp.getDoc().lineCount();
		const lineHeight = this._editor._comp.defaultTextHeight();
		const logicalImageHeight = lineHeight * count + lineHeight * 0.25;
		const topDelta = lineHeight * 10;

		const bcr = this._editor._elem.getBoundingClientRect();
		const r = {x: bcr.left | 0, y: bcr.top | 0, width: bcr.width | 0, height: bcr.height | 0};

		this._editor._comp.scrollTo(0, 0);
		this._editor._comp.refresh();
		this._editor.enabled(false);  // After showing modal, it becomes true.

		let canvas = null;
		let top = 0;

		const capture = () => { this._twinMessage('onStudyRequestPageCapture', r); };
		setTimeout(capture, 400);

		this.capturedImageReceived = (dataUrl, scaleFactor) => {  // Called By Twin
			if (canvas === null) {
				canvas = document.createElement('canvas');
				canvas.width = r.width * scaleFactor;
				canvas.height = logicalImageHeight * scaleFactor;
			}
			top += topDelta;
			const finished = (top > logicalImageHeight);

			setTimeout(() => {
				addImageToCanvas(canvas, this._editor._comp.getScrollInfo().top * scaleFactor, dataUrl, finished);

				if (finished) {
					this._toolbar.hideMessage(200);
					setTimeout(() => {
						this._editor.restoreOriginalView(orig);
						this._editor._comp.scrollTo(0, 0);
					}, 200);
				} else {
					this._editor._comp.scrollTo(0, top);
					this._editor._comp.refresh();
					setTimeout(capture, 200);
				}
			}, 0);
		}

		const addImageToCanvas = (canvas, y, dataUrl, finished) => {
			const img = new Image();
			img.onload = () => {
				const ctx = canvas.getContext('2d');
				ctx.drawImage(img, 0, y);
				if (finished) this._twinMessage('onStudyCapturedImageCreated', canvas.toDataURL('image/png'));
			};
			img.src = dataUrl;
		};
	}


	// -------------------------------------------------------------------------


	showServerAlert(mid, type, additional = false) {  // Called By Twin
		window.focus();
		const text = this._res.msg[mid] + (additional ? additional : '');
		this._dialogBox.showAlert(text, type);
	}

	_showAlert(text, type) {
		window.focus();
		this._dialogBox.showAlert(text, type);
	}

	_showConfirm(text, type, messageForMain, ...args) {
		window.focus();
		this._dialogBox.showConfirm(text, type, () => {
			if (messageForMain) this._twinMessage(messageForMain, ...args);
		});
	}

	_showPrompt(text, type, placeholder, value, optText, messageForMain, ...args) {
		window.focus();
		this._dialogBox.showPromptWithOption(text, type, placeholder, value, optText, (resVal, resOpt) => {
			if (messageForMain) this._twinMessage(messageForMain, resVal, resOpt, ...args);
		});
	}


	// -------------------------------------------------------------------------


	_checkCanDiscard(msg, returnMsg, ...args) {
		if (this._isModified) {
			this._showConfirm(msg, 'warning', returnMsg, ...args);
		} else {
			this._twinMessage(returnMsg, ...args);
		}
	}

	_prepareExecution(nextMethod) {
		this._outputPane.setMessageReceivable(false);
		this._callFieldMethod('closeProgram');

		setTimeout(() => {
			this._clearErrorMarker();
			this._outputPane.initialize();
			this._twinMessage(nextMethod, this._editor.value());
			this._outputPane.setMessageReceivable(true);
		}, 100);
	}

	executeCommand(cmd, close = true) {
		if (close) this._sideMenu.close();
		this._editor.setLineSelectionMode(false);

		setTimeout(() => {
			const conf = this._config;

			// File Command

			if (cmd === 'new') {
				this._checkCanDiscard(this._res.msg.confirmNew, '_initializeDocument');
			} else if (cmd === 'open') {
				this._checkCanDiscard(this._res.msg.confirmOpen, 'doOpen');
			} else if (cmd === 'save') {
				this._twinMessage('doSave', this._editor.value(), this._res.dialogTitle.saveAs);
			} else if (cmd === 'saveAs') {
				this._twinMessage('doSaveAs', this._editor.value(), this._res.dialogTitle.saveAs);
			} else if (cmd === 'saveCopy') {
				this._twinMessage('doSaveCopy', this._editor.value(), this._res.dialogTitle.saveCopy);
			} else if (cmd === 'close') {
				this._checkCanDiscard(this._res.msg.confirmExit, 'doClose', this._editor.value());

			} else if (cmd === 'exportAsLibrary') {
				const cs = JSON.stringify(this._codeStructure);
				this._showPrompt(this._res.msg.enterLibraryName, '', this._res.msg.libraryName, this._name, this._res.msg.includeUsedLibraries, 'doExportAsLibrary', this._editor.value(), cs);
			} else if (cmd === 'exportAsWebPage') {
				this._twinMessage('doExportAsWebPage', this._editor.value());

			} else if (cmd === 'setLanguageJa') {
				conf.setItem('language', 'ja');
				this._showAlert(this._res.msg.alertNextTime, 'info');
			} else if (cmd === 'setLanguageEn') {
				conf.setItem('language', 'en');
				this._showAlert(this._res.msg.alertNextTime, 'info');
			}

			// Edit Command

			if (cmd === 'undo') {
				this._editor.undo();
			} else if (cmd === 'redo') {
				this._editor.redo();

			} else if (cmd === 'cut') {
				this._editor.cut();
			} else if (cmd === 'copy') {
				this._editor.copy();
			} else if (cmd === 'paste') {
				this._editor.paste();
			} else if (cmd === 'selectAll') {
				this._editor.selectAll();

			} else if (cmd === 'toggleComment') {
				this._editor.toggleComment();
			} else if (cmd === 'format') {
				this._editor.format();

			} else if (cmd === 'find') {
				this._editor.find();
			} else if (cmd === 'findNext') {
				this._editor.findNext();
			} else if (cmd === 'replace') {
				this._editor.replace();

			} else if (cmd === 'copyAsImage') {
				this.sendBackCapturedImages();
			}

			// Code Command

			if (cmd === 'run') {
				this._prepareExecution('doRun');
			} else if (cmd === 'stop') {
				this._callFieldMethod('closeProgram');
				this._twinMessage('stop');
			} else if (cmd === 'runWithoutWindow') {
				this._prepareExecution('doRunWithoutWindow');
			}

			// View Command

			if (cmd === 'tileWin') {
				const x = window.screen.availLeft, y = window.screen.availTop;
				const w = window.screen.availWidth / 2, h = window.screen.availHeight;
				window.moveTo(x, y);
				window.resizeTo(w, h);
				this._callFieldMethod('alignWindow', x + w, y, w, h);
			} else if (cmd === 'fontSizePlus') {
				const size = Math.min(64, Math.max(10, conf.getItem('fontSize') + 2));
				conf.setItem('fontSize', size);
			} else if (cmd === 'fontSizeMinus') {
				const size = Math.min(64, Math.max(10, conf.getItem('fontSize') - 2));
				conf.setItem('fontSize', size);
			} else if (cmd === 'fontSizeReset') {
				conf.setItem('fontSize', 16);

			} else if (cmd === 'lineHeightPlus') {
				const lh = Math.min(195, Math.max(135, conf.getItem('lineHeight') + 15));
				conf.setItem('lineHeight', lh);
			} else if (cmd === 'lineHeightMinus') {
				const lh = Math.min(195, Math.max(135, conf.getItem('lineHeight') - 15));
				conf.setItem('lineHeight', lh);
			} else if (cmd === 'lineHeightReset') {
				conf.setItem('lineHeight', 165);

			} else if (cmd === 'toggleSoftWrap') {
				conf.setItem('softWrap', !conf.getItem('softWrap'));
			} else if (cmd === 'toggleFunctionLineNumber') {
				conf.setItem('functionLineNumber', !conf.getItem('functionLineNumber'));
			} else if (cmd === 'toggleOutputPane') {
				this._outputPane.toggle();
			}

			// Help Command

			if (cmd === 'showAbout') {
				this._showAlert(this._res.about.join('\n'), 'info');
			}
		}, 0);
	}

}
