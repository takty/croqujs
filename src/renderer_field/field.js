/**
 *
 * Field (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-11-20
 *
 */


'use strict';


window.addEventListener('DOMContentLoaded', () => { new Field(); });


class Field {

	constructor() {
		[this._id, ] = window.location.hash.replace('#', '').split(',');

		this._container = document.createElement('div');
		document.body.appendChild(this._container);

		window.ondragover = window.ondrop = (e) => {e.preventDefault(); return false;};

		window.addEventListener('storage', (e) => {
			if ('field_' + this._id !== e.key) return;
			window.localStorage.clear();
			const ma = JSON.parse(e.newValue);
			if (ma.message === 'callFieldMethod' && this[ma.params.method]) {
				this[ma.params.method](...ma.params.args);
			}
		});

		// const fses = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
		// for (let fse of fses) {
		// 	document.addEventListener(fse, () => this.onWindowFullScreenChange(), false);
		// }

		// window.addEventListener('keydown', (e) => { if (e.which === 122) { this.setFullScreen(); } });

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

	// setFullScreen(enabled) {
	// 	if (enabled) {
	// 		const rfs = ['requestFullscreen', 'webkitRequestFullscreen', 'mozRequestFullScreen', 'msRequestFullscreen'];
	// 		for (let rf of rfs) {
	// 			if (document.body[rf] !== undefined) document.body[rf]();
	// 			// console.log(document.body.webkitRequestFullscreen);
	// 		}
	// 	} else {
	// 		const rfs = ['exitFullscreen', 'webkitExitFullscreen', 'mozCancelFullScreen', 'msExitFullscreen'];
	// 		for (let rf of rfs) {
	// 			if (document.body[rf] !== undefined) document.body[rf]();
	// 		}
	// 	}
	// }

	// onWindowFullScreenChange() {
	// 	const fses = ['fullscreenElement', 'webkitCurrentFullScreenElement', 'mozFullScreenElement', 'msFullscreenElement'];
	// 	for (let fse of fses) {
	// 		if (document[fse] !== undefined) {
	// 			console.log(document[fse]);
	// 		}
	// 	}
	// 	console.log('onWindowFullScreenChange');
	// }

	onWindowFullscreenEntered() {
		if (!this._frame) return;
		window.localStorage.setItem('injection_' + this._id, JSON.stringify({ message: 'window-fullscreen-entered' }));
	}

	onWindowFullscreenLeft() {
		if (!this._frame) return;
		window.localStorage.setItem('injection_' + this._id, JSON.stringify({ message: 'window-fullscreen-left' }));
	}

}
