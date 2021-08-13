/**
 *
 * Field (JS)
 *
 * @author Takuto Yanagida
 * @version 2021-08-13
 *
 */


'use strict';


window.addEventListener('DOMContentLoaded', () => { new Field(); });


class Field {

	constructor() {
		[this._id, ] = window.location.hash.replace('#', '').split(',');
		this._msg_id = '#field_' + this._id;
		this._winstate = new WinState(window, '$winstate_field');

		this._container = document.createElement('div');
		document.body.appendChild(this._container);

		window.ondragover = window.ondrop = (e) => { e.preventDefault(); return false; };
		window.addEventListener('storage', () => {
			const v = window.localStorage.getItem(this._msg_id);
			if (!v) return;
			window.localStorage.removeItem(this._msg_id);
			const ma = JSON.parse(v);

			if (ma.message === 'callFieldMethod' && this[ma.params.method]) {
				this[ma.params.method](...ma.params.args);
			}
		});
		window.addEventListener('keydown', (e) => this.onKeyDown(e));
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
			window.localStorage.setItem('#study_' + this._id, JSON.stringify({ message: 'toggleDevTools' }));
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
		window.localStorage.setItem('#injection_' + this._id, JSON.stringify({ message: 'window-fullscreen-entered' }));
	}

	onFullscreenLeft() {
		if (!this._isFullscreenEnabled) return;
		this._isFullscreenEnabled = false;
		if (!this._frame) return;
		window.localStorage.setItem('#injection_' + this._id, JSON.stringify({ message: 'window-fullscreen-left' }));
	}

}
