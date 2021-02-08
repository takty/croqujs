/**
 *
 * Side Menu
 *
 * @author Takuto Yanagida
 * @version 2020-05-23
 *
 */


'use strict';


class DialogBox {

	constructor(study, res) {
		this._study      = study;
		this._textCancel = res.btn.cancel;
	}

	showAlert(text, type) {
		window.focus();
		this._disableBackground();
		return Swal.fire(this._makeOption(text, type)
		).then(() => {
			this._enableBackground();
		});
	}

	showConfirm(text, type) {
		window.focus();
		this._disableBackground();
		return Swal.fire(this._makeOption(text, type, {
			confirmButtonText: 'OK',
			showCancelButton: true,
			cancelButtonText: this._textCancel,
		})).then((res) => {
			this._enableBackground();
			return res;
		});
	}

	showPrompt(text, type, placeholder, value) {
		window.focus();
		this._disableBackground();
		return Swal.fire(this._makeOption(text, type, {
			input: 'text',
			confirmButtonText: 'OK',
			showCancelButton: true,
			cancelButtonText: this._textCancel,
			inputPlaceholder: placeholder,
			inputValue: value,
		})).then((res) => {
			this._enableBackground();
			return res;
		});
	}

	showPromptWithOption(text, type, placeholder, value, optText) {
		window.focus();
		this._disableBackground();
		return Swal.fire({
			title: '',
			icon: type,
			allowOutsideClick: false,
			confirmButtonText: 'OK',
			showCancelButton: true,
			cancelButtonText: this._textCancel,
			customClass: 'prompt-with-option',
			focusConfirm: false,
			html: '<div style="display: inline-block;">' + text + '</div>' +
				'<input id="swal-input" class="swal2-input" placeholder="' + placeholder + '" type="text" value="' + value + '">' +
				'<label class="swal2-checkbox-opt"><input type="checkbox" id="swal-checkbox">' +
				'<span class="swal2-label">' + optText + '</span></label>',
			preConfirm: () => {
				return [
					document.getElementById('swal-input').value,
					document.getElementById('swal-checkbox').checked
				];
			},
			showClass: {
				popup   : '',
				backdrop: 'swal2-backdrop-show',
				icon    : 'swal2-icon-show'
			},
			hideClass: {
				popup   : '',
				backdrop: 'swal2-backdrop-hide',
				icon    : 'swal2-icon-hide'
			}
		}).then((res) => {
			this._enableBackground();
			return res;
		});
	}


	// -------------------------------------------------------------------------


	_makeOption(text, type, opt = {}) {
		return Object.assign(opt, {
			title: '',
			html: text,
			icon: type,
			allowOutsideClick: false,
			showClass: {
				popup   : '',
				backdrop: 'swal2-backdrop-show',
				icon    : 'swal2-icon-show'
			},
			hideClass: {
				popup   : '',
				backdrop: 'swal2-backdrop-hide',
				icon    : 'swal2-icon-hide'
			}
		});
	}

	_disableBackground() {
		this._study._sideMenu.close();
		this._study._editor.enabled(false);
	}

	_enableBackground() {
		this._study._editor.enabled(true);
	}

}
