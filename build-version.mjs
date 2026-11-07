import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

const execFileAsync = promisify(execFile);
const packageJson = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));

async function getBranchName() {
	try {
		const { stdout } = await execFileAsync('git', ['branch', '--show-current']);
		return stdout.trim();
	} catch {
		return '';
	}
}

function getDateStamp() {
	const now = new Date();
	return [now.getFullYear() % 100, now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, '0')).join('');
}

export async function getVersionInfo() {
	const version = packageJson.version;
	const isDev   = await getBranchName() === 'develop';

	return {
		version,
		major: version.split('.')[0],
		full : `${version}-${isDev ? '[dev]' : ''}${getDateStamp()}`,
	};
}

