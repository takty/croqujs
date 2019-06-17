'use strict';

const fs         = require('fs-extra');
const glob       = require('glob');
const path       = require('path');
const jsonMerger = require('json-merger');
const gulp       = require('gulp');
const $          = require('gulp-load-plugins')({ pattern: ['gulp-*'] });

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
	copySync('./src', './dist');
	fs.removeSync('./dist/renderer_study/scss/');
	fs.removeSync('./dist/renderer_study/def/');
	copySync('./res/icon/icon.*', './dist/res/');
	done();
});

gulp.task('copy', gulp.series('copy-src', 'copy-lib'));

gulp.task('compile-json', (done) => {
	const files = glob.sync('./src/renderer_study/def/*');
	const res = jsonMerger.mergeFiles(files);
	fs.writeFileSync('./dist/renderer_study/libl.json', JSON.stringify(res, null, '\t'));
	done();
});

gulp.task('sass', () => {
	return gulp.src(['src/**/scss/**/[^_]*.scss'])
		.pipe($.plumber())
		.pipe($.sass({ outputStyle: 'compressed' }))
		.pipe($.autoprefixer({ remove: false }))
		.pipe($.rename({ extname: '.min.css' }))
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

gulp.task('default', gulp.series('copy', 'compile-json', 'sass', 'sass-misc'));


// -----------------------------------------------------------------------------


const packager = require('electron-packager');
const config = require('./package.json');

const packageOpts = {
	asar         : true,
	prune        : true,
	overwrite    : true,
	dir          : '.',
	out          : 'package',
	name         : config.productName,
	version      : config.devDependencies['electron'],
	appCopyright : 'Takuto Yanagida @ Space-Time Inc.',
	appVersion   : config.version,
	appBundleId  : 'croqujs',
	win32metadata: {
		CompanyName     : 'Takuto Yanagida @ Space-Time Inc.',
		FileDescription : config.productName,
		OriginalFilename: config.productName + '.exe',
		ProductName     : config.productName,
		InternalName    : config.productName,
	},
	ignore: [
		'^/node_modules',
		'^/src',
		'^/res',
		'^/.gitignore',
		'^/config.json',
		'^/npm-debug.log',
		'^/gulpfile.js'
	],
};

function packageElectron(opts = {}, done) {
	const defOpts = Object.assign({}, packageOpts);
	packager(Object.assign(defOpts, opts)).then(() => {
		if (done != null) return done();
	}).catch((err) => {
		throw err;
	});
};

gulp.task('remove-lv', (done) => {
	let files = glob.sync('./package/Croqujs-*/LICENSE*');
	for (let f of files) fs.removeSync(f);
	files = glob.sync('./package/Croqujs-*/version');
	for (let f of files) fs.removeSync(f);
	return done();
});

gulp.task('package-win', gulp.series((done) => {
	return packageElectron({
		platform: 'win32',
		arch: 'ia32,x64',
		icon: 'dist/res/icon.ico',
	}, done);
}, 'remove-lv'));

gulp.task('package-mac', gulp.series((done) => {
	return packageElectron({
		platform: 'darwin',
		arch: 'x64',
		icon: 'dist/res/icon.icns',
	}, () => {
		gulp.src(['package/Croqujs-darwin-x64/' + config.productName + '.app/Contents/Info.plist'], { base: '.' })
			.pipe($.plist({
				CFBundleDocumentTypes: [
					{
						CFBundleTypeExtensions: ['js'],
						CFBundleTypeIconFile: '',
						CFBundleTypeName: 'JavaScript',
						CFBundleTypeRole: 'Editor',
						LSHandlerRank: 'Default'
					}
				]
			}))
			.pipe(gulp.dest('.'));
		return done();
	});
}, 'remove-lv'));

gulp.task('archive-win32', () => {
	return gulp.src(['package/Croqujs-win32-ia32/**/*'])
		.pipe($.zip('Croqujs-win32.zip'))
		.pipe(gulp.dest('package'));
});

gulp.task('archive-win64', () => {
	return gulp.src(['package/Croqujs-win32-x64/**/*'])
		.pipe($.zip('Croqujs-win.zip'))
		.pipe(gulp.dest('package'));
});

gulp.task('archive-mac', () => {
	return gulp.src(['package/Croqujs-darwin-x64/**/*'])
		.pipe($.zip('Croqujs-mac.zip'))
		.pipe(gulp.dest('package'));
});

gulp.task('build-mac', gulp.series('package-mac', 'archive-mac'));
gulp.task('build-win', gulp.series('package-win', gulp.parallel('archive-win32', 'archive-win64')));
