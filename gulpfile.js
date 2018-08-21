'use strict';

const path = require('path');
const gulp = require('gulp');
const $ = require('gulp-load-plugins')({pattern:['gulp-*']});


// gulp.task('js-with-option', () => {
// 	return gulp.src('src/js/**/*.js')
// 		.pipe($.plumber())
// 		.pipe($.babel({presets: [['env', {targets: {ie: 11}}]]}))
// 		.pipe($.concat('stile-full.min.js'))
// 		.pipe($.uglify())
// 		.pipe(gulp.dest('dist/js'));
// });

// gulp.task('js-without-option', () => {
// 	return gulp.src(['src/js/basic/*.js', 'src/js/content/*.js'])
// 		.pipe($.plumber())
// 		.pipe($.babel({presets: [['env', {targets: {ie: 11}}]]}))
// 		.pipe($.concat('stile.min.js'))
// 		.pipe($.uglify())
// 		.pipe(gulp.dest('dist/js'));
// });

// gulp.task('js-each', () => {
// 	return gulp.src('src/js/**/*.js')
// 		.pipe($.plumber())
// 		.pipe($.babel({presets: [['env', {targets: {ie: 11}}]]}))
// 		.pipe($.uglify())
// 		.pipe($.rename({extname: '.min.js'}))
// 		.pipe(gulp.dest('dist/js'));
// });

// gulp.task('js', gulp.parallel('js-with-option', 'js-without-option', 'js-each'));

gulp.task('sass', () => {
	return gulp.src(['src/**/scss/**/[^_]*.scss'])
		.pipe($.plumber())
		// .pipe($.sourcemaps.init())
		.pipe($.sass({outputStyle: 'compressed'}))
		.pipe($.autoprefixer({browsers: ['ie >= 11'], remove: false}))
		.pipe($.rename({extname: '.min.css'}))
		.pipe($.rename((p) => {
			p.dirname = p.dirname.replace(path.sep + 'scss' + path.sep, path.sep + 'css' + path.sep);
			p.dirname = p.dirname.replace(path.sep + 'scss', path.sep + 'css');
		}))
		// .pipe($.sourcemaps.write('.'))
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

// gulp.task('watch', () => {
// 	gulp.watch('src/js/**/*.js', gulp.series('js'));
// 	gulp.watch('src/sass/**/*.scss', gulp.series('sass'));
// });

// gulp.task('build', gulp.parallel('js', 'sass'));

// gulp.task('default', gulp.series('build', 'watch'));
gulp.task('default', gulp.series('sass', 'sass-misc'));


// -----------------------------------------------------------------------------

// gulp.task('docs-sass', gulp.series('sass', () => {
// 	return gulp.src('docs/style.scss')
// 		.pipe($.plumber())
// 		.pipe($.sourcemaps.init())
// 		.pipe($.sass({outputStyle: 'compressed'}))
// 		.pipe($.autoprefixer({browsers: ['ie >= 11'], remove: false}))
// 		.pipe($.rename({extname: '.min.css'}))
// 		.pipe($.sourcemaps.write('.'))
// 		.pipe(gulp.dest('docs'));
// }));

// gulp.task('docs-js', gulp.series('js-with-option', () => {
// 	return gulp.src(['dist/js/stile-full.min.js'])
// 		.pipe($.plumber())
// 		.pipe(gulp.dest('docs'));
// }));

// gulp.task('docs-watch', () => {
// 	gulp.watch('src/js/**/*.js',     gulp.series('docs-js'));
// 	gulp.watch('src/sass/**/*.scss', gulp.series('docs-sass'));
// 	gulp.watch('docs/style.scss',    gulp.series('docs-sass'));
// });

// gulp.task('docs-build', gulp.parallel('docs-js', 'docs-sass'));

// gulp.task('docs-default', gulp.series('docs-build', 'docs-watch'));

// gulp.task('docs', gulp.parallel('default', 'docs-default'));
