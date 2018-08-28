/**
 *
 * Study (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-08-28
 *
 */


'use strict';

const electron = require('electron');
const {ipcRenderer} = electron;

const MAX_CONSOLE_OUTPUT_SIZE = 100;

function createDelayFunction(fn, delay) {
	let st = null;
	function ret() {
		if (st) clearTimeout(st);
		st = setTimeout(fn, delay);
	}
	ret.cancel = function () {
		if (st) clearTimeout(st);
		st = null;
	}
	return ret;
}


class Study {

	constructor(editorSel, tbarSel) {
		this._id = window.location.hash;
		if (this._id) this._id = this._id.replace('#', '');
		ipcRenderer.on('callStudyMethod',  (ev, method, ...args) => { this[method](...args); });
		ipcRenderer.on('callEditorMethod', (ev, method, ...args) => { this._editor[method](...args); });

		window.ondragover = window.ondrop = (e) => { e.preventDefault(); return false; };

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

		setTimeout(() => { this._editor.refresh(); }, 0);  // For making the gutter width correct
		this._initOutputPoller();

		window.addEventListener('storage', (e) => {
			if ('study_' + this._id !== e.key) return;
			window.localStorage.clear();
			const ma = JSON.parse(e.newValue);
			if (ma.message === 'error') {
				this._twinMessage('onFieldErrorOccurred', ma.params);
			} else if (ma.message === 'output') {
				this._twinMessage('onFieldOutputOccurred', ma.params);
			}
		});
		ipcRenderer.on('callFieldMethod', (ev, method, ...args) => {
			window.localStorage.setItem('field_' + this._id, JSON.stringify({ message: 'callFieldMethod', params: {method: method, args: args} }));
		});
	}

	_initEditor(editorSel) {
		this._editor = new Editor(this, document.querySelector(editorSel), this._res.codeMirrorOpt);
		const ec = this._editor.getComponent();

		const w = new Worker('analyzer.js');
		w.addEventListener('message', (e) => {
			this._codeStructure = e.data;
			this._editor.setCodeStructureData(this._codeStructure);
		}, false);
		const analize = createDelayFunction(() => {
			w.postMessage(ec.getValue());
		}, 400);

		ec.on('change', () => {
			this._clearErrorMarker();
			if (this._editor.enabled()) {
				this._twinMessage('onStudyModified', this._editor._comp.getDoc().historySize());
			}
			analize();
		});
		ec.on('drop', (em, ev) => {
			ev.preventDefault();
			if (ev.dataTransfer.files.length > 0) this._twinMessage('onStudyFileDropped', ev.dataTransfer.files[0].path);
		});
	}

	_initToolBar(tbarSel) {
		this._toolBarElm = document.querySelector(tbarSel);
		this._toolBarElm.addEventListener('mousedown', (ev) => { ev.preventDefault(); });
		this._toolBarElm.addEventListener('mouseup',   (ev) => { ev.preventDefault(); });

		const addBtn = (id, fun, hint) => {
			const btn = document.querySelector('#' + id);
			btn.title = hint;
			btn.addEventListener('mousedown', (ev) => { ev.preventDefault(); });
			btn.addEventListener('mouseup',   (ev) => { ev.preventDefault(); fun(); });
		};
		addBtn('save',            () => {this._twinMessage('save');},            this._res.tooltip.save);
		addBtn('exportAsLibrary', () => {this._twinMessage('exportAsLibrary');}, this._res.tooltip.exportAsLibrary);
		addBtn('tile',            () => {this._twinMessage('tile');},            this._res.tooltip.tileWinH);
		addBtn('run',             () => {this._twinMessage('run');},             this._res.tooltip.run);
		addBtn('undo',  this._editor.undo.bind(this._editor),  this._res.tooltip.undo);
		addBtn('copy',  this._editor.copy.bind(this._editor),  this._res.tooltip.copy);
		addBtn('paste', this._editor.paste.bind(this._editor), this._res.tooltip.paste);
	}

	_initWindowResizing(ed, tbarSel, editorSel) {
		const body   = document.querySelector('body');
		const main   = document.querySelector('.main');
		const tbar   = document.querySelector(tbarSel);
		const editor = document.querySelector(editorSel);
		const div    = document.querySelector('#handle');
		const sub    = document.querySelector('.sub');

		const tbarH  = tbar.offsetHeight;
		const divH   = this._res.divH;

		let mouseDown = false, resizing = false;
		let subH = 100, py;

		const setSubPaneHeight = (subH) => {
			const h   = body.offsetHeight;
			const edH = h - (tbarH + divH + subH);
			editor.style.height = edH + 'px';
			main.style.height   = (tbarH + edH) + 'px';
			sub.style.height    = subH + 'px';
			ed.refresh();
		};
		const onMouseMoveDiv = (e) => {
			if (!mouseDown) return;
			const h = body.offsetHeight;
			const mainH = e.pageY - py;

			let subH = h - (mainH + divH);
			if (mainH - tbarH < 100) subH = h - (tbarH + 100 + divH);
			if (subH < 32) subH = 0;
			setSubPaneHeight(subH);
			resizing = true;
			e.preventDefault();
		};
		const onMouseUpDiv = (e) => {
			if (!mouseDown) return;
			mouseDown = false;
			if (sub.offsetHeight > 32) subH = sub.offsetHeight;
			e.preventDefault();
		};
		div.addEventListener('mousedown', (e) => {
			py = e.pageY - div.offsetTop;
			mouseDown = true;
			resizing = false;
		});
		div.addEventListener('mousemove', onMouseMoveDiv);
		div.addEventListener('mouseup', onMouseUpDiv);
		div.addEventListener('click', () => { if (!resizing) setSubPaneHeight(sub.offsetHeight === 0 ? subH : 0); });

		document.body.addEventListener('mousemove', onMouseMoveDiv);
		document.body.addEventListener('mouseup', onMouseUpDiv);
		document.body.addEventListener('mouseenter', (e) => { if (mouseDown && !e.buttons) mouseDown = false; });

		window.addEventListener('resize', () => { setSubPaneHeight(sub.offsetHeight); });
		setSubPaneHeight(sub.offsetHeight);
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
			se.src = './lib/jshint/' + ((conf.languageIdx === 0) ? 'jshint.js' : 'jshint-ja-edu.js');
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

	sendBackTextWithCodeStructure(messageForMain) {  // Called By Twin
		const cs = JSON.stringify(this._codeStructure);
		this._twinMessage(messageForMain, this._editor.value(), cs);
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
			ev.initEvent('click', true, false);
			const r = document.querySelector('#handle');
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
