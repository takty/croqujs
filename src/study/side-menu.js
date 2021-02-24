/**
 *
 * Side Menu
 *
 * @author Takuto Yanagida
 * @version 2021-02-24
 *
 */


'use strict';


class SideMenu {

	constructor(study, res) {
		this.IS_MAC = navigator.platform.toLowerCase().indexOf('mac') !== -1;

		this._study = study;
		this._res   = res;
		this._map   = {}

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
			this._addAccelerator(mis[i]);
		}
		this._setShortcuts();

		const ais = this._elm.querySelectorAll('*[data-alt-cmd]');
		for (let i = 0; i < ais.length; i += 1) this._setAltCommand(ais[i]);
	}

	_setItem(mi) {
		const cmd = mi.dataset.cmd;
		const str = this._res.menu[cmd];
		if (str !== undefined) {
			if (mi.classList.contains('icon')) {
				mi.title = str;
			} else {
				const tn = document.createTextNode(str);
				mi.appendChild(tn);
			}
		}
		const doClose = !mi.classList.contains('stay');
		mi.addEventListener('mouseup', (e) => {
			e.preventDefault();
			this._study.executeCommand(cmd, doClose);
		});
		const icon = mi.dataset.icon;
		if (icon) {
			const img = document.createElement('img');
			img.src = 'css/icon-' + icon + '.svg';
			mi.appendChild(img);
		}
	}

	_addAccelerator(mi) {
		const acc = mi.dataset.acc;
		if (!acc) return;

		const cmd = mi.dataset.cmd;
		const doClose = !mi.classList.contains('stay');

		for (let ac of acc.toLowerCase().split(' ')) {
			if (ac[0] === '!') continue;
			if (ac[0] === '*') {
				if (!this.IS_MAC) continue;
				ac = ac.substr(1);
			}
			const key = ac.split('+').sort().join('+');
			this._map[key] = () => { this._study.executeCommand(cmd, doClose); }
		}
		const modAcc = [];
		for (let ac of acc.split(' ')) {
			if (ac[0] === '!' || ac[0] === '*') ac = ac.substr(1);
			modAcc.push(ac);
		}
		let ac = modAcc.join(', ');
		ac = ac.replace(/CC/g, this.IS_MAC ? '⌘' : 'Ctrl');
		if (mi.classList.contains('icon')) {
			mi.title += (mi.title ? ' ' : '') + ac;
		} else {
			const se = document.createElement('span');
			mi.appendChild(se);
			se.innerText = ac;
		}
	}

	_setAltCommand(mi) {
		const cmd = mi.dataset.altCmd;
		const doClose = !mi.classList.contains('stay');
		mi.addEventListener('mouseup', (e) => {
			e.preventDefault();
			if (e.altKey) this._study.executeCommand(cmd, doClose);
		});
	}

	_setShortcuts() {
		window.addEventListener('keydown', (e) => {
			const pks = [];
			if (e.altKey) pks.push('alt');
			if ((this.IS_MAC && e.metaKey) || (!this.IS_MAC && e.ctrlKey)) pks.push('cc');
			if (e.shiftKey) pks.push('shift');
			pks.push(this._convertKey(e.key));
			const ac = pks.sort().join('+');
			if (this.IS_MAC && ac === 'c+cc' && !this._study._editor._comp.hasFocus()) {
				return;  // for copying text in output pane on Mac
			}
			if (this._map[ac]) {
				e.preventDefault();
				this._map[ac]();
			}
		});
	}

	_convertKey(key) {
		key = key.toLowerCase();
		if (key === '+') return 'plus';
		return key;
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
		this._setEnabled('exportAsLibrary', state.isFileOpened);
		this._setEnabled('exportAsWebPage', state.isFileOpened);
	}

	reflectConfig(conf) {
		this._setChecked('toggleSoftWrap', conf.softWrap);
		this._setChecked('toggleFnLineNum', conf.functionLineNumber);
		this._setChecked('toggleAutoIndent', conf.autoIndent);
		if (conf.language === 'ja') {
			this._setChecked('setLanguageJa', true);
			this._setChecked('setLanguageEn', false);
		} else {
			this._setChecked('setLanguageJa', false);
			this._setChecked('setLanguageEn', true);
		}
	}

}
