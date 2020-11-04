/**
 *
 * QR Code Reader
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2020-11-03
 *
 */


'use strict';


class QrCodeReader {

	constructor() {
		this._video = document.querySelector('#camera');
		this._canvas = document.querySelector('#picture');
		this._ctx = canvas.getContext('2d');
	}

	start() {
		const cs = {
			audio: false,
			video: {
				width: 320,
				height: 240,
				facingMode: 'user',  // Front camera
			}
		};
		navigator.mediaDevices.getUserMedia(cs)
			.then((stream) => {
				this._video.srcObject = stream;
				this._video.onloadedmetadata = (e) => {
					this._video.play();
					this._detect();
				};
			}).catch((err) => {
				console.log(err.name + ': ' + err.message);
			});
	}
	
	_detect() {
		this._ctx.drawImage(this._video, 0, 0, this._canvas.width, this._canvas.height);
	
		const imageData = this._ctx.getImageData(0, 0, this._canvas.width, this._canvas.height);
		const code = jsQR(imageData.data, this._canvas.width, this._canvas.height);
	
		if (code) {
			this._video.pause();
			return code.data;
		} else {
			setTimeout(() => { this._detect(); }, 300);
		}
	}
}
