/**
 *
 * Field (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-04-18
 *
 */


{
	'use strict';

	const {ipcRenderer} = require('electron');

	class Field {

		constructor(containerSel) {
			this._id = window.location.hash;
			if (this._id) this._id = Number(this._id.replace('#', ''));
			ipcRenderer.on('callFieldMethod', (ev, method, ...args) => {this[method](...args);});

			window.ondragover = window.ondrop = (e) => {e.preventDefault(); return false;};
			this._container = document.querySelector(containerSel);
		}


		// -------------------------------------------------------------------------


		openProgram(url) {
			this._removeFrame();
			this._createFrame(url + '#' + this._id);
		}

		terminateProgram() {
			this._removeFrame();
		}

		_createFrame(url) {
			this._frame = document.createElement('webview');
			this._frame.setAttribute('src', url);
			this._frame.setAttribute('preload', 'injection.js');

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


		// -------------------------------------------------------------------------


		onWindowFullscreenEntered() {
			this._frame.executeJavaScript("document.body.style.overflow='hidden';document.body.scrollTop=0;", false);
		}

		onWindowFullscreenLeft() {
			this._frame.executeJavaScript("document.body.style.overflow='visible';", false);
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
				this._twinMessage('onFieldErrorOccurred', e.args[0]);
			}
		}

		_twinMessage(msg, ...args) {
			ipcRenderer.send('fromRenderer_' + this._id, msg, ...args);
		}

	}

	global.Field = Field;
}
