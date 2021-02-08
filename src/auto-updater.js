/**
 *
 * Auto Updater
 *
 * @author Takuto Yanagida
 * @version 2020-05-06
 *
 */


'use strict';

const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.allowPrerelease = ('%VERSION%'.match(/-\D/) !== null);

log.info('App starting...');
function logInfo(str) {
	log.info(str);
}
autoUpdater.on('checking-for-update', () => {
	logInfo('Checking for update...');
});
autoUpdater.on('update-available', (e) => {
	logInfo('Update available.');
});
autoUpdater.on('update-not-available', (e) => {
	logInfo('Update not available.');
});
autoUpdater.on('error', (e) => {
	logInfo('Error in auto-updater. ' + e);
});
autoUpdater.on('download-progress', (e) => {
	let msg = 'Download speed: ' + e.bytesPerSecond;
	msg = msg + ' - Downloaded ' + e.percent + '%';
	msg = msg + ' (' + e.transferred + '/' + e.total + ')';
	logInfo(msg);
});
autoUpdater.on('update-downloaded', (e) => {
	logInfo('Update downloaded');
});


// -----------------------------------------------------------------------------


app.on('ready', async () => {
	autoUpdater.checkForUpdatesAndNotify();
});
