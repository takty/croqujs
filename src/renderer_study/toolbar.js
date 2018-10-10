/**
 *
 * Toolbar
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-10-10
 *
 */


'use strict';


class Toolbar {

	constructor(study, res, selector) {
		this._study = study;
		this._res   = res;

		this._elm = document.querySelector(selector);
		this._elm.addEventListener('mousedown', (e) => { e.preventDefault(); });
		this._elm.addEventListener('mouseup',   (e) => { e.preventDefault(); });

		this._addTwinBtn('save');
		this._addTwinBtn('exportAsLibrary');
		this._addTwinBtn('tileWin');
		this._addTwinBtn('run');
		this._addEditorBtn('undo');
		this._addEditorBtn('copy');
		this._addEditorBtn('paste');
	}

	_addTwinBtn(id) {
		const btn = document.querySelector('#btn-' + id);
		btn.title = this._res.tooltip[id];
		btn.addEventListener('mousedown', (e) => { e.preventDefault(); });
		btn.addEventListener('mouseup', (e) => {
			e.preventDefault();
			this._study._sideMenu.close();
			this._study._twinMessage(id);
		});
	}

	_addEditorBtn(id) {
		const btn = document.querySelector('#btn-' + id);
		btn.title = this._res.tooltip[id];
		btn.addEventListener('mousedown', (e) => { e.preventDefault(); });
		btn.addEventListener('mouseup', (e) => {
			e.preventDefault();
			this._study._sideMenu.close();
			this._study._editor[id]();
		});
	}

	showMessage(text, hideShadow = false) {
		if (hideShadow) this._elm.classList.remove('toolbar-shadow');
		const overwrap = document.querySelector('#toolbar-overwrap');
		const overwrapMsg = document.createTextNode(text);
		overwrap.style.display = 'flex';
		overwrap.appendChild(overwrapMsg);
	}

	hideMessage(delay = 0) {
		setTimeout(() => {
			if (!this._elm.classList.contains('toolbar-shadow')) {
				this._elm.classList.add('toolbar-shadow');
			}
			const overwrap = document.querySelector('#toolbar-overwrap');
			overwrap.style.display = 'none';
			overwrap.removeChild(overwrap.firstChild);
		}, delay);
	}

}
