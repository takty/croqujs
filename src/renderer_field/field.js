/*
 * Field
 * 2016-08-18
 */

{
	'use strict';

	const {ipcRenderer} = require('electron');

	const HTML_HEAD1 = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">';
	const HTML_HEAD2 = '</head><body><script>';
	const HTML_FOOT  = '</script></body>';

	class Field {

		constructor(containerSel) {
			this._id = window.location.hash;
			if (this._id) this._id = Number(this._id.replace('#', ''));
			ipcRenderer.on('callFieldMethod', (ev, method, ...args) => {this[method](...args);});

			window.ondragover = window.ondrop = (e) => {e.preventDefault(); return false;};
			this._container = document.querySelector(containerSel);
			this._urlToFileName = {};
		}

		_twinMessage(msg, ...args) {
			ipcRenderer.send('fromRenderer_' + this._id, msg, ...args);
		}


		// -------------------------------------------------------------------------


		executeProgram(codeStr, filePath, imports) {
			this._removeFrame();
			this._createSource(codeStr, imports, this._urlToFileName);
			this._createFrame(this._url + '#' + this._id);
		}

		terminateProgram() {
			this._removeFrame();
		}

		_createFrame(url) {
			this._frame = document.createElement('webview');
			this._frame.setAttribute('src', url);
			this._frame.setAttribute('preload', 'doping.js');

			this._container.appendChild(this._frame);
			this._frame.addEventListener('ipc-message', (e) => {this._onIpcMessage(e);});
		}

		_removeFrame() {
			if (!this._frame) return;
			try {
				this._container.removeChild(this._frame);
			} catch (e) {}
			this._frame = null;
		}

		_createSource(codeStr, imports, urlToFileName) {
			const urls = imports.map((ld) => {
				if (ld.source) {
					const url = window.URL.createObjectURL(new Blob([ld.source], {type: 'application/javascript'}));
					urlToFileName[url] = ld.desc;
					return url;
				} else {
					const i = ld.desc.lastIndexOf('/');
					urlToFileName[ld.desc] = (i !== -1) ? ld.desc.substring(i) : ld.desc;
					return ld.desc;
				}
			});
			const tagStr = urls.map((e) => {return '<script src="' + e + '"></script>';}).join('');
			this._libStrLength = tagStr.length;
			const blob = new Blob([HTML_HEAD1, tagStr, HTML_HEAD2, codeStr, HTML_FOOT], {type: 'text/html'});
			this._url = window.URL.createObjectURL(blob);
		}


		// -------------------------------------------------------------------------


		onWindowFullscreenEntered() {
			this._frame.executeJavaScript(`document.body.style.overflow = 'hidden'; document.body.scrollTop = 0;`, false);
		}

		onWindowFullscreenLeft() {
			this._frame.executeJavaScript(`document.body.style.overflow = 'visible';`, false);
		}

		toggleDevTools() {
			if (!this._frame) return;
			if (this._frame.isDevToolsOpened()) {
				this._frame.closeDevTools();
			} else {
				this._frame.openDevTools();
			}
		}


		// -------------------------------------------------------------------------


		_onIpcMessage(e) {
			if (e.channel === 'error') {
				const [info] = e.args;
				info.userCodeUrl = this._url;
				info.urlFileName = this._urlToFileName[info.url];
				if (info.line === 1) info.col -= (HTML_HEAD1.length + this._libStrLength + HTML_HEAD2.length);
				this._twinMessage('onFieldErrorOccurred', info);
			}
		}

	}

	global.Field = Field;
}
