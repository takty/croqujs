/**
 * Dialog Box
 *
 * @author Takuto Yanagida
 * @version 2020-05-23
 */

import Swal from '../lib/sweetalert2/sweetalert2.esm.min.js';

function loadStyle(path) {
	return new Promise((resolve, reject) => {
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = new URL(path, import.meta.url).href;
		link.onload = resolve;
		link.onerror = () => reject(new Error('Failed to load dialog stylesheet: ' + link.href));
		document.head.appendChild(link);
	});
}

// Module initialization loads each stylesheet once, before any dialog is shown.
await Promise.all([
	loadStyle('../lib/sweetalert2/sweetalert2.min.css'),
	loadStyle('./dialog-box.css'),
]);

export class DialogBox {

	constructor(res, { onOpen = () => {}, onClose = () => {} } = {}) {
		this._onOpen     = onOpen;
		this._onClose    = onClose;
		this._textCancel = res.btn.cancel;
	}

	showAlert(text, type) {
		window.focus();
		this._onOpen();
		return Swal.fire(this._makeOption(text, type)).then(() => {}).finally(() => {
			this._onClose();
		});
	}

	showConfirm(text, type) {
		window.focus();
		this._onOpen();
		return Swal.fire(this._makeOption(text, type, {
			confirmButtonText: 'OK',
			showCancelButton: true,
			cancelButtonText: this._textCancel,
		})).finally(() => {
			this._onClose();
		});
	}

	showPromptWithOption(text, type, placeholder, value, optText) {
		window.focus();
		this._onOpen();
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
		}).finally(() => {
			this._onClose();
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

}
