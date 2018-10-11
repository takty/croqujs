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
		this._res   = res;

		this._elm = document.querySelector('.side-menu');
		this._elm.style.display = 'none';

		this._pseudoFocus = document.createElement('input');
		this._pseudoFocus.style.position = 'absolute';
		this._pseudoFocus.style.top = '-100vh';
		this._elm.appendChild(this._pseudoFocus);

		const btn = document.querySelector('.toolbar .btn.menu');
		btn.addEventListener('mousedown', (e) => { e.preventDefault(); });
		btn.addEventListener('mouseup', (e) => {
			if (this._elm.style.display === 'none') this.open();
			else this.close();
			e.preventDefault();
		});

		const his = this._elm.querySelectorAll('*[data-res]');
		for (let i = 0; i < his.length; i += 1) {
			const str = this._res.menu[his[i].dataset.res];
			if (str !== undefined) his[i].innerText = str;
		}
		const mis = this._elm.querySelectorAll('*[data-cmd]');
		for (let i = 0; i < mis.length; i += 1) {
			this._setItem(mis[i]);
		}
	}

	_setItem(mi) {
		const cmd = mi.dataset.cmd;
		const str = this._res.menu[cmd];
		if (str !== undefined && !mi.classList.contains('icon')) mi.innerText = str;
		const doClose = !mi.classList.contains('stay');
		mi.addEventListener('mouseup', (e) => {
			e.preventDefault();
			this._study.executeCommand(cmd, doClose);
		});
	}

	_setEnabled(cmd, flag) {
		const mi = this._elm.querySelector('[data-cmd=' + cmd + ']');
		if (flag) mi.classList.remove('disabled');
		else mi.classList.add('disabled');
		return mi;
	}

	_setChecked(cmd, flag) {
		const mi = this._elm.querySelector('[data-cmd=' + cmd + ']');
		if (flag) mi.classList.add('checked');
		else mi.classList.remove('checked');
		return mi;
	}


	// -------------------------------------------------------------------------


	open() {
		this._elm.style.display = 'block';
		this._pseudoFocus.focus();
	}

	close() {
		this._elm.style.display = 'none';
		this._study._editor._comp.focus();
	}


	// -------------------------------------------------------------------------


	reflectClipboard(text) {
		this._setEnabled('paste', text.length > 0);
	}

	reflectState(state) {
		this._setEnabled('undo', state.canUndo);
		this._setEnabled('redo', state.canRedo);
		this._setEnabled('exportAsLibrary', state.isFileOpend);
		this._setEnabled('exportAsWebPage', state.isFileOpend);
	}

	reflectConfig(conf) {
		this._setChecked('toggleSoftWrap', conf.softWrap);
		this._setChecked('toggleFunctionLineNumber', conf.functionLineNumber);
		if (conf.language === 'ja') {
			this._setChecked('setLanguageJa', true);
			this._setChecked('setLanguageEn', false);
		} else {
			this._setChecked('setLanguageJa', false);
			this._setChecked('setLanguageEn', true);
		}
	}

}
