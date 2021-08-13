/**
 *
 * Gulpfile
 *
 * @author Takuto Yanagida
 * @version 2021-08-13
 *
 */


'use strict';

const getBranchName = require('current-git-branch');
const BRANCH_NAME = getBranchName();

const REP_VERSION_MAJOR = '%VERSION_MAJOR%';
const REP_VERSION       = '%VERSION%';

const fs       = require('fs-extra');
const path     = require('path');
const gulp     = require('gulp');
const $        = require('gulp-load-plugins')({ pattern: ['gulp-*', !'gulp-sass'] });
const sass     = require('gulp-sass')(require('sass'));
const copySync = require('./copy-sync');

const config = require('./src/package.json');
const moment = require('moment');

const VERSION_MAJOR = config['version'].split('.')[0];
const VERSION_MINOR = moment().format((BRANCH_NAME === 'develop') ? 'YY.M-[dev]D' : 'YY.M-D');
const VERSION       = VERSION_MAJOR + '.' + VERSION_MINOR;

const PATH_STUDY_LIB = './app/study/lib/';


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
	'copy-js-beautify',
	'copy-jshint',
	'copy-sweetalert2',
	'copy-tern',
));

gulp.task('copy-src', (done) => {
	copySync('./src', './app');
	fs.removeSync('./app/study/scss/');
	fs.removeSync('./app/study/def/');
	copySync('./res/icon/icon.*', './app/res/');
	copySync('./res/icon/icon-mac.png', './app/res/');
	done();
});

gulp.task('copy', gulp.series('copy-src', 'copy-lib'));

gulp.task('version-package', () => {
	return gulp.src(['./src/package.json'])
		.pipe($.jsonEditor({ 'version': VERSION }))
		.pipe(gulp.dest('app'));
});

gulp.task('version-string', () => {
	return gulp.src([
		'./src/study/study.html',
		'./src/study/res/resource.json',
		'./src/auto-updater.js'
	], { base: './src' })
		.pipe($.replace(REP_VERSION_MAJOR, VERSION_MAJOR))
		.pipe($.replace(REP_VERSION, VERSION))
		.pipe(gulp.dest('app'));
});

gulp.task('version', gulp.series('version-package', 'version-string'));

gulp.task('sass', () => {
	return gulp.src(['src/**/scss/**/[^_]*.scss'])
		.pipe($.plumber({
			errorHandler: function (err) {
				console.log(err.messageFormatted);
				this.emit('end');
			}
		}))
		.pipe(sass({ outputStyle: 'compressed' }))
		.pipe($.autoprefixer({ remove: false }))
		.pipe($.rename({ extname: '.min.css' }))
		.pipe($.rename((p) => {
			p.dirname = p.dirname.replace(path.sep + 'scss' + path.sep, path.sep + 'css' + path.sep);
			p.dirname = p.dirname.replace(path.sep + 'scss', path.sep + 'css');
		}))
		.pipe(gulp.dest('app'));
});

gulp.task('sass-misc', () => {
	return gulp.src(['src/**/scss/*', '!src/**/scss/*.scss'])
		.pipe($.plumber())
		.pipe($.rename((p) => {
			p.dirname = p.dirname.replace(path.sep + 'scss' + path.sep, path.sep + 'css' + path.sep);
			p.dirname = p.dirname.replace(path.sep + 'scss', path.sep + 'css');
		}))
		.pipe(gulp.dest('app'));
});

gulp.task('default', gulp.series('copy', 'version', 'sass', 'sass-misc'));


// -----------------------------------------------------------------------------


const builder = require('electron-builder');

const buildOpts = {
	config: {
		appId: `com.stxst.${config.name}`,
		copyright: 'Takuto Yanagida',
		buildVersion: VERSION,
		fileAssociations: { ext: 'js', name: 'JavaScript' },
		win: {
			target: [
				{ target: 'zip',  arch: ['x64', 'ia32'] },
				{ target: 'nsis', arch: ['x64', 'ia32'] },
			],
			icon: 'app/res/icon.ico',
			publisherName: 'Takuto Yanagida',
		},
		artifactName: '${name}-${os}-${arch}.${ext}',
		nsis: {
			oneClick: false,
			artifactName: '${name}-${os}-setup.${ext}',
			deleteAppDataOnUninstall: true,
			uninstallDisplayName: `${config.productName} v${VERSION}`,
		},
		mac: {
			target: [
				{ target: 'zip', arch: ['x64'] },
				{ target: 'dmg', arch: ['x64'] },
			],
			icon: 'app/res/icon-mac.png',
		},
	}
};

function buildElectron(opts = {}, done) {
	const defOpts = Object.assign({}, buildOpts);
	builder.build(Object.assign(defOpts, opts)).then(() => {
		if (done != null) return done();
	}).catch((err) => {
		throw err;
	});
};

gulp.task('build', gulp.series((done) => {
	return buildElectron({}, done);
}));
