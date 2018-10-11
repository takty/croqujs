/**
 *
 * Side Menu
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-10-11
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
		mi = this._mainMenu.querySelector('[data-menu=functionLineNumber]');
		if (conf.functionLineNumber) {
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
		const conf = this._study._config;
		const ts = this._mainMenu.querySelectorAll('[data-menu]');
		for (let i = 0; i < ts.length; i += 1) {
			const mId = ts[i].dataset['menu'];
			const str = this._res.menu[mId];
			if (str !== undefined) ts[i].innerText = str;

			if (mId === '_undo') {
				ts[i].addEventListener('mouseup', this._command('undo'));
			}
			if (mId === '_redo') {
				ts[i].addEventListener('mouseup', this._command('redo'));
			}
			if (mId === '_cut') {
				ts[i].addEventListener('mouseup', this._command('cut'));
			}
			if (mId === '_copy') {
				ts[i].addEventListener('mouseup', this._command('copy'));
			}
			if (mId === '_paste') {
				ts[i].addEventListener('mouseup', this._command('paste'));
			}
			if (mId === 'selectAll') {
				ts[i].addEventListener('mouseup', this._command('selectAll'));
			}
			if (mId === 'toggleComment') {
				ts[i].addEventListener('mouseup', this._command('toggleComment'));
			}
			if (mId === 'format') {
				ts[i].addEventListener('mouseup', this._command('format'));
			}
			if (mId === 'copyAsImage') {
				ts[i].addEventListener('mouseup', this._command('copyAsImage'));
			}

			if (mId === '_zoomIn') {
				ts[i].addEventListener('mouseup', this._command('fontSizePlus', false));
			}
			if (mId === '_zoomOut') {
				ts[i].addEventListener('mouseup', this._command('fontSizeMinus', false));
			}
			if (mId === '_zoomReset') {
				ts[i].addEventListener('mouseup', this._command('fontSizeReset', false));
			}
			if (mId === 'lineHeightPlus') {
				ts[i].addEventListener('mouseup', this._command('lineHeightPlus', false));
			}
			if (mId === 'lineHeightMinus') {
				ts[i].addEventListener('mouseup', this._command('lineHeightMinus', false));
			}
			if (mId === 'lineHeightReset') {
				ts[i].addEventListener('mouseup', this._command('lineHeightReset', false));
			}
			if (mId === 'softWrap') {
				ts[i].addEventListener('mouseup', this._command('toggleSoftWrap'));
			}
			if (mId === 'functionLineNumber') {
				ts[i].addEventListener('mouseup', this._command('toggleFunctionLineNumber'));
			}
			if (mId === 'toggleOutputPane') {
				ts[i].addEventListener('mouseup', this._command('toggleOutputPane'));
			}

			if (mId === 'version') {
				ts[i].addEventListener('mouseup', this._command('showAbout'));
			}

		}
	}

	_command(cmd, close = true) {
		return (e) => {
			e.preventDefault();
			this._study.executeCommand(cmd, close);
		};
	}

}
