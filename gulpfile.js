'use strict';

const fs = require('fs-extra');
const glob = require('glob');
const path = require('path');
const gulp = require('gulp');
const $ = require('gulp-load-plugins')({pattern:['gulp-*']});

function copySync(from, to) {
	const isToDir = to.endsWith('/');
	const files = glob.sync(from);
	for (let f of files) {
		if (isToDir) {
			const fn = path.basename(f);
			fs.copySync(f, path.join(to, fn));
		} else {
			fs.copySync(f, to);
		}
	}
}

const PATH_STUDY_LIB = './dist/renderer_study/lib/';

gulp.task('copy-acorn', (done) => {
	copySync('./node_modules/acorn/dist', PATH_STUDY_LIB + 'acorn');
	copySync('./node_modules/acorn-loose/dist', PATH_STUDY_LIB + 'acorn');
	copySync('./node_modules/acorn-walk/dist', PATH_STUDY_LIB + 'acorn');
	done();
});

gulp.task('copy-codemirror', (done) => {
	copySync('./node_modules/codemirror/lib', PATH_STUDY_LIB + 'codemirror/lib');
	copySync('./node_modules/codemirror/addon', PATH_STUDY_LIB + 'codemirror/addon');
	copySync('./node_modules/codemirror/mode/javascript', PATH_STUDY_LIB + 'codemirror/mode/javascript');
	done();
});

gulp.task('copy-font-awesome', (done) => {
	copySync('./node_modules/font-awesome/css/font-awesome.min.css', PATH_STUDY_LIB + 'font-awesome/css/');
	copySync('./node_modules/font-awesome/fonts/fontawesome-webfont.woff2', PATH_STUDY_LIB + 'font-awesome/fonts/');
	done();
});

gulp.task('copy-js-beautify', (done) => {
	copySync('./node_modules/js-beautify/js/lib/beautify.js', PATH_STUDY_LIB + 'js-beautify/');
	done();
});

gulp.task('copy-jshint', (done) => {
	copySync('./node_modules/jshint/dist/jshint.js', PATH_STUDY_LIB + 'jshint/jshint.js');
	copySync('./node_modules/jshint-ja-edu/dist/jshint.js', PATH_STUDY_LIB + 'jshint/jshint-ja-edu.js');
	done();
});

gulp.task('copy-sweetalert2', (done) => {
	copySync('./node_modules/sweetalert2/dist/sweetalert2.min.*', PATH_STUDY_LIB + 'sweetalert2/');
	done();
});

gulp.task('copy-tern', (done) => {
	copySync('./node_modules/tern/lib', PATH_STUDY_LIB + 'tern');
	copySync('./node_modules/tern/defs', PATH_STUDY_LIB + 'tern');
	done();
});

gulp.task('copy-lib', gulp.parallel(
	'copy-acorn',
	'copy-codemirror',
	'copy-font-awesome',
	'copy-js-beautify',
	'copy-jshint',
	'copy-sweetalert2',
	'copy-tern',
));

gulp.task('copy-src', (done) => {
	copySync('./src', './dist');
	fs.removeSync('./dist/renderer_study/scss/');
	done();
});

gulp.task('copy', gulp.series('copy-src', 'copy-lib'));

gulp.task('sass', () => {
	return gulp.src(['src/**/scss/**/[^_]*.scss'])
		.pipe($.plumber())
		.pipe($.sass({outputStyle: 'compressed'}))
		.pipe($.autoprefixer({browsers: ['ie >= 11'], remove: false}))
		.pipe($.rename({extname: '.min.css'}))
		.pipe($.rename((p) => {
			p.dirname = p.dirname.replace(path.sep + 'scss' + path.sep, path.sep + 'css' + path.sep);
			p.dirname = p.dirname.replace(path.sep + 'scss', path.sep + 'css');
		}))
		.pipe(gulp.dest('dist'));
});

gulp.task('sass-misc', () => {
	return gulp.src(['src/**/scss/*', '!src/**/scss/*.scss'])
		.pipe($.plumber())
		.pipe($.rename((p) => {
			p.dirname = p.dirname.replace(path.sep + 'scss' + path.sep, path.sep + 'css' + path.sep);
			p.dirname = p.dirname.replace(path.sep + 'scss', path.sep + 'css');
		}))
		.pipe(gulp.dest('dist'));
});

gulp.task('default', gulp.series('copy', 'sass', 'sass-misc'));
