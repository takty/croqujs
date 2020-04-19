/**
 *
 * File System Dialog
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2020-04-19
 *
 */


'use strict';


class FSDialog {

	constructor(fsp, res, filter = null, defaultExtension = '') {
		this._fsp    = fsp;
		this._res    = res;
		this._filter = filter;
		this._defExt = defaultExtension;
		this._today  = this._getToday();
	}

	_constructElements() {
		const ns = document.createElement('div');
		ns.className = 'fs-dialog';
		ns.innerHTML = `
			<div class="file-dialog">
				<div class="file-dialog-header">
					<span class="back"></span><span class="current"></span><span class="button-row"><span class="new"></span><span class="select"></span></span>
				</div>
				<div class="file-dialog-main">
					<ul class="list-item-file"></ul>
				</div>
				<div class="file-dialog-action">
					<div class="input-row">
						<label><span class="save-as-label"></span><input id="file-dialog-save-as" type="text" placeholder=""></label>
						<select class="filter"></select>
					</div>
					<div class="button-row">
						<button class="confirm" id="file-dialog-submit"></button><button id="file-dialog-cancel"></button>
					</div>
				</div>
				<div class="file-dialog-dialog">
					<div class="dialog">
						<div class="file-dialog-header">
							<div class="title"></div>
						</div>
						<div class="file-dialog-main">
							<div class="message"></div>
						</div>
						<div class="file-dialog-action">
							<div class="button-row">
								<button id="file-dialog-yes"></button><button id="file-dialog-no" autofocus></button>
							</div>
						</div>
					</div>
				</div>
			</div>
		`;
		document.body.appendChild(ns);
	}

	_destructElements() {
		const ns = document.querySelector('.fs-dialog');
		document.body.removeChild(ns);
	}

	_initialize() {
		this._dialog      = document.querySelector('.file-dialog');
		this._btnBack     = this._dialog.querySelector('.file-dialog-header .back');
		this._current     = this._dialog.querySelector('.file-dialog-header .current');
		const btnSelect   = this._dialog.querySelector('.file-dialog-header .select');
		this._fdHeader    = this._dialog.querySelector('.file-dialog-header');
		this._fdMain      = this._dialog.querySelector('.file-dialog-main');
		this._fdAction    = this._dialog.querySelector('.file-dialog-action');
		this._list        = this._dialog.querySelector('.list-item-file');
		const labSaveAs   = this._dialog.querySelector('.save-as-label');
		this._inputSaveAs = this._dialog.querySelector('#file-dialog-save-as');
		this._btnCancel   = this._dialog.querySelector('#file-dialog-cancel');
		this._btnSubmit   = this._dialog.querySelector('#file-dialog-submit');
		this._selFilter   = this._dialog.querySelector('.filter');

		btnSelect.textContent = this._res.label.select;
		labSaveAs.textContent = this._res.label.saveAs;
		this._btnCancel.textContent = this._res.label.cancel;

		if (this._filter) {
			while (this._selFilter.firstChild) this._selFilter.removeChild(this._selFilter.firstChild);
			for (let f of this._filter) {
				const o = document.createElement('option');
				o.textContent = f.name;
				o.value = JSON.stringify(f.extensions);
				this._selFilter.appendChild(o);
			}
		}
		this._btnBack.addEventListener('click', async () => { await this._onBack(); });
		this._list.addEventListener('click', (e) => { this._onSelect(e); });
		this._list.addEventListener('dblclick', async () => { await this._onSubmit(); });
		this._inputSaveAs.addEventListener('input', () => { this._onInput(); });
		this._inputSaveAs.addEventListener('keydown', (e) => { this._onKeyDown(e); });
		this._btnCancel.addEventListener('click', () => { this._onCancel(); });
		this._btnSubmit.addEventListener('click', async () => { await this._onSubmit(); });
		this._selFilter.addEventListener('change', () => { this._onFilterChange(); });
	}

	async showOpenDialog(currentDir = null) {
		this._constructElements();
		this._initialize();
		const ret = await this._show('open', currentDir);
		this._destructElements();
		return ret;
	}

	async showSaveDialog(currentDir = null) {
		this._constructElements();
		this._initialize();
		const ret = await this._show('save', currentDir);
		this._destructElements();
		return ret;
	}

	async _show(type, currentDir = null) {
		this._dialog.classList.add(type);
		this._btnSubmit.textContent = this._res.label[type];

		await this._fsp.initialize(currentDir);
		await this._update();
		this._dialog.classList.add('visible');

		const fdHH = this._fdHeader.offsetHeight;
		const fdAH = this._fdAction.offsetHeight;
		this._fdMain.style.maxHeight = `calc(100% - ${fdHH}px - ${fdAH}px)`;

		return new Promise((resolve) => {
			this._onSubmitted = (dirPath, name) => {
				this._dialog.classList.remove(type);
				this._dialog.classList.remove('visible');
				resolve([dirPath, name]);
			};
		});
	}

	async _onBack() {
		const p = await this._fsp.getParentDirectory();
		if (p) {
			this._fsp.setCurrentDirectory(p);
			await this._update();
		}
	}

	_onSelect(e) {
		const li = e.target.parentElement;
		if (!li.classList.contains('item-file') || li.classList.contains('header')) return;

		const idx = parseInt(e.target.parentElement.dataset.idx);
		this._selected = this._fileItems[idx];
		this._btnSubmit.disabled = false;
		if (this._selected.type === 'file') {
			this._inputSaveAs.value = this._selected.name;
		}

		for (let it of this._list.children) it.classList.remove('selected');
		e.target.parentElement.classList.add('selected');

		if (this._dialog.classList.contains('save')) {
			if (this._selected.type === 'dir') {
				this._btnSubmit.textContent = this._res.label.open;
			} else {
				this._btnSubmit.textContent = this._res.label.save;
			}
		}
	}

	_onInput() {
		for (let it of this._list.children) it.classList.remove('selected');
		this._selected = null;
		const name = this._inputSaveAs.value;
		if (name === '') {
			this._btnSubmit.disabled = true;
		} else {
			this._btnSubmit.disabled = false;
			if (this._dialog.classList.contains('save')) {
				this._btnSubmit.textContent = this._res.label.save;
			}
		}
	}

	_onKeyDown(e) {
		if (e.keyCode === 13) {
			this._btnSubmit.click();
			e.preventDefault();
		}
	}

	_onFilterChange() {
		const es = (this._filter) ? this._filter[this._selFilter.selectedIndex].extensions : null;
		for (let it of this._list.children) {
			if (it.classList.contains('header')) continue;
			const fileItem = this._fileItems[parseInt(it.dataset.idx)];
			const match = (es && fileItem.type === 'file') ? this._matchExtension(fileItem.name, es) : true;
			if (match) {
				it.classList.remove('hidden');
			} else {
				it.classList.add('hidden');
			}
		}
	}

	_onCancel() {
		this._onSubmitted('', '');
	}

	async _onSubmit() {
		if (this._selected && this._selected.type === 'dir') {
			this._fsp.setCurrentDirectory(this._selected);
			await this._update();
		} else {
			if (this._dialog.classList.contains('open')) {
				if (this._selected && this._selected.type === 'file') {
					this._onSubmitted(this._fsp.getCurrentDirectory().path, this._selected.name);
				}
			} else if (this._dialog.classList.contains('save')) {
				let name = this._inputSaveAs.value;
				if (this._defExt !== '' && name.indexOf('.') === -1) {
					name += '.' + this._defExt;
					this._inputSaveAs.value = name;
				}
				if (this._existFile(name)) {
					if (!await this._confirmOverwrite(name)) return;
				}
				this._onSubmitted(this._fsp.getCurrentDirectory().path, name);
			}
		}
	}

	async _update() {
		while (this._list.firstChild) this._list.removeChild(this._list.firstChild);
		this._fileItems = [];
		this._selected = null;
		if (this._dialog.classList.contains('open')) {
			this._btnSubmit.disabled = true;
			this._inputSaveAs.value = '';
		} else if (this._dialog.classList.contains('save')) {
			this._btnSubmit.disabled = (this._inputSaveAs.value.trim() === '');
		}

		const pd = await this._fsp.getParentDirectory();
		this._btnBack.textContent = pd ? pd.name : '';
		this._btnBack.style.display = pd ? '' : 'none';
		this._current.textContent = this._fsp.getCurrentDirectory().name;

		this._addListHeader();

		const es = (this._filter) ? this._filter[this._selFilter.selectedIndex].extensions : null;

		this._fileItems = await this._fsp.getFiles();
		for (let i = 0; i < this._fileItems.length; i += 1) {
			const it = this._fileItems[i];
			const match = (es && it.type === 'file') ? this._matchExtension(it.name, es) : true;
			this._addListItem(it, match, i);
		}
	}

	_matchExtension(name, es) {
		const i = name.lastIndexOf('.');
		const ext = (i === -1) ? '' : name.substr(i + 1);
		for (let e of es) {
			if (e === '*' || e === ext) return true;
		}
		return false;
	}

	_existFile(name) {
		const lcName = name.toLowerCase();
		for (let fi of this._fileItems) {
			if (fi.name.toLowerCase() === lcName) return true;
		}
		return false;
	}

	_addListHeader() {
		const ls = this._res.listHeader;
		const li = document.createElement('li');
		li.className = 'item-file header';
		li.innerHTML = `<span class="name">${ls.name}</span><span class="size">${ls.size}</span><span class="timestamp">${ls.timeStamp}</span>`;
		this._list.insertBefore(li, this._list.firstChild);
	}

	_addListItem(it, match, idx) {
		const li = document.createElement('li');
		li.classList.add('item-file');
		li.classList.add(it.type);
		if (it.type === 'file' && it.readOnly) li.classList.add('readonly');
		if (!match) li.classList.add('hidden');
		li.dataset.idx = idx;

		const name = document.createElement('span');
		name.className = 'name';
		name.textContent = it.name;

		const size = document.createElement('span');
		size.className = 'size';
		size.textContent = this._makeSizeString(it);

		const timeStamp = document.createElement('span');
		timeStamp.className = 'timestamp';
		timeStamp.textContent = this._makeTimeStampString(it);

		li.appendChild(name);
		li.appendChild(size);
		li.appendChild(timeStamp);
		this._list.appendChild(li);
	}

	_makeSizeString(it) {
		if (it.type === 'file') {
			const num = Math.ceil((it.size / 1024)) + '';
			return num.replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1,') + ' KB';
		}
		return '';
	}

	_makeTimeStampString(it) {
		if (it.type === 'file') {
			const dt = it.timeStamp.split(' ');
			const date = this._today;
			if (date === dt[0]) {
				const ts = dt[1].split(':');
				return ts[0] + ':' + ts[1];
			} else {
				return dt[0];
			}
		}
		return '';
	}

	_getToday() {
		const now = new Date();
		const y = '' + now.getFullYear();
		let m = '' + (now.getMonth() + 1);
		if (m.length < 2) m = '0' + m;
		let d = '' + now.getDate();
		if (d.length < 2) d = '0' + d;
		const date = y + '-' + m + '-' + d;
		return date;
	}

	async _confirmOverwrite(name) {
		const dd      = document.querySelector('.file-dialog-dialog');
		const title   = dd.querySelector('.title');
		const message = dd.querySelector('.message');
		const fns     = document.createElement('span');
		const btnYes  = dd.querySelector('#file-dialog-yes');
		const btnNo   = dd.querySelector('#file-dialog-no');

		title.textContent   = this._res.title.confirmSaveAs;
		message.innerHTML   = this._res.msg.confirmOverwrite;
		fns.textContent     = name;
		message.insertBefore(fns, message.firstChild);
		btnYes.textContent  = this._res.label.yes;
		btnNo.textContent   = this._res.label.no;

		btnYes.onclick = () => { this._onConfirmed(true); };
		btnNo.onclick  = () => { this._onConfirmed(false); };

		dd.classList.add('visible');

		return await new Promise((resolve) => {
			this._onConfirmed = (res) => {
				dd.classList.remove('visible');
				resolve(res);
			};
		});
	}

}


// -----------------------------------------------------------------------------


class FSProxy {

	async initialize() {}

	setCurrentDirectory(fileItem) { this._current = fileItem; }

	getCurrentDirectory() { return this._current; }

	async getParentDirectory() {}

	async getFiles() {}

	sort(fileItems) {
		fileItems.sort((a, b) => {
			if (a.type === 'dir' && b.type === 'file') return -1;
			if (a.type === 'file' && b.type === 'dir') return 1;

			const nameA = e(a.name.toLowerCase());
			const nameB = e(b.name.toLowerCase());
			return nameA.localeCompare(nameB);
		});
		function e(s) {
			return (' ' + s + ' ').replace(/[\s]+/g, ' ').toLowerCase().replace(/[\d]+/g, function (d) {
				d = '' + 1e20 + d;
				return d.substring(d.length - 20);
			});
		};
	}

}


// -----------------------------------------------------------------------------


class IpcFSProxy extends FSProxy {

	constructor(sender) {
		super();
		this._sender = sender;
	}

	async initialize(currentDir = null) {
		const fi = await this._sender('FS_getCurrentDirectory', currentDir);
		this.setCurrentDirectory(fi);
	}

	setCurrentDirectory(fileItem) {
		super.setCurrentDirectory(fileItem);
		this._parent = null;
	}

	async getParentDirectory() {
		if (!this._parent) {
			const fi = await this._sender('FS_getParentDirectory', this.getCurrentDirectory());
			this._parent = fi;
		}
		return this._parent;
	}

	async getFiles() {
		const fis = await this._sender('FS_getFiles', this.getCurrentDirectory());
		super.sort(fis);
		return fis;
	}

}
