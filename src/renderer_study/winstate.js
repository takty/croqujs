/**
 *
 * WinState (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2019-01-20
 *
 */


'use strict';


class WinState {

	constructor(win, suppressRestore, key = 'winState', config = window.localStorage) {
		this._state = {};
		this._win   = win;

		this._read = () => { const v = config.getItem(key); return v ? JSON.parse(v) : null; };
		this._write = (obj) => { config.setItem(key, JSON.stringify(obj)); };
		this._initialize(suppressRestore);

		window.addEventListener('storage', (e) => {
			if (key !== e.key) return;
			const s = JSON.parse(e.newValue);
			if (this._state.x === s.x && this._state.y === s.y && this._state.width === s.width && this._state.height === s.height) return;
			this._state = s;
			this._restore();
		});
	}

	_initialize(suppressRestore) {
		const POLING_INTERVAL = 500;
		const MINOR_DELAY = 0;

		const t = this._read();
		if (t && suppressRestore !== true) {
			this._state = { x: t.x, y: t.y, width: t.width, height: t.height };
			this._win.addEventListener('load', () => {
				setTimeout(() => { this._restore(); }, MINOR_DELAY);
				setTimeout(inter, POLING_INTERVAL);
			});
		} else {
			this._win.addEventListener('load', () => { setTimeout(inter, POLING_INTERVAL); });
		}
		const inter = () => {
			this._dump();
			setTimeout(inter, POLING_INTERVAL);
		};
	}

	_dump() {
		if (this._win.document.fullscreenElement != null) return;
		if (this._win.outerWidth === 0 || this._win.outerHeight === 0) return;

		const x      = this._win.screenX;
		const y      = this._win.screenY;
		const width  = this._win.outerWidth;
		const height = this._win.outerHeight;
		if (this._state.x === x && this._state.y === y && this._state.width === width && this._state.height === height) return;
		this._state.x      = x;
		this._state.y      = y;
		this._state.width  = width;
		this._state.height = height;
		this._write(this._state);
	}

	_restore() {
		if (this._state.width === undefined) return;
		if (this._state.width !== 0 && this._state.height !== 0) {
			this._win.resizeTo(this._state.width, this._state.height);
		}
		const minX = this._win.screen.availLeft;
		const minY = this._win.screen.availTop;
		const maxX = this._win.screen.availLeft + this._win.screen.availWidth;
		const maxY = this._win.screen.availTop + this._win.screen.availHeight;

		const x = Math.max(minX, Math.min(this._state.x, maxX));
		const y = Math.max(minY, Math.min(this._state.y, maxY));
		this._win.moveTo(x, y);
	}

}
