/**
 *
 * File System Dialog
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2019-09-22
 *
 */


'use strict';


class FSDialog {

	constructor(fsp, res, filter = null) {
		this._fsp    = fsp;
		this._res    = res;
		this._filter = filter;
		this._today  = this._getToday();

		this._dialog      = document.querySelector('.file-dialog');
		this._btnBack     = this._dialog.querySelector('.file-dialog-header .back');
		this._current     = this._dialog.querySelector('.file-dialog-header .current');
		const btnSelect   = this._dialog.querySelector('.file-dialog-header .select');
		this._list        = this._dialog.querySelector('.list-item-file');
		const labSaveAs   = this._dialog.querySelector('.save-as-label');
		this._inputSaveAs = this._dialog.querySelector('#file-dialog-save-as');
		this._btnCancel   = this._dialog.querySelector('#file-dialog-cancel');
		this._btnSubmit   = this._dialog.querySelector('#file-dialog-submit');
		this._selFilter   = this._dialog.querySelector('.filter');

		btnSelect.textContent       = this._res.label.select;
		labSaveAs.textContent       = this._res.label.saveAs;
		this._btnCancel.textContent = this._res.label.cancel;

		if (this._filter) {
			for (let f of this._filter) {
				const o = document.createElement('option');
				o.textContent = f.name;
				o.value = JSON.stringify(f.extensions);
				this._selFilter.appendChild(o);
			}
		}

		this._btnBack.addEventListener('click', async () => { this._onBack(); });		
		this._list.addEventListener('click', (e) => { this._onSelect(e); });
		this._list.addEventListener('dblclick', () => { this._onSubmit(); });
		this._inputSaveAs.addEventListener('input', () => { this._onInput(); });
		this._inputSaveAs.addEventListener('keydown', (e) => { this._onKeyDown(e); });
		this._btnCancel.addEventListener('click', () => { this._onCancel(); });
		this._btnSubmit.addEventListener('click', () => { this._onSubmit(); });
		this._selFilter.addEventListener('change', () => { this._onFilterChange(); });
	}

	async showOpenDialog() {
		this._dialog.classList.add('open');
		this._btnSubmit.textContent = this._res.label.open;

		await this._fsp.initialize();
		await this._update();
		this._dialog.classList.add('visible');

		return new Promise((resolve, reject) => {
			this._onSubmitted = (dirPath, name) => { 
				this._dialog.classList.remove('open');
				this._dialog.classList.remove('visible');
				resolve([dirPath, name]); 
			};
		});
	}

	async showSaveDialog() {
		this._dialog.classList.add('save');
		this._btnSubmit.textContent = this._res.label.save;

		await this._fsp.initialize();
		await this._update();
		this._dialog.classList.add('visible');

		return new Promise((resolve, reject) => {
			this._onSubmitted = (dirPath, name) => { 
				this._dialog.classList.remove('save');
				this._dialog.classList.remove('visible');
				resolve([dirPath, name]);
			};
		});
	}

	async _onBack() {
		const p = await this._fsp.getParentDirectory();
		if (p) {
			this._fsp.setCurrentDirectory(p);
			this._update();
		}
	}

	_onSelect(e) {
		const li = e.target.parentElement;
		if (!li.classList.contains('item-file') || li.classList.contains('header')) return;

		this._selected = JSON.parse(e.target.parentElement.dataset.file);
		this._btnSubmit.disabled = false;
		this._inputSaveAs.value = this._selected.name;

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
			const fileItem = JSON.parse(it.dataset.file);
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

	_onSubmit() {
		if (this._selected) {
			if (this._selected.type === 'dir') {
				this._fsp.setCurrentDirectory(this._selected);
				this._update();
			} else if (this._selected.type === 'file') {
				this._onSubmitted(this._fsp.getCurrentDirectory().path, this._selected.name);
			}
		} else if (this._dialog.classList.contains('save')) {
			this._onSubmitted(this._fsp.getCurrentDirectory().path, this._inputSaveAs.value);
		}
	}

	async _update() {
		const pd = await this._fsp.getParentDirectory();
		this._btnBack.textContent = pd ? pd.name : '';
		this._btnBack.style.display = pd ? '' : 'none';
		this._current.textContent = this._fsp.getCurrentDirectory().name;

		this._list.innerHTML = '';
		this._addListHeader();
		this._selected = null;
		this._btnSubmit.disabled = true;

		const es = (this._filter) ? this._filter[this._selFilter.selectedIndex].extensions : null;

		const its = await this._fsp.getFiles();
		for (let it of its) {
			const match = (es && it.type === 'file') ? this._matchExtension(it.name, es) : true;
			this._addListItem(it, match);
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

	_addListHeader() {
		const ls = this._res.listHeader;
		const li = document.createElement('li');
		li.className = 'item-file header';
		li.innerHTML = `<span class="name">${ls.name}</span><span class="size">${ls.size}</span><span class="timestamp">${ls.timeStamp}</span>`;
		this._list.insertBefore(li, this._list.firstChild);
	}

	_addListItem(it, match) {
		const li = document.createElement('li');
		li.classList.add('item-file');
		li.classList.add(it.type);
		if (it.type === 'file' && it.readOnly) li.classList.add('readonly');
		if (!match) li.classList.add('hidden');
		li.dataset.file = JSON.stringify(it);

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

	async initialize() {
		const fi = await this._sender('FS_getCurrentDirectory');
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
