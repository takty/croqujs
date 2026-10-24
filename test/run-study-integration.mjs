import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [fileURLToPath(new URL('./study-integration.cjs', import.meta.url))], {
	windowsHide: true,
	stdio: 'inherit',
	env,
});
const timeout = setTimeout(() => { child.kill(); process.exitCode = 1; }, 45000);
child.on('error', error => { console.error(error); clearTimeout(timeout); process.exitCode = 1; });
child.on('exit', code => { clearTimeout(timeout); process.exitCode = code ?? 1; });
