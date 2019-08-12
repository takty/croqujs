/**
 *
 * Side Menu
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2019-08-12
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
		Swal.fire(this._makeOption(text, type)
		).then(() => {
			this._enableBackground();
		});
	}

	showConfirm(text, type, fn) {
		window.focus();
		this._disableBackground();
		Swal.fire(this._makeOption(text, type, {
			confirmButtonText: 'OK',
			showCancelButton: true,
			cancelButtonText: this._textCancel,
		})).then((res) => {
			this._enableBackground();
			if (fn && res.value) fn(res.value);
		});
	}

	showPrompt(text, type, placeholder, value, fn) {
		window.focus();
		this._disableBackground();
		Swal.fire(this._makeOption(text, type, {
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
			allowOutsideClick: false,
		});
	}

	showPromptWithOption(text, type, placeholder, value, optText, fn) {
		window.focus();
		this._disableBackground();
		Swal.fire({
			title: '',
			type: type,
			allowOutsideClick: false,
			confirmButtonText: 'OK',
			showCancelButton: true,
			cancelButtonText: this._textCancel,
			customClass: 'prompt-with-option',
			focusConfirm: false,
			html: '<div style="display: inline-block;">' + this._formatText(text) + '</div>' +
				'<input id="swal-input" class="swal2-input" placeholder="' + placeholder + '" type="text" value="' + value + '">' +
				'<label class="swal2-checkbox-opt"><input type="checkbox" id="swal-checkbox">' +
				'<span class="swal2-label">' + this._formatText(optText) + '</span></label>',
			preConfirm: () => {
				return [
					document.getElementById('swal-input').value,
					document.getElementById('swal-checkbox').checked
				];
			},
		}).then((res) => {
			this._enableBackground();
			if (fn && res.value[0]) fn(res.value[0], res.value[1]);
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
