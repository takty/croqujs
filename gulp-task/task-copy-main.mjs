/**
 * Gulpfile - Tasks for copying main files
 *
 * @author Takuto Yanagida
 * @version 2022-10-17
 */

import gulp from 'gulp';

import { makeCopyTask } from './_task-copy.mjs';

const SRC_MAIN  = ['./src/**/*', '!./src/study/scss/**/*'];
const SRC_ICON  = ['./res/icon/icon.*', './res/icon/icon-mac.png'];
const DIST_MAIN = './app';
const DIST_RES  = './app/res';


// -----------------------------------------------------------------------------


export const taskCopyMain = gulp.parallel(
	makeCopyTask(SRC_MAIN, DIST_MAIN),
	makeCopyTask(SRC_ICON, DIST_RES),
);
