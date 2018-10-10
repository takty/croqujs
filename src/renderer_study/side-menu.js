/**
 *
 * Side Menu
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-10-10
 *
 */


'use strict';


class SideMenu {

	constructor(study, res) {
		this._study = study;
		this._res = res;

		const btn = document.getElementById('btn-menu');
		const mainMenu = document.getElementById('main-menu');
		mainMenu.style.display = 'none';
		this._mainMenu = mainMenu;

		const input = document.createElement('input');
		mainMenu.appendChild(input);
		input.style.position = 'absolute';
		input.style.top = '-100vh';
		this._pseudoFocus = input;

		btn.addEventListener('mousedown', (e) => { e.preventDefault(); });
		btn.addEventListener('mouseup', (e) => {
			if (mainMenu.style.display === 'none') {
				this.open();
			} else {
				this.close();
			}
			e.preventDefault();
		});
		this._setMenuItems(study, mainMenu, res);
	}

	open() {
		this._mainMenu.style.display = 'block';
		this._pseudoFocus.focus();
	}

	close() {
		this._mainMenu.style.display = 'none';
		this._study._editor._comp.focus();
	}

	updateConfig(conf) {
		let mi;
		mi = this._mainMenu.querySelector('[data-menu=showLineNumberByFunction]');
		if (conf.isLineNumberByFunctionEnabled) {
			mi.classList.add('checked');
		} else {
			mi.classList.remove('checked');
		}
		mi = this._mainMenu.querySelector('[data-menu=softWrap]');
		if (conf.softWrap) {
			mi.classList.add('checked');
		} else {
			mi.classList.remove('checked');
		}
	}

	_setMenuItems() {
		const ts = this._mainMenu.querySelectorAll('[data-menu]');
		for (let i = 0; i < ts.length; i += 1) {
			const mId = ts[i].dataset['menu'];
			const str = this._res.menu[mId];
			if (str !== undefined) ts[i].innerText = str;

			if (mId === '_undo') {
				ts[i].addEventListener('mouseup', this._editorCmd('undo'));
			}
			if (mId === '_redo') {
				ts[i].addEventListener('mouseup', this._editorCmd('redo'));
			}
			if (mId === 'selectAll') {
				ts[i].addEventListener('mouseup', this._editorCmd('selectAll'));
			}
			if (mId === 'toggleComment') {
				ts[i].addEventListener('mouseup', this._editorCmd('toggleComment'));
			}
			if (mId === 'format') {
				ts[i].addEventListener('mouseup', this._editorCmd('format'));
			}
			if (mId === 'copyAsImage') {
				ts[i].addEventListener('mouseup', this._studyCmd('sendBackCapturedImages'));
			}



			if (mId === '_zoomIn') {
				ts[i].addEventListener('mouseup', (e) => {
					e.preventDefault();
					let size = this._study.configGetItem('fontSize');
					size = Math.min(64, Math.max(10, size + 2));
					this._study.configSetItem('fontSize', size);
				});
			}
			if (mId === '_zoomOut') {
				ts[i].addEventListener('mouseup', (e) => {
					e.preventDefault();
					let size = this._study.configGetItem('fontSize');
					size = Math.min(64, Math.max(10, size - 2));
					this._study.configSetItem('fontSize', size);
				});
			}
			if (mId === '_zoomReset') {
				ts[i].addEventListener('mouseup', (e) => {
					e.preventDefault();
					this._study.configSetItem('fontSize', 16);
				});
			}

			if (mId === 'lineHeightPlus') {
				ts[i].addEventListener('mouseup', (e) => {
					e.preventDefault();
					let idx = this._study.configGetItem('lineHeightIdx');
					idx = Math.min(4, Math.max(0, idx - 1));
					this._study.configSetItem('lineHeightIdx', idx);
				});
			}
			if (mId === 'lineHeightMinus') {
				ts[i].addEventListener('mouseup', (e) => {
					e.preventDefault();
					let idx = this._study.configGetItem('lineHeightIdx');
					idx = Math.min(4, Math.max(0, idx + 1));
					this._study.configSetItem('lineHeightIdx', idx);
				});
			}
			if (mId === 'lineHeightReset') {
				ts[i].addEventListener('mouseup', (e) => {
					e.preventDefault();
					this._study.configSetItem('lineHeightIdx', 2);
				});
			}

			if (mId === 'softWrap') {
				ts[i].addEventListener('mouseup', (e) => {
					e.preventDefault();
					this.close();
					const f = this._study.configGetItem('softWrap');
					this._study.configSetItem('softWrap', !f);
				});
			}
			if (mId === 'showLineNumberByFunction') {
				ts[i].addEventListener('mouseup', (e) => {
					e.preventDefault();
					this.close();
					const f = this._study.configGetItem('isLineNumberByFunctionEnabled');
					this._study.configSetItem('isLineNumberByFunctionEnabled', !f);
				});
			}
			if (mId === 'toggleOutputPane') {
				ts[i].addEventListener('mouseup', (e) => {
					e.preventDefault();
					this.close();
					this._study.toggleOutputPane();
				});
			}

			if (mId === 'version') {
				ts[i].addEventListener('mouseup', this._studyCmd('showAbout'));
			}

		}
	}

	_studyCmd(cmd) {
		return (e) => {
			e.preventDefault();
			this.close();
			this._study[cmd]();
		};
	}

	_editorCmd(cmd) {
		return (e) => {
			e.preventDefault();
			this.close();
			this._study._editor[cmd]();
		};
	}

}
