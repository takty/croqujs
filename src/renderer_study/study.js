/**
 *
 * Study (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-04-28
 *
 */


'use strict';

const electron = require('electron');
const {ipcRenderer} = electron;

const MAX_CONSOLE_OUTPUT_SIZE = 100;


class Study {

	constructor(editorSel, tbarSel) {
		this._id = window.location.hash;
		if(this._id) this._id = Number(this._id.replace('#', ''));
		ipcRenderer.on('callStudyMethod', (ev, method, ...args) => {this[method](...args);});
		ipcRenderer.on('callEditorMethod', (ev, method, ...args) => {this._editor[method](...args);});

		window.ondragover = window.ondrop = (e) => {e.preventDefault(); return false;};

		this._res = ipcRenderer.sendSync('getResource');
		this._errorMarker = null;
		this._outputPane = document.getElementById('output-pane');
		window.onkeydown = (e) => {
			if (this._editor._comp.hasFocus()) return;
			if (e.ctrlKey && e.keyCode == 'A'.charCodeAt(0)) {
				e.preventDefault();
				return false;
			}
		}
		this._msgsCache = [];

		this._initEditor(editorSel);
		this._initToolBar(tbarSel);
		this._initWindowResizing(this._editor, tbarSel, editorSel);
		this.configUpdated(ipcRenderer.sendSync('getConfig'));

		setTimeout(() => {this._editor.refresh();}, 0);  // For making the gutter width correct
		this._initOutputPoller();
	}

	_initEditor(editorSel) {
		this._editor = new Editor(this, document.querySelector(editorSel), this._res.codeMirrorOpt);

		const ec = this._editor.getComponent();
		ec.on('change', () => {
			this._clearErrorMarker();
			if (this._editor.enabled()) this._twinMessage('onStudyModified', this._editor._comp.getDoc().historySize());
		});
		ec.on('drop', (em, ev) => {
			ev.preventDefault();
			if (ev.dataTransfer.files.length > 0) this._twinMessage('onStudyFileDropped', ev.dataTransfer.files[0].path);
		});
	}

	_initToolBar(tbarSel) {
		const addBtn = (id, fun, hint) => {
			const btn = document.querySelector('#' + id);
			btn.addEventListener('click', fun);
			btn.title = hint;
			this._ignoreMouseUpAndDown(btn);
		};
		addBtn('save', () => {this._twinMessage('save');}, this._res.tooltip.save);
		addBtn('exportAsLibrary', () => {this._twinMessage('exportAsLibrary');}, this._res.tooltip.exportAsLibrary);
		addBtn('undo', this._editor.undo.bind(this._editor), this._res.tooltip.undo);
		addBtn('copy', this._editor.copy.bind(this._editor), this._res.tooltip.copy);
		addBtn('paste', this._editor.paste.bind(this._editor), this._res.tooltip.paste);
		addBtn('tile', () => {this._twinMessage('tile');}, this._res.tooltip.tileWinH);
		addBtn('run', () => {this._twinMessage('run');}, this._res.tooltip.run);

		this._ignoreMouseUpAndDown(document.querySelector(tbarSel));
		this._toolBarElm = document.querySelector(tbarSel);
	}

	_ignoreMouseUpAndDown(elm) {
		elm.addEventListener('mousedown', (ev) => {ev.preventDefault();});
		elm.addEventListener('mouseup', (ev) => {ev.preventDefault();});
	}

	_initWindowResizing(ed, tbarSel, editorSel) {
		let subHeight = 100, resizing = false;
		const divH = this._res.divH;
		const jqTbar = $(tbarSel), jqEditor = $(editorSel), jqMain = $('.main'), jqBody = $('body'), jqDiv = $('.ui-resizable-handle');
		const setElementPos = (subH) => {
			const tbH = (jqTbar.css('display') === 'none' ? 0 : jqTbar.height());
			const h =jqBody.height(), edH = h - (tbH + divH + subH);
			jqEditor.height(edH);
			jqMain.height(tbH + edH);
			$('.sub').height(h - (tbH + edH + divH));
			ed.refresh();
		};
		jqMain.resizable({
			autoHide: false, handles: 's', minHeight: 100,
			resize: (e, ui) => {
				const tbH = (jqTbar.css('display') === 'none' ? 0 : jqTbar.height());
				let h = jqBody.height(), mH = ui.element.height(), rem = h - mH;
				if (rem < divH) {
					mH = h - divH;
					rem = divH;
					ui.element.height(mH);
				}
				subHeight = rem - divH;
				jqEditor.height(mH - tbH);
				$('.sub').height(subHeight);
				resizing = true;
				ed.refresh();
			},
			stop: (e, ui) => {
				setElementPos($('.sub').get(0).offsetHeight);
				resizing = false;
				ed.refresh();
			}
		});
		$('.ui-resizable-s').on('mouseup', () => {
			if (resizing) return;
			setElementPos(($('.sub').get(0).offsetHeight === 0) ? subHeight : 0);
		});
		window.addEventListener('resize', () => {
			setElementPos($('.sub').get(0).offsetHeight);
		});
		setElementPos($('.sub').get(0).offsetHeight);
	}

	_initOutputPoller() {
		let lastTime = window.performance.now();
		const loop = (curTime) => {
			if (200 < curTime - lastTime) {
				this._twinMessage('onStudyRequestOutput', MAX_CONSOLE_OUTPUT_SIZE);
				lastTime = curTime;
			}
			window.requestAnimationFrame(loop);
		};
		window.requestAnimationFrame(loop);
	}

	_twinMessage(msg, ...args) {
		ipcRenderer.send('fromRenderer_' + this._id, msg, ...args);
	}

	_twinMessageSync(msg, ...args) {
		return ipcRenderer.sendSync('fromRendererSync_' + this._id, msg, ...args);
	}


	// -------------------------------------------------------------------------


	onPencilEnabled(flag) {
		this._twinMessage('onStudyEnabled', flag);
	}

	onPencilFontSizeChanged(size) {
		this._twinMessage('onStudyFontSizeChanged', size);
	}

	onPencilClipboardChanged() {
		setTimeout(() => {ipcRenderer.send('onClipboardChanged');}, 0);
	}


	// -------------------------------------------------------------------------


	configUpdated(conf) {  // Called By Main Directly
		this._editor.lineWrapping(conf.softWrap);
		this._editor.fontFamily(this._res.fontSets[conf.fontSetIdx]);
		this._editor.rulerEnabled(conf.fontSetIdx === 0);
		this._editor.lineHeight(this._res.lineHeights[conf.lineHeightIdx]);
		this._editor.fontSize(parseInt(conf.fontSize, 10), false);
		this._editor.lineNumberByFunctionEnabled(conf.isLineNumberByFunctionEnabled);

		const pane = document.querySelector('.sub');
		pane.style.fontSize = parseInt(conf.fontSize, 10) + 'px';

		if (!this._jsHintLoaded) {
			const se = document.createElement('script');
			se.src = (conf.languageIdx === 0) ? './lib/jshint.js' : './lib/jshint.ja.js';
			document.getElementsByTagName('head')[0].appendChild(se);
			this._jsHintLoaded = true;
		}
		this._editor.refresh();
	}

	reflectClipboardState(text) {  // Called By Main Directly
		const btn = document.querySelector('#paste');
		if (text.length > 0) {
			btn.classList.remove('unabled');
			btn.title = this._res.tooltip.paste + (text.length > 0 ? ('\n' + text) : '') ;
		} else {
			btn.classList.add('unabled');
			btn.title = this._res.tooltip.paste;
		}
	}

	toggleOutputPane() {  // Called By Main Directly
		const pane = this._outputPane;
		this._outputPaneEnabled(pane.offsetHeight === 0);
	}


	// -------------------------------------------------------------------------


	reflectTwinState(state) {  // Called By Twin
		const ealBtn = document.querySelector('#exportAsLibrary');
		if (state.isFileOpened) ealBtn.classList.remove('unabled');
		else ealBtn.classList.add('unabled');

		const uBtn = document.querySelector('#undo');
		if (state.canUndo) uBtn.classList.remove('unabled');
		else uBtn.classList.add('unabled');
	}

	prepareExecution(selected, nextMethod) {  // Called By Twin
		setTimeout(() => {
			this._clearErrorMarker();
			this._outputPane.innerHTML = '<div></div>';
			const text = selected ? this._editor.selection() : this._editor.value();
			this._twinMessage(nextMethod, text);
		}, 100);
	}

	sendBackText(messageForMain) {  // Called By Twin
		this._twinMessage(messageForMain, this._editor.value());
	}

	clearCurrentState() {  // Called By Twin
		this._clearErrorMarker();
		this._outputPane.innerHTML = '<div></div>';
		this._outputPaneEnabled(false);
	}

	_clearErrorMarker() {
		if (this._errorMarker) {
			this._editor.getComponent().getDoc().removeLineClass(this._errorMarker, 'wrap', 'error-line');
			this._errorMarker = null;
		}
	}

	_outputPaneEnabled(flag) {
		const pane = this._outputPane;
		if ((flag && pane.offsetHeight === 0) || (!flag && pane.offsetHeight > 0)) {
			const ev = document.createEvent('HTMLEvents');
			ev.initEvent('mouseup', true, false);
			const r = document.querySelector('.ui-resizable-s');
			r.dispatchEvent(ev);
		}
		if (flag) setTimeout(() => {pane.scrollTop = pane.scrollHeight}, 100);
	}

	addConsoleOutput(msgs) {  // Called By Twin
		this._msgsCache = this._msgsCache.concat(msgs);
		const fn = () => {
			this._onOutputTimeout = null;
			this._outputs(this._msgsCache.splice(0, 100));
			if (this._msgsCache.length) {
				this._onOutputTimeout = setTimeout(fn, 100);
			}
		};
		if (!this._onOutputTimeout) setTimeout(fn, 100);
	}

	_outputs(msgs) {
		const pane = this._outputPane;
		const inner = this._cloneOutputPaneLines(MAX_CONSOLE_OUTPUT_SIZE - msgs.length);

		for (let m of msgs) {
			let elm = document.createElement('div');
			elm.className = m.type;
			const count = (m.count > 1) ? ('<span class="count">' + m.count + '</span>') : '';
			elm.innerHTML = count + m.msg;
			inner.appendChild(elm);
		}
		pane.replaceChild(inner, pane.firstChild);

		if (this._outputPaneEnabledTimeout) clearTimeout(this._outputPaneEnabledTimeout);
		this._outputPaneEnabledTimeout = setTimeout(() => {
			this._outputPaneEnabled(true);
			this._outputPaneEnabledTimeout = null;
		}, 200);
	}

	addErrorMessage(infoStr, cursorPos, lineNo) {  // Called By Twin
		let msg;
		if (cursorPos && this._editor.isLineNumberByFunctionEnabled()) {
			const lnf = this._editor.getLineNumberByFunction(lineNo - 1);
			msg = infoStr.replace('%lineno%', lnf[0] + ':' + lnf[1]);
		} else {
			msg = infoStr.replace('%lineno%', lineNo);
		}
		const elm = this._outputErrorMessage(msg, 'err');
		if (cursorPos) {
			const doc = this._editor.getComponent().getDoc();
			doc.setCursor(cursorPos.line - 1, cursorPos.col - 1, {scroll: true});
			this._clearErrorMarker();
			this._errorMarker = doc.addLineClass(cursorPos.line - 1, 'wrap', 'error-line');
			elm.addEventListener('click', () => {
				doc.setCursor(cursorPos.line - 1, cursorPos.col - 1, {scroll: true});
				this._editor.getComponent().focus();
			});
			elm.style.cursor = 'pointer';
		}
	}

	_outputErrorMessage(msg, className) {
		const pane = this._outputPane;
		const inner = this._cloneOutputPaneLines(MAX_CONSOLE_OUTPUT_SIZE - 1);
		pane.replaceChild(inner, pane.firstChild);

		const elm = document.createElement('div');
		elm.className = className;
		if (msg.indexOf('<') === -1) {
			elm.appendChild(document.createTextNode(msg));
		} else {
			elm.innerHTML = msg;
		}
		pane.firstChild.appendChild(elm);

		this._outputPaneEnabled(true);
		return elm;
	}

	_cloneOutputPaneLines(keptCount) {
		const inner = this._outputPane.firstChild.cloneNode(true);
		const size = inner.hasChildNodes() ? inner.childNodes.length : 0;
		for (let i = 0, I = Math.min(size, size - keptCount); i < I; i += 1) inner.removeChild(inner.firstChild);
		return inner;
	}


	// -------------------------------------------------------------------------


	sendBackCapturedImages() {  // Called By Twin
		const orig = this._editor.setSimpleView();
		this.showToolbarMessage(this._res.msg.copyingAsImage, true);

		const sf = electron.screen.getPrimaryDisplay().scaleFactor;
		const count = this._editor._comp.getDoc().lineCount();
		const lineHeight = this._editor._comp.defaultTextHeight();
		const logicalImageHeight = lineHeight * count + lineHeight * 0.25;
		const topDelta = lineHeight * 10;

		const bcr = this._editor._elem.getBoundingClientRect();
		const r = {x: bcr.left, y: bcr.top, width: bcr.width, height: bcr.height};

		const canvas = document.createElement('canvas');
		canvas.width = r.width * sf;
		canvas.height = logicalImageHeight * sf;

		this._editor._comp.scrollTo(0, 0);
		this._editor._comp.refresh();
		this._editor.enabled(false);  // After showing modal, it becomes true.

		let top = 0;
		const capture = () => {
			const dataUrl = this._twinMessageSync('onStudyRequestPageCapture', r);
			top += topDelta;
			const finished = (top > logicalImageHeight);

			this._addImageToCanvas(canvas, this._editor._comp.getScrollInfo().top * sf, dataUrl, finished);

			if (finished) {
				this.hideToolbarMessage(200);
				setTimeout(() => {
					this._editor.restoreOriginalView(orig);
					this._editor._comp.scrollTo(0, 0);
				}, 200);
			} else {
				this._editor._comp.scrollTo(0, top);
				this._editor._comp.refresh();
				setTimeout(capture, 200);
			}
		};
		setTimeout(capture, 400);
	}

	_addImageToCanvas(canvas, y, dataUrl, finished) {
		const img = new Image();
		img.onload = () => {
			const ctx = canvas.getContext('2d');
			ctx.drawImage(img, 0, y);
			if (finished) this._twinMessage('onStudyCapturedImageCreated', canvas.toDataURL('image/png'));
		};
		img.src = dataUrl;
	}


	// -------------------------------------------------------------------------


	showToolbarMessage(text, hideShadow = false) {
		if (hideShadow) this._toolBarElm.classList.remove('toolbar-shadow');
		const overwrap = document.querySelector('#toolbar-overwrap');
		const overwrapMsg = document.createTextNode(text);
		overwrap.style.display = 'flex';
		overwrap.appendChild(overwrapMsg);
	}

	hideToolbarMessage(delay = 0) {
		setTimeout(() => {
			if (!this._toolBarElm.classList.contains('toolbar-shadow')) {
				this._toolBarElm.classList.add('toolbar-shadow');
			}
			const overwrap = document.querySelector('#toolbar-overwrap');
			overwrap.style.display = 'none';
			overwrap.removeChild(overwrap.firstChild);
		}, delay);
	}


	// -------------------------------------------------------------------------


	showAlert(text, type) {  // Called By Twin
		this._editor.enabled(false);
		swal({
			title: '', html: text, type: type, animation: 'slide-from-top', allowOutsideClick: false,
		}).then((res) => {
			this._editor.enabled(true);
		});
	}

	showConfirm(text, type, messageForMain) {  // Called By Twin
		this._editor.enabled(false);
		swal({
			title: '', html: text, type: type, showCancelButton: true, confirmButtonText: 'OK', cancelButtonText: this._res.btn.cancel, animation: 'slide-from-top', allowOutsideClick: false,
		}).then((res) => {
			this._editor.enabled(true);
			if (res.value && messageForMain) this._twinMessage(messageForMain);
		});
	}

	showPrompt(text, type, messageForMain, placeholder, defaultValue) {  // Called By Twin
		this._editor.enabled(false);
		swal({
			title: '', html: text, input: 'text', showCancelButton: true, confirmButtonText: 'OK', cancelButtonText: this._res.btn.cancel, inputPlaceholder: placeholder, inputValue: defaultValue, animation: 'slide-from-top', allowOutsideClick: false,
		}).then((res) => {
			this._editor.enabled(true);
			if (res.value && messageForMain) this._twinMessage(messageForMain, res.value);
		});
	}

}
