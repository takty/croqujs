/**
 * Gulpfile - Tasks for style
 *
 * @author Takuto Yanagida
 * @version 2022-10-17
 */

import gulp from 'gulp';

import { makeCopyTask } from './_task-copy.mjs';
import { makeSassTask } from './_task-sass.mjs';

const SRC_SASS = 'src/study/scss/**/[^_]*.scss';
const SRC_COPY = ['src/study/scss/**/*', '!src/study/scss/*.scss'];
const DIST     = 'app/study/css';


// -----------------------------------------------------------------------------


export const taskStyle = gulp.parallel(
	makeSassTask(SRC_SASS, DIST),
	makeCopyTask(SRC_COPY, DIST)
);
