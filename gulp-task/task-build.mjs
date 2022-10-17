/**
 * Gulpfile - Task for build
 *
 * @author Takuto Yanagida
 * @version 2022-10-17
 */

import builder from 'electron-builder';
import { getPkgJson, fullVerStr } from './_common.mjs';

const DIR_RES = 'app/res/';

const pkg   = getPkgJson();
const [ver] = await fullVerStr();


// -----------------------------------------------------------------------------


const opts = {
	config: {
		appId           : `com.stxst.${pkg.name}`,
		copyright       : 'Takuto Yanagida',
		buildVersion    : ver,
		fileAssociations: { ext: 'js', name: 'JavaScript' },
		artifactName    : '${name}-${os}-${arch}.${ext}',

		win: {
			target: [
				{ target: 'zip',  arch: ['x64', 'ia32'] },
				{ target: 'nsis', arch: ['x64', 'ia32'] },
			],
			icon         : `${DIR_RES}icon.ico`,
			publisherName: 'Takuto Yanagida',
		},
		nsis: {
			oneClick                : false,
			artifactName            : '${name}-${os}-setup.${ext}',
			deleteAppDataOnUninstall: true,
			uninstallDisplayName    : `${pkg.productName} v${ver}`,
		},
		mac: {
			target: [
				{ target: 'zip', arch: ['x64'] },
				{ target: 'dmg', arch: ['x64'] },
			],
			icon: `${DIR_RES}icon-mac.png`,
		},
	}
};

function build(opts, done) {
	builder.build(opts).then(() => {
		if (done != null) return done();
	}).catch(err => {
		throw err;
	});
};

export const taskBuild = done => build(opts, done);
