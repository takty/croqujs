/**
 *
 * WinState (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2019-01-14
 *
 */


'use strict';

const require_ = (path) => { let r; return () => { return r || (r = require(path)); }; }

const OS       = require_('os');
const ELECTRON = require_('electron');

class WinState {

	constructor(win, quitWindow, suppressRestore, config, key = 'windowState') {
		let resizeTimeout;
		const funcOnResize = this._onResize.bind(this);
		const funcOnClose = this._onClose.bind(this);
		const resizeMoveHandler = () => {
			clearTimeout(resizeTimeout);
			resizeTimeout = setTimeout(funcOnResize, 500);
		};

		this._win = win;
		this._quitWindow = quitWindow;
		this._reader = () => { return config.get(key) || null; };
		this._writer = (state) => { config.set(key, state); };

		this._state = {};
		this._curMode = 'normal';
		this._isMaximizationEvent = false;

		this._initState(suppressRestore);

		win.on('close', funcOnClose);
		win.on('maximize',   () => {this._curMode = 'maximized'; this._isMaximizationEvent = true;});
		win.on('unmaximize', () => {this._curMode = 'normal'; this._restoreState();});
		win.on('minimize',   () => {this._curMode = 'minimized';});
		win.on('restore',    () => {this._curMode = 'normal';});
		win.on('resize',resizeMoveHandler);
		win.on('move', resizeMoveHandler);
	}

	_initState(suppressRestore) {
		const t = JSON.parse(this._reader() || 'null');

		if (t && suppressRestore !== true) {
			this._state = { mode: t.mode, x: t.x, y: t.y, width: t.width, height: t.height };
			this._curMode = this._state.mode;
			if (this._curMode === 'maximized') {
				this._win.maximize();
			} else {
				this._restoreState();
			}
		} else {
			this._dumpState();
		}
	}

	_dumpState() {
		this._state.mode = (this._curMode === 'maximized') ? 'maximized' : 'normal';
		try {
			if (!this._win.isFocused()) return;
			if (this._curMode !== 'normal' || this._win.isFullScreen()) return;

			const bs = this._win.getBounds();
			if (bs.width === 0 || bs.height === 0) return;

			this._state.x      = bs.x;
			this._state.y      = bs.y;
			this._state.width  = bs.width;
			this._state.height = bs.height;
		} catch (e) {
			// in minor case, 'win' is sometimes forced to be closed when processing 'dumpState'.
		}
	}

	_restoreState() {
		if (this._state.width === undefined) return;
		if (this._state.width !== 0 && this._state.height !== 0) {
			this._win.setSize(this._state.width, this._state.height);
		}
		const screen = ELECTRON().screen;
		const { width, height } = screen.getPrimaryDisplay().workAreaSize;
		const minY = (OS().platform() === 'darwin') ? 22 : 0;
		const x = Math.max(0, Math.min(this._state.x, width));
		const y = Math.max(minY, Math.min(this._state.y, height));
		this._win.setPosition(x, y);
	}

	_onResize() {
		if (this._isMaximizationEvent) {  // first resize after maximization event should be ignored
			this._isMaximizationEvent = false;
		} else {  // on MacOS you can resize maximized window, so it's no longer maximized
			if (this._curMode === 'maximized') {
				this._curMode = 'normal';
			}
		}
		this._dumpState();
	}

	_onClose() {
		this._dumpState();
		this._writer(JSON.stringify(this._state));
		if (this._quitWindow) {
			this._win.close();
		}
	}

	isMinimized() {
		return this._curMode === 'minimized';
	}

}

module.exports = WinState;
