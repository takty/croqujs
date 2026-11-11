/**
 * Dialog Box
 *
 * @author Takuto Yanagida
 * @version 2026-11-01
 */

import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import './dialog-box.css';
import { escapeHtml } from '../../lib/escape-html.js';

export class DialogBox {

	constructor(res, { onOpen = () => {}, onClose = () => {} } = {}) {
		this._onOpen     = onOpen;
		this._onClose    = onClose;
		this._textCancel = res.btn.cancel;
	}

	showAlert(text, type, { html = false } = {}) {
		window.focus();
		this._onOpen();
		return Swal.fire(this._makeOption(type, html ? { html: text } : { text })).then(() => {}).finally(() => {
			this._onClose();
		});
	}

	showConfirm(text, type, { confirmButtonText = 'OK', cancelButtonText = this._textCancel } = {}) {
		window.focus();
		this._onOpen();
		return Swal.fire(this._makeOption(type, {
			html: text,
			confirmButtonText,
			showCancelButton : true,
			cancelButtonText,
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
			html: '<div style="display: inline-block;">' + escapeHtml(text) + '</div>' +
				'<input id="swal-input" class="swal2-input" placeholder="' + escapeHtml(placeholder) + '" type="text" value="' + escapeHtml(value) + '">' +
				'<label class="swal2-checkbox-opt"><input type="checkbox" id="swal-checkbox">' +
				'<span class="swal2-label">' + escapeHtml(optText) + '</span></label>',
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

	_makeOption(type, opt) {
		return Object.assign(opt, {
			title: '',
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
