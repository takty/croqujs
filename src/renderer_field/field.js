/**
 *
 * Field (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-05-29
 *
 */


{
	'use strict';
	
	class Field {
		
		constructor(containerSel) {
			this._id = window.location.hash.replace('#', '');
			this._container = document.querySelector(containerSel);

			window.ondragover = window.ondrop = (e) => {e.preventDefault(); return false;};

			window.addEventListener('storage', (e) => {
				if ('field_' + this._id !== e.key) return;
				window.localStorage.clear();
				const ma = JSON.parse(e.newValue);
				if (ma.message === 'callFieldMethod' && this[ma.params.method]) {
					this[ma.params.method](...ma.params.args);
				}
			});
		}

		openProgram(url) {
			this.closeProgram();

			this._frame = document.createElement('iframe');
			this._frame.setAttribute('src', url);
			this._container.appendChild(this._frame);
		}

		closeProgram() {
			if (!this._frame) return;
			try {
				this._container.removeChild(this._frame);
			} catch (e) { }
			this._frame = null;
		}

		onWindowFullscreenEntered() {
			if (!this._frame) return;
			window.localStorage.setItem('injection_' + this._id, JSON.stringify({ message: 'window-fullscreen-entered' }));
		}

		onWindowFullscreenLeft() {
			if (!this._frame) return;
			window.localStorage.setItem('injection_' + this._id, JSON.stringify({ message: 'window-fullscreen-left' }));
		}
	
	}

	global.Field = Field;
}
