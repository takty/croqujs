/**
 * Gulpfile
 *
 * @author Takuto Yanagida
 * @version 2022-10-17
 */

import gulp from 'gulp';

import { taskCopyLib } from './gulp-task/task-copy-lib.mjs';
import { taskCopyMain } from './gulp-task/task-copy-main.mjs';
import { taskVersion } from './gulp-task/task-version.mjs';
import { taskStyle } from './gulp-task/task-style.mjs';
import { taskBuild } from './gulp-task/task-build.mjs';

export default gulp.series(taskCopyMain, taskCopyLib, taskVersion, taskStyle);

export const build = taskBuild;
