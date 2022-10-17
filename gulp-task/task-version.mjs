/**
 * Gulpfile - Task for version
 *
 * @author Takuto Yanagida
 * @version 2022-10-17
 */

import gulp from 'gulp';
import replace from 'gulp-replace';
import jsonEditor from 'gulp-json-editor';

import { fullVerStr } from './_common.mjs';

const SRC_PKG = './src/package.json';
const SRC_STR = [
	'./src/study/study.html',
	'./src/study/res/resource.json',
	'./src/auto-updater.js'
];
const DIST = 'app';

const REP_FROM = ['%VERSION%', '%VERSION_MAJOR%', '%VERSION_FULL%'];
const REP_TO   = await fullVerStr();


// -----------------------------------------------------------------------------


const verPkg = () => gulp.src(SRC_PKG)
	.pipe(jsonEditor({ 'version': REP_TO[0] }))
	.pipe(gulp.dest(DIST));

const verStr = () => gulp.src(SRC_STR, { base: './src' })
	.pipe(replace(REP_FROM[0], REP_TO[0]))
	.pipe(replace(REP_FROM[1], REP_TO[1]))
	.pipe(replace(REP_FROM[2], REP_TO[2]))
	.pipe(gulp.dest(DIST));

export const taskVersion = gulp.series(verPkg, verStr);
