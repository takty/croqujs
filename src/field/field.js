/**
 * Field
 *
 * @author Takuto Yanagida
 * @version 2026-11-01
 */

import { Lsc } from '../lib/lsc.js';
import { WinState } from '../lib/winstate.js';

window.addEventListener('DOMContentLoaded', () => { new Field(); });

class Field {

	constructor() {
		[this._id, ] = window.location.hash.replace('#', '').split(',');
		this._lsc = new Lsc('#field_' + this._id);
		this._winstate = new WinState(window, '$winstate_field');

		this._container = document.createElement('div');
		document.body.appendChild(this._container);

		window.ondragover = window.ondrop = (e) => { e.preventDefault(); return false; };
		this._lsc.listen(ma => {
			if (ma.message === 'callFieldMethod' && this[ma.params.method]) {
				this[ma.params.method](...ma.params.args);
			}
		});
		window.addEventListener('keydown', (e) => this.onKeyDown(e));
		window.addEventListener('message', event => {
			if (event.origin !== location.origin || event.source !== window.opener) return;
			if (event.data?.type !== 'croqujs-field-ping' || event.data.id !== this._id) return;
			event.source.postMessage({ type: 'croqujs-field-ready', id: this._id }, event.origin);
		});
		this.initializeFullscreenPoller();
	}

	openProgram(url) {
		this.closeProgram();
		this._frame = document.createElement('iframe');
		this._frame.setAttribute('src', url);
		this._frame.addEventListener('load', () => {
			this._frame.contentWindow.addEventListener('keydown', (e) => this.onKeyDown(e));
		});
		this._container.appendChild(this._frame);
	}

	closeProgram() {
		if (!this._frame) return;
		try {
			this._container.removeChild(this._frame);
		} catch (e) {
			console.error(e);
		}
		this._frame = null;
	}

	alignWindow(x, y, width, height) {
		window.moveTo(x, y);
		window.resizeTo(width, height);
	}

	onKeyDown(e) {  // Called also from injection.js
		if (e.key === 'F11' || (e.ctrlKey && e.metaKey && e.key === 'f')) {  // F11, Cmd+Ctrl+F
			e.preventDefault();
			this.setFullscreenEnabled(!this._isFullscreenEnabled);
		} else if ((e.ctrlKey || e.metaKey) && e.key === 't') {  // Ctrl+T, Cmd+T
			this.closeProgram();
			window.close();
		} else if (e.key === 'F12') {
			this._lsc.send('#study_' + this._id, { message: 'toggleDevTools' });
		}
	}

	// -------------------------------------------------------------------------

	initializeFullscreenPoller() {
		this._isFullscreenEnabled = false;
		let last = window.performance.now();
		const loop = (cur) => {
			if (200 < cur - last) {
				const f = this.isFullscreenEnabled();
				if (f && !this._isFullscreenEnabled) {
					this.onFullscreenEntered();
				} else if (!f && this._isFullscreenEnabled) {
					this.onFullscreenLeft();
				}
				last = cur;
			}
			window.requestAnimationFrame(loop);
		};
		window.requestAnimationFrame(loop);
	}

	setFullscreenEnabled(enabled) {
		const f = this._isFullscreenEnabled;
		if (enabled && !f) {
			for (let f of ['requestFullscreen', 'webkitRequestFullscreen']) {
				if (document.body[f] !== undefined) document.body[f]();
			}
			this.onFullscreenEntered();
		} else if (!enabled && f) {
			for (let f of ['exitFullscreen', 'webkitExitFullscreen']) {
				if (document[f] !== undefined) document[f]();
			}
			this.onFullscreenLeft();
		}
	}

	isFullscreenEnabled() {
		for (let p of ['fullscreenElement', 'webkitCurrentFullScreenElement']) {
			if (document[p] !== undefined && document[p] !== null) return true;
		}
		return false;
	}

	onFullscreenEntered() {
		if (this._isFullscreenEnabled) return;
		this._isFullscreenEnabled = true;
		if (!this._frame) return;
		this._lsc.send('#injection_' + this._id, { message: 'window-fullscreen-entered' });
	}

	onFullscreenLeft() {
		if (!this._isFullscreenEnabled) return;
		this._isFullscreenEnabled = false;
		if (!this._frame) return;
		this._lsc.send('#injection_' + this._id, { message: 'window-fullscreen-left' });
	}

}
