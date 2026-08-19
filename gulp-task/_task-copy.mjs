/**
 * Function for gulp (Copy)
 *
 * @author Takuto Yanagida
 * @version 2024-06-19
 */

import gulp from 'gulp';
import plumber from 'gulp-plumber';
import ignore from 'gulp-ignore';
import changed, { compareContents } from 'gulp-changed';

export function makeCopyTask(src, dest = './dist', base = null) {
	const copyTask = () => gulp.src(src, { base: base, encoding: false })
		.pipe(plumber())
		.pipe(ignore.include({ isFile: true }))
		.pipe(changed(dest, { hasChanged: compareContents }))
		.pipe(gulp.dest(dest));
	return copyTask;
}