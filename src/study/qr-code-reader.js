/**
 *
 * QR Code Reader
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2020-11-04
 *
 */


'use strict';


class QrCodeReader {

	constructor(container) {
		this._container = container;
		this._container.addEventListener('click', () => {
			this.stop();
		});
		this._cam = document.querySelector('#qcr-camera');
		this._temp = document.querySelector('#qcr-temp');
		this._ctx = this._temp.getContext('2d');

		this._isRunning = false;
	}

	async start() {
		this._container.classList.add('visible');
		const cs = {
			audio: false,
			video: { width: 320, height: 240, facingMode: 'user' }
		};
		const stream = await navigator.mediaDevices.getUserMedia(cs);
		this._cam.srcObject = stream;

		await new Promise(res => {
			this._cam.addEventListener('loadedmetadata', (e) => { res(); }, { once: true });
		});
		this._isRunning = true;
		this._cam.play();
		const res = await this._detect();
		this.stop();
		return res;
	}

	stop() {
		this._container.classList.remove('visible');
		this._isRunning = false;
		this._cam.pause();
	}

	_detect() {
		this._ctx.drawImage(this._cam, 0, 0, this._temp.width, this._temp.height);
		const img = this._ctx.getImageData(0, 0, this._temp.width, this._temp.height);
		const qr = jsQR(img.data, this._temp.width, this._temp.height);

		if (qr) {
			this._cam.pause();
			return qr.data;
		} else {
			if (!this._isRunning) return;
			return new Promise(r => {
				setTimeout(() => { r(this._detect()); }, 300);
			});
		}
	}

}
