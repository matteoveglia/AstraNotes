import 'dotenv/config';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { resolve, join } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, statSync } from 'fs';
import readline from 'readline-sync';

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

// Version management
const validateVersion = (version) => {
    const semverRegex = /^\d+\.\d+\.\d+$/;
    if (!semverRegex.test(version)) {
        console.error('[ASTRABUILD] Invalid version format. Please use semver (e.g., 1.2.3)');
        process.exit(1);
    }
    return version;
};

// Get current version and prompt for new one
const tauriConfig = JSON.parse(readFileSync('./src-tauri/tauri.conf.json', 'utf8'));
const currentVersion = tauriConfig.version;
console.log('[ASTRABUILD] Current version:', currentVersion);
const newVersion = validateVersion(
    readline.question('[ASTRABUILD] Enter new version: ')
);

// Update version in tauri.conf.json before build
const updateTauriConfig = () => {
    const tauriConfigPath = './src-tauri/tauri.conf.json';
    const config = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));
    config.version = newVersion;
    writeFileSync(tauriConfigPath, JSON.stringify(config, null, 2));
    console.log('[ASTRABUILD] Updated tauri.conf.json with version', newVersion);
};

console.log('[ASTRABUILD] Building AstraNotes for', target); 

if (!targets[target]) {
    console.error('[ASTRABUILD] Please specify a build target: mac, macuniversal, or win');
    process.exit(1);
}

const updateLatestJson = () => {
    const latestJsonPath = './latest.json';
    const currentDate = new Date().toISOString();

    // Default JSON structure
    let latestJson = {
        version: newVersion,
        notes: '',
        pub_date: currentDate,
        platforms: {}
    };

    // Try to read existing file and check for existing notes
    let existingNotes = '';
    try {
        const existingJson = JSON.parse(readFileSync(latestJsonPath, 'utf8'));
        
        // Preserve existing platforms
        latestJson.platforms = existingJson.platforms || {};
        
        // Check for existing notes
        if (existingJson.notes) {
            existingNotes = existingJson.notes;
            console.log('[ASTRABUILD] Existing release notes:');
            console.log(existingNotes);
        }
    } catch (err) {
        console.log('[ASTRABUILD] Creating new latest.json');
    }

    // Interactive notes input
    let useExistingNotes = false;
    if (existingNotes) {
        const keepNotesResponse = readline.question('[ASTRABUILD] Keep existing release notes? (y/n): ').toLowerCase();
        useExistingNotes = keepNotesResponse === 'y' || keepNotesResponse === 'yes';
    }

    // Get notes if not using existing
    if (!useExistingNotes) {
        const notes = readline.question('[ASTRABUILD] Enter release notes: ');
        latestJson.notes = notes.trim() || undefined;
    } else {
        latestJson.notes = existingNotes;
    }

    // Read signature files
    const readSignatureFile = (sigPath) => {
        try {
            console.log(`[ASTRABUILD] Attempting to read signature file: ${sigPath}`);
            
            // Check if file exists
            if (!existsSync(sigPath)) {
                console.error(`[ASTRABUILD] Signature file does not exist: ${sigPath}`);
                return '';
            }

            // Get file stats
            const stats = statSync(sigPath);
            console.log(`[ASTRABUILD] Signature file stats:`, {
                size: stats.size,
                isFile: stats.isFile(),
                mode: stats.mode
            });

            // Read file content
            const signature = readFileSync(sigPath, 'utf8').trim();
            
            console.log(`[ASTRABUILD] Signature file read successfully. Length: ${signature.length}`);
            return signature;
        } catch (err) {
            console.error(`[ASTRABUILD] Error reading signature file: ${sigPath}`, err.message);
            console.error(`[ASTRABUILD] Error stack:`, err.stack);
            return '';
        }
    };

    if (target === 'win') {
        // Windows-specific update
        const exeFile = `AstraNotes_${newVersion}_x64_en-US.msi`;
        const exePath = `./dist-tauri/${exeFile}`;
        const sigPath = `${exePath}.sig`;

        console.log('[ASTRABUILD] Windows Artifact Paths:');
        console.log(`- EXE File: ${exePath}`);
        console.log(`- Signature Path: ${sigPath}`);

        // Check if files exist in dist-tauri
        if (!existsSync(exePath)) {
            console.error(`[ASTRABUILD] Windows EXE not found in dist-tauri: ${exePath}`);
            
            // Try alternative path
            const altExePath = `./src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/${exeFile}`;
            const altSigPath = `${altExePath}.sig`;
            
            if (existsSync(altExePath)) {
                console.log(`[ASTRABUILD] Using alternative EXE path: ${altExePath}`);
                copyFileSync(altExePath, exePath);
                if (existsSync(altSigPath)) {
                    copyFileSync(altSigPath, sigPath);
                }
            }
        }

        latestJson.platforms['windows-x86_64'] = {
            url: `https://github.com/matteoveglia/AstraNotes/releases/download/v${newVersion}/${exeFile}`,
            signature: readSignatureFile(sigPath)
        };
    } else {
        // macOS-specific update
        const appArchive = `AstraNotes.app.tar.gz`;
        const appArchivePath = `./dist-tauri/${appArchive}`;
        const sigPath = `${appArchivePath}.sig`;

        latestJson.platforms['darwin-aarch64'] = {
            url: `https://github.com/matteoveglia/AstraNotes/releases/download/v${newVersion}/${appArchive}`,
            signature: readSignatureFile(sigPath)
        };
    }

    // Always set version to new version
    latestJson.version = newVersion;

    // Write updated JSON
    writeFileSync(latestJsonPath, JSON.stringify(latestJson, null, 2));
    console.log(`[ASTRABUILD] Updated ${latestJsonPath} for ${target}`);
};

const moveArtifacts = () => {
    const distPath = './dist-tauri';
    if (!existsSync(distPath)) {
        mkdirSync(distPath);
    }

    const getTargetPath = () => {
        switch (target) {
            case 'win':
                return 'x86_64-pc-windows-msvc';
            case 'mac':
                return 'aarch64-apple-darwin';
            case 'macuniversal':
                return 'universal-apple-darwin';
            default:
                throw new Error(`Unknown target: ${target}`);
        }
    };

    const basePath = './src-tauri/target';
    const targetPath = getTargetPath();
    const bundlePath = `${basePath}/${targetPath}/release/bundle`;
    
    try {
        if (target === 'win') {
            // Windows NSIS installer and signature
            const exeFile = `AstraNotes_${newVersion}_x64_en-US.msi`;
            const exePath = `${bundlePath}/nsis/${exeFile}`;
            const sigPath = `${exePath}.sig`;
            
            if (existsSync(exePath)) {
                copyFileSync(exePath, `${distPath}/${exeFile}`);
                if (existsSync(sigPath)) {
                    copyFileSync(sigPath, `${distPath}/${exeFile}.sig`);
                }
                console.log('[ASTRABUILD] Moved Windows artifacts');
            } else {
                console.error(`[ASTRABUILD] Windows installer not found at ${exePath}`);
            }
        } else {
            // macOS artifacts
            const appArchive = `${bundlePath}/macos/AstraNotes.app.tar.gz`;
            const appSig = `${appArchive}.sig`;
            const dmgFile = `AstraNotes_${newVersion}_aarch64.dmg`;
            const dmgPath = `${bundlePath}/dmg/${dmgFile}`;
            
            let moved = false;
            
            // Try to move app archive and signature
            if (existsSync(appArchive)) {
                copyFileSync(appArchive, `${distPath}/AstraNotes.app.tar.gz`);
                if (existsSync(appSig)) {
                    copyFileSync(appSig, `${distPath}/AstraNotes.app.tar.gz.sig`);
                }
                moved = true;
                console.log('[ASTRABUILD] Moved macOS app archive');
            }
            
            // Try to move DMG - check both new and old version patterns
            const oldDmgFile = `AstraNotes_${currentVersion}_aarch64.dmg`;
            const oldDmgPath = `${bundlePath}/dmg/${oldDmgFile}`;
            
            if (existsSync(dmgPath)) {
                copyFileSync(dmgPath, `${distPath}/${dmgFile}`);
                moved = true;
                console.log('[ASTRABUILD] Moved macOS DMG');
            } else if (existsSync(oldDmgPath)) {
                copyFileSync(oldDmgPath, `${distPath}/${dmgFile}`);
                moved = true;
                console.log('[ASTRABUILD] Moved macOS DMG (renamed from old version)');
            }
            
            if (!moved) {
                console.error('[ASTRABUILD] No macOS artifacts found to move');
                console.log('[ASTRABUILD] Checked paths:');
                console.log(`- App archive: ${appArchive}`);
                console.log(`- DMG (new): ${dmgPath}`);
                console.log(`- DMG (old): ${oldDmgPath}`);
            }
        }
    } catch (err) {
        console.error('[ASTRABUILD] Error moving artifacts:', err.message);
        console.error('[ASTRABUILD] Error details:', err);
        process.exit(1);
    }
};

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

    // Update version before build
    updateTauriConfig();
    
    // Run build
    console.log('[ASTRABUILD] Starting build...');
    execSync(`pnpm tauri build --target ${targets[target]}`, { stdio: 'inherit' });
    console.log('[ASTRABUILD] Build completed successfully');

    // Post-build updates
    moveArtifacts();
    updateLatestJson();
    
    console.log('[ASTRABUILD] Release automation completed successfully');
} catch (err) {
    console.error('[ASTRABUILD] Build failed:', err.message);
    process.exit(1);
}