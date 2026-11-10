/**
 * Side Menu
 *
 * @author Takuto Yanagida
 * @version 2026-11-01
 */

import { icons } from './icons.js';
import './side-menu.css';

export class SideMenu {

	// shouldHandleShortcut returns false to leave the key event to the host.
	constructor(res, menu, { onCommand = () => {}, onClose = () => {}, shouldHandleShortcut = () => true } = {}) {
		this.IS_MAC = navigator.platform.toLowerCase().indexOf('mac') !== -1;

		this._onCommand = onCommand;
		this._onClose = onClose;
		this._shouldHandleShortcut = shouldHandleShortcut;
		this._res   = res;
		this._map   = {}

		this._elm = document.querySelector('.side-menu');
		this._elm.style.display = 'none';
		this._elm.tabIndex = -1;
		this._createMenu(menu);

		const his = this._elm.querySelectorAll('[data-res]:not([data-cmd])');
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

	_createMenu(menu) {
		const container = document.createElement('div');
		container.className = 'container';
		for (const section of menu) {
			const caption = document.createElement('div');
			caption.className = 'caption';
			caption.dataset.res = section.res;
			const list = document.createElement('ul');
			list.className = 'menu';
			for (const item of section.items) list.appendChild(this._createItem(item));
			container.append(caption, list);
		}
		this._elm.appendChild(container);
	}

	_createItem(item, grouped = false) {
		const li = document.createElement('li');
		if (item.type === 'separator') {
			li.className = 'separator';
			return li;
		}
		if (item.type === 'group') {
			li.className = 'menu-sub';
			const label = document.createElement('span');
			this._setAttributes(label, item);
			const list = document.createElement('ul');
			for (const child of item.items) list.appendChild(this._createItem(child, true));
			li.append(label, list);
			return li;
		}
		if (item.type !== undefined && item.type !== 'icon') {
			throw new Error('Unknown menu item type: ' + item.type);
		}
		if (!item.cmd) throw new Error('Menu item requires cmd');
		li.className = item.type === 'icon' ? 'icon' : (grouped ? '' : 'mi');
		this._setAttributes(li, item);
		return li;
	}

	_setAttributes(elm, item) {
		for (const key of ['cmd', 'res', 'acc', 'icon']) {
			if (item[key] !== undefined) elm.dataset[key] = item[key];
		}
		if (item.alt !== undefined) elm.dataset.altCmd = item.alt;
		if (item.stay) elm.classList.add('stay');
	}

	_setItem(mi) {
		const cmd = mi.dataset.cmd;
		const str = this._res.menu[mi.dataset.res ?? cmd];
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
			this._onCommand(cmd, doClose);
		});
		const icon = mi.dataset.icon;
		if (icon) {
			const img = document.createElement('img');
			img.src = icons[icon];
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
			this._map[key] = () => { this._onCommand(cmd, doClose); }
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
			if (e.altKey) this._onCommand(cmd, doClose);
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
			if (this._map[ac] && this._shouldHandleShortcut(e)) {
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
		this._elm.focus({ preventScroll: true });
	}

	toggle() {
		if (this._elm.style.display === 'none') this.open();
		else this.close();
	}

	close() {
		this._elm.style.display = 'none';
		this._onClose();
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
