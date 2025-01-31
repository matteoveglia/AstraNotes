import 'dotenv/config';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { resolve, join } from 'path';
import { readFileSync } from 'fs';

const target = process.argv[2];

const isWindows = process.platform === 'win32';
const defaultKeyPath = isWindows
    ? join(homedir(), '.tauri', 'AstraNotes-key')
    : resolve(homedir(), '.tauri/AstraNotes-key');

process.env.TAURI_SIGNING_PRIVATE_KEY = process.env.SIGNING_KEY_PATH ? 
    resolve(process.env.SIGNING_KEY_PATH.replace('~', homedir())) : 
    defaultKeyPath;
process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;

const targets = {
    'mac': 'aarch64-apple-darwin',
    'macuniversal': 'universal-apple-darwin',
    'win': 'x86_64-pc-windows-msvc'
};

console.log('Welcome to ASTRABUILD - Building AstraNotes for', target); 

if (!targets[target]) {
    console.error('[ASTRABUILD] Please specify a build target: mac, macuniversal, or win');
    process.exit(1);
}

try {
    // Check private key
    try {
        const privateKeyContent = readFileSync(process.env.TAURI_SIGNING_PRIVATE_KEY, 'utf8');
        console.log('[ASTRABUILD] Private key exists at:', process.env.TAURI_SIGNING_PRIVATE_KEY);
    } catch (err) {
        console.error('[ASTRABUILD] Error reading private key file:', err.message);
        process.exit(1);
    }

    // Check public key
    try {
        const publicKeyPath = `${process.env.TAURI_SIGNING_PRIVATE_KEY}.pub`;
        const publicKeyContent = readFileSync(publicKeyPath, 'utf8');
        console.log('[ASTRABUILD] Public key exists at:', publicKeyPath);
    } catch (err) {
        console.error('[ASTRABUILD] Error reading public key file:', err.message);
        process.exit(1);
    }

    console.log('[ASTRABUILD] Using signing key at: ', process.env.TAURI_SIGNING_PRIVATE_KEY);
    const privKeyPassword = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;
    const privKeyPasswordPreview = privKeyPassword
        ? `${privKeyPassword.slice(0, 5)}${'*'.repeat(Math.max(0, privKeyPassword.length - 5))}`
        : "(empty)";
    console.log(`[ASTRABUILD] Using signing key password: ${privKeyPasswordPreview}`);
    
    console.log('\n[ASTRABUILD] Attempting build...');
    execSync(`pnpm tauri build --target=${targets[target]}`, { stdio: 'inherit' });
} catch (error) {
    console.error('[ASTRABUILD] Build failed:', error);
    process.exit(1);
}