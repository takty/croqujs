/**
 *
 * Toolbar
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-11-28
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

		const bs = this._elm.querySelectorAll('*[data-cmd]');
		for (let i = 0; i < bs.length; i += 1) {
			this._setBtn(bs[i]);
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

	_setEnabled(cmd, flag) {
		const btn = this._elm.querySelector('[data-cmd=' + cmd + ']');
		if (flag) btn.classList.remove('disabled');
		else btn.classList.add('disabled');
		return btn;
	}


	// -------------------------------------------------------------------------


	showMessage(text, hideShadow = false) {
		if (hideShadow) this._elm.classList.remove('toolbar-shadow');
		const overwrap = this._elm.querySelector('.overwrap');
		const overwrapMsg = document.createTextNode(text);
		overwrap.style.display = 'flex';
		overwrap.appendChild(overwrapMsg);
	}

	hideMessage(delay = 0) {
		setTimeout(() => {
			if (!this._elm.classList.contains('toolbar-shadow')) {
				this._elm.classList.add('toolbar-shadow');
			}
			const overwrap = this._elm.querySelector('.overwrap');
			overwrap.style.display = 'none';
			overwrap.removeChild(overwrap.firstChild);
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
