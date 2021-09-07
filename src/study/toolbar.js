/**
 *
 * Toolbar
 *
 * @author Takuto Yanagida
 * @version 2021-09-07
 *
 */


'use strict';


class Toolbar {

	constructor(study, res) {
		this._study = study;
		this._res   = res;

		this._elm = document.querySelector('.toolbar');
		this._elm.addEventListener('mousedown', (e) => { e.preventDefault(); });
		this._elm.addEventListener('mouseup',   (e) => { e.preventDefault(); });

		const cbs = this._elm.querySelectorAll('*[data-cmd]');
		for (let i = 0; i < cbs.length; i += 1) {
			this._setBtn(cbs[i]);
		}
		const ibs = this._elm.querySelectorAll('.btn');
		for (let i = 0; i < ibs.length; i += 1) {
			this._setIcon(ibs[i]);
		}
	}

	_setBtn(btn) {
		const cmd = btn.dataset.cmd;
		btn.title = this._res.menu[cmd];
		btn.addEventListener('mousedown', (e) => { e.preventDefault(); });
		btn.addEventListener('mouseup', (e) => {
			e.preventDefault();
			this._study.executeCommand(cmd);
		});
	}

	_setIcon(btn) {
		const icon = btn.dataset.icon;
		if (icon) {
			const img = document.createElement('img');
			img.src = 'css/icon-' + icon + '.svg';
			btn.appendChild(img);
		}
	}

	_setEnabled(cmd, flag) {
		const btn = this._elm.querySelector('[data-cmd=' + cmd + ']');
		if (flag) btn.classList.remove('disabled');
		else btn.classList.add('disabled');
		return btn;
	}


	// -------------------------------------------------------------------------


	showMessage(text, hideShadow = false) {
		if (hideShadow) this._elm.classList.remove('toolbar-shadow');
		const overlap = this._elm.querySelector('.overlap');
		const overlapMsg = document.createTextNode(text);
		overlap.style.display = 'flex';
		if (overlap.firstChild) overlap.removeChild(overlap.firstChild);
		overlap.appendChild(overlapMsg);
	}

	hideMessage(delay = 0) {
		setTimeout(() => {
			if (!this._elm.classList.contains('toolbar-shadow')) {
				this._elm.classList.add('toolbar-shadow');
			}
			const overlap = this._elm.querySelector('.overlap');
			overlap.style.display = 'none';
			if (overlap.firstChild) overlap.removeChild(overlap.firstChild);
		}, delay);
	}


	// -------------------------------------------------------------------------


	reflectClipboard(text) {
		const btn = this._setEnabled('paste', text.length > 0);
		btn.title = this._res.menu.paste + (text.length > 0 ? ('\n' + text) : '');
	}

	reflectState(state) {
		this._setEnabled('undo', state.canUndo);
	}

}
