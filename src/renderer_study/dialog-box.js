/**
 *
 * Side Menu
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-10-10
 *
 */


'use strict';


class DialogBox {

	constructor(study, res) {
		this._study      = study;
		this._textCancel = res.btn.cancel;
	}

	showAlert(text, type) {
		this._disableBackground();
		swal(this._makeOption(text, type)
		).then(() => {
			this._enableBackground();
		});
	}

	showConfirm(text, type, fn) {
		this._disableBackground();
		swal(this._makeOption(text, type, {
			confirmButtonText: 'OK',
			showCancelButton: true,
			cancelButtonText: this._textCancel,
		})).then((res) => {
			this._enableBackground();
			if (fn && res.value) fn(res.value);
		});
	}

	showPrompt(text, type, placeholder, value, fn) {
		this._disableBackground();
		swal(this._makeOption(text, type, {
			input: 'text',
			confirmButtonText: 'OK',
			showCancelButton: true,
			cancelButtonText: this._textCancel,
			inputPlaceholder: placeholder,
			inputValue: value,
		})).then((res) => {
			this._enableBackground();
			if (fn && res.value) fn(res.value);
		});
	}

	_makeOption(text, type, opt = {}) {
		return Object.assign(opt, {
			title: '',
			html: this._formatText(text),
			type: type,
			animation: 'slide-from-top',
			allowOutsideClick: false,
		});
	}

	_formatText(text) {
		text = text.replace(/\n/g, '<br>');
		return text.replace(/ /g, '&nbsp;');
	}

	_disableBackground() {
		this._study._sideMenu.close();
		this._study._editor.enabled(false);
	}

	_enableBackground() {
		this._study._editor.enabled(true);
	}

}
