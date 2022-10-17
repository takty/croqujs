/**
 * Gulpfile - Tasks for copying libraries
 *
 * @author Takuto Yanagida
 * @version 2022-10-17
 */

import gulp from 'gulp';

import { pkgDir } from './_common.mjs';
import { makeCopyTask } from './_task-copy.mjs';

const DIST = './app/study/lib/';


// -----------------------------------------------------------------------------


const makeTaskCopyAcorn = () => {
	const dir = pkgDir('acorn');
	return gulp.parallel(
		makeCopyTask(dir + '/dist/**/*', DIST + 'acorn'),
		makeCopyTask(dir + '-loose/dist/**/*', DIST + 'acorn'),
		makeCopyTask(dir + '-walk/dist/**/*', DIST + 'acorn')
	);
}

const makeTaskCopyCodeMirror = () => {
	const dir = pkgDir('codemirror');
	return gulp.parallel(
		makeCopyTask(dir + '/lib/**/*', DIST + 'codemirror/lib'),
		makeCopyTask(dir + '/addon/**/*', DIST + 'codemirror/addon'),
		makeCopyTask(dir + '/mode/javascript/**/*', DIST + 'codemirror/mode/javascript'),
	);
};

const makeTaskCopyJsBeautify = () => {
	const dir = pkgDir('js-beautify');
	return gulp.parallel(
		makeCopyTask(dir + '/js/lib/beautify.js', DIST + 'js-beautify'),
	);
}

const makeTaskJsHint = () => {
	const dir = pkgDir('jshint');
	return gulp.parallel(
		makeCopyTask(dir + '/dist/jshint.js', DIST + 'jshint'),
		makeCopyTask(dir + '-ja-edu/dist/jshint.js', DIST + 'jshint/ja-edu'),
	);
}

const makeTaskSweetAlert = () => {
	const dir = pkgDir('sweetalert2');
	return gulp.parallel(
		makeCopyTask(dir + '/dist/sweetalert2.min.*', DIST + 'sweetalert2'),
	);
}

const makeTaskCopyTern = () => {
	const dir = pkgDir('tern');
	return gulp.parallel(
		makeCopyTask(dir + '/lib/**/*', DIST + 'tern'),
		makeCopyTask(dir + '/defs/**/*', DIST + 'tern'),
	);
}

export const taskCopyLib = gulp.parallel(
	makeTaskCopyAcorn(),
	makeTaskCopyCodeMirror(),
	makeTaskCopyJsBeautify(),
	makeTaskJsHint(),
	makeTaskSweetAlert(),
	makeTaskCopyTern()
);
