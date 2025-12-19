import "dotenv/config";
import { execSync } from "child_process";
import { homedir } from "os";
import { resolve, join } from "path";
import {
	readFileSync,
	writeFileSync,
	mkdirSync,
	existsSync,
	copyFileSync,
	statSync,
} from "fs";
import readline from "readline-sync";

const target = process.argv[2];

// Utility functions
const logInfo = (message) => console.log(`[ASTRABUILD] ${message}`);
const logError = (message) => console.error(`[ASTRABUILD] ERROR: ${message}`);
const logSuccess = (message) => console.log(`[ASTRABUILD] ✓ ${message}`);

const isWindows = process.platform === "win32";
const defaultKeyPath = isWindows
	? join(homedir(), ".tauri", "AstraNotes-key")
	: resolve(homedir(), ".tauri/AstraNotes-key");

process.env.TAURI_SIGNING_PRIVATE_KEY = process.env.SIGNING_KEY_PATH
	? resolve(process.env.SIGNING_KEY_PATH.replace("~", homedir()))
	: defaultKeyPath;
process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD =
	process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;

const targets = {
	mac: "aarch64-apple-darwin",
	macuniversal: "universal-apple-darwin",
	win: "x86_64-pc-windows-msvc",
};

// Validation functions
const validateVersion = (version) => {
	const semverRegex = /^\d+\.\d+\.\d+$/;
	if (!semverRegex.test(version)) {
		logError("Invalid version format. Please use semver (e.g., 1.2.3)");
		process.exit(1);
	}
	return version;
};

const validateTarget = (target) => {
	if (!target || !targets[target]) {
		logError("Please specify a build target: mac, macuniversal, or win");
		logInfo("Usage: node build.js <target>");
		logInfo("Available targets: " + Object.keys(targets).join(", "));
		process.exit(1);
	}
};

// Safe file operations
const safeReadFile = (filePath, defaultValue = null) => {
	try {
		return readFileSync(filePath, "utf8");
	} catch (err) {
		if (defaultValue !== null) {
			return defaultValue;
		}
		logError(`Failed to read file: ${filePath} - ${err.message}`);
		throw err;
	}
};

const safeWriteFile = (filePath, content) => {
	try {
		writeFileSync(filePath, content);
		logSuccess(`Updated ${filePath}`);
	} catch (err) {
		logError(`Failed to write file: ${filePath} - ${err.message}`);
		throw err;
	}
};

const safeParseJSON = (content, filePath) => {
	try {
		return JSON.parse(content);
	} catch (err) {
		logError(`Invalid JSON in ${filePath}: ${err.message}`);
		throw err;
	}
};

// Interactive prompts
const askYesNo = (question, defaultAnswer = "n") => {
	const response =
		readline.question(`${question} (y/n) [${defaultAnswer}]: `).toLowerCase() ||
		defaultAnswer;
	return response === "y" || response === "yes";
};

const askChoice = (question, choices, defaultKey) => {
	const display = Object.entries(choices)
		.map(([k, v]) => `${k}=${v}`)
		.join(", ");
	const answer = (
		readline.question(`${question} (${display}) [${defaultKey}]: `) ||
		defaultKey
	).toLowerCase();
	return choices[answer] ? answer : defaultKey;
};

// Version management
const getVersionAndReleaseNotes = () => {
	try {
		const tauriConfigContent = safeReadFile("./src-tauri/tauri.conf.json");
		const tauriConfig = safeParseJSON(
			tauriConfigContent,
			"./src-tauri/tauri.conf.json",
		);
		const currentVersion = tauriConfig.version;

		logInfo(`Current version: ${currentVersion}`);

		// Ask if user wants to keep current version
		const keepCurrentVersion = askYesNo("Keep current version?", "y");

		let selectedVersion;
		if (keepCurrentVersion) {
			logInfo(`Using current version: ${currentVersion}`);
			selectedVersion = currentVersion;
		} else {
			const newVersionInput = readline.question("Enter new version: ");
			selectedVersion = validateVersion(newVersionInput);
			logInfo(`Using new version: ${selectedVersion}`);
		}

		// Now ask for release notes
		logInfo("\n--- Release Notes ---");

		// Check for existing notes in latest.json
		let existingNotes = "";
		try {
			const latestJsonContent = safeReadFile("./latest.json", "{}");
			const latestJson = safeParseJSON(latestJsonContent, "./latest.json");
			if (latestJson.notes) {
				existingNotes = latestJson.notes;
				logInfo("Existing release notes:");
				console.log(existingNotes);
			}
		} catch (err) {
			logInfo("No existing release notes found");
		}

		// Interactive notes input
		let releaseNotes = "";
		let useExistingNotes = false;
		if (existingNotes) {
			useExistingNotes = askYesNo("Keep existing release notes?", "y");
		}

		if (!useExistingNotes) {
			const notes = readline.question("Enter release notes: ");
			releaseNotes = notes.trim() || "";
		} else {
			releaseNotes = existingNotes;
		}

		logInfo(`Release notes prepared (${releaseNotes.length} chars)`);

		return { version: selectedVersion, releaseNotes };
	} catch (err) {
		logError(`Failed to get version and release notes: ${err.message}`);
		process.exit(1);
	}
};

// Initialize and choose build mode
const buildMode = askChoice("Build mode", { l: "local", r: "remote" }, "l");
if (buildMode === "l") {
	validateTarget(target);
	logInfo(`Building AstraNotes for ${target} (local)`);
} else {
	logInfo("Triggering remote CI build on GitHub Actions (macOS + Windows)");
}

const { version: selectedVersion, releaseNotes } = getVersionAndReleaseNotes();

// Update version in tauri.conf.json if needed
const updateTauriConfig = (version) => {
	try {
		const tauriConfigPath = "./src-tauri/tauri.conf.json";
		const configContent = safeReadFile(tauriConfigPath);
		const config = safeParseJSON(configContent, tauriConfigPath);

		if (config.version !== version) {
			config.version = version;
			safeWriteFile(tauriConfigPath, JSON.stringify(config, null, 2));
			logSuccess(`Updated tauri.conf.json with version ${version}`);
		} else {
			logInfo(`Version ${version} already set in tauri.conf.json`);
		}
	} catch (err) {
		logError(`Failed to update tauri config: ${err.message}`);
		process.exit(1);
	}
};

const updateLatestJson = (version, releaseNotes) => {
	const latestJsonPath = "./latest.json";
	const currentDate = new Date().toISOString();

	// Default JSON structure
	const latestJson = {
		version: version,
		notes: releaseNotes,
		pub_date: currentDate,
		platforms: {},
	};

	// Try to read existing file to preserve existing platforms
	try {
		const existingContent = safeReadFile(latestJsonPath, "{}");
		const existingJson = safeParseJSON(existingContent, latestJsonPath);

		// Preserve existing platforms
		latestJson.platforms = existingJson.platforms || {};
	} catch (err) {
		logInfo("Creating new latest.json");
	}

	// Read signature files with better error handling
	const readSignatureFile = (sigPath) => {
		try {
			logInfo(`Reading signature file: ${sigPath}`);

			if (!existsSync(sigPath)) {
				logError(`Signature file does not exist: ${sigPath}`);
				return "";
			}

			const stats = statSync(sigPath);
			if (!stats.isFile() || stats.size === 0) {
				logError(`Invalid signature file: ${sigPath}`);
				return "";
			}

			const signature = readFileSync(sigPath, "utf8").trim();
			logSuccess(
				`Signature file read successfully (${signature.length} chars)`,
			);
			return signature;
		} catch (err) {
			logError(`Error reading signature file ${sigPath}: ${err.message}`);
			return "";
		}
	};

	// Platform-specific updates
	if (target === "win") {
		const exeFile = `AstraNotes_${version}_x64_en-US.msi`;
		const exePath = `./dist-tauri/${exeFile}`;
		const sigPath = `${exePath}.sig`;

		logInfo("Windows Artifact Paths:");
		logInfo(`- MSI File: ${exePath}`);
		logInfo(`- Signature: ${sigPath}`);

		// Ensure artifacts exist
		if (!existsSync(exePath)) {
			logError(`Windows MSI not found: ${exePath}`);

			// Try alternative path
			const altExePath = `./src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/${exeFile}`;
			const altSigPath = `${altExePath}.sig`;

			if (existsSync(altExePath)) {
				logInfo(`Found MSI at alternative path, copying...`);
				copyFileSync(altExePath, exePath);
				if (existsSync(altSigPath)) {
					copyFileSync(altSigPath, sigPath);
				}
			} else {
				logError(`MSI not found at alternative path either: ${altExePath}`);
			}
		}

		latestJson.platforms["windows-x86_64"] = {
			url: `https://github.com/matteoveglia/AstraNotes/releases/download/v${version}/${exeFile}`,
			signature: readSignatureFile(sigPath),
		};
	} else {
		const appArchive = `AstraNotes.app.tar.gz`;
		const appArchivePath = `./dist-tauri/${appArchive}`;
		const sigPath = `${appArchivePath}.sig`;

		logInfo("macOS Artifact Paths:");
		logInfo(`- App Archive: ${appArchivePath}`);
		logInfo(`- Signature: ${sigPath}`);

		latestJson.platforms["darwin-aarch64"] = {
			url: `https://github.com/matteoveglia/AstraNotes/releases/download/v${version}/${appArchive}`,
			signature: readSignatureFile(sigPath),
		};
	}

	// Write updated JSON
	safeWriteFile(latestJsonPath, JSON.stringify(latestJson, null, 2));
	logSuccess(`Updated ${latestJsonPath} for ${target}`);
};

const moveArtifacts = (version) => {
	const distPath = "./dist-tauri";

	try {
		if (!existsSync(distPath)) {
			mkdirSync(distPath, { recursive: true });
			logInfo(`Created directory: ${distPath}`);
		}

		const getTargetPath = () => {
			switch (target) {
				case "win":
					return "x86_64-pc-windows-msvc";
				case "mac":
					return "aarch64-apple-darwin";
				case "macuniversal":
					return "universal-apple-darwin";
				default:
					throw new Error(`Unknown target: ${target}`);
			}
		};

		const basePath = "./src-tauri/target";
		const targetPath = getTargetPath();
		const bundlePath = `${basePath}/${targetPath}/release/bundle`;

		logInfo(`Moving artifacts from: ${bundlePath}`);

		if (target === "win") {
			// Windows MSI installer and signature
			const exeFile = `AstraNotes_${version}_x64_en-US.msi`;
			const exePath = `${bundlePath}/msi/${exeFile}`;
			const sigPath = `${exePath}.sig`;

			if (existsSync(exePath)) {
				copyFileSync(exePath, `${distPath}/${exeFile}`);
				logSuccess(`Moved Windows MSI: ${exeFile}`);

				if (existsSync(sigPath)) {
					copyFileSync(sigPath, `${distPath}/${exeFile}.sig`);
					logSuccess(`Moved signature file`);
				} else {
					logError(`Signature file not found: ${sigPath}`);
				}
			} else {
				logError(`Windows installer not found: ${exePath}`);
				throw new Error("Required Windows artifacts not found");
			}
		} else {
			// macOS artifacts
			const appArchive = `${bundlePath}/macos/AstraNotes.app.tar.gz`;
			const appSig = `${appArchive}.sig`;
			const dmgFile = `AstraNotes_${version}_aarch64.dmg`;
			const dmgPath = `${bundlePath}/dmg/${dmgFile}`;

			let artifactsMoved = false;

			// Move app archive and signature
			if (existsSync(appArchive)) {
				copyFileSync(appArchive, `${distPath}/AstraNotes.app.tar.gz`);
				logSuccess(`Moved macOS app archive`);

				if (existsSync(appSig)) {
					copyFileSync(appSig, `${distPath}/AstraNotes.app.tar.gz.sig`);
					logSuccess(`Moved app signature`);
				} else {
					logError(`App signature not found: ${appSig}`);
				}
				artifactsMoved = true;
			}

			// Move DMG
			if (existsSync(dmgPath)) {
				copyFileSync(dmgPath, `${distPath}/${dmgFile}`);
				logSuccess(`Moved macOS DMG: ${dmgFile}`);
				artifactsMoved = true;
			}

			if (!artifactsMoved) {
				logError("No macOS artifacts found to move");
				logInfo("Checked paths:");
				logInfo(`- App archive: ${appArchive}`);
				logInfo(`- DMG: ${dmgPath}`);
				throw new Error("Required macOS artifacts not found");
			}
		}
	} catch (err) {
		logError(`Error moving artifacts: ${err.message}`);
		throw err;
	}
};

const verifySigningKeys = () => {
	try {
		// Check private key
		const privateKeyContent = safeReadFile(
			process.env.TAURI_SIGNING_PRIVATE_KEY,
		);
		logSuccess(`Private key found: ${process.env.TAURI_SIGNING_PRIVATE_KEY}`);

		// Check public key
		const publicKeyPath = `${process.env.TAURI_SIGNING_PRIVATE_KEY}.pub`;
		const publicKeyContent = safeReadFile(publicKeyPath);
		logSuccess(`Public key found: ${publicKeyPath}`);

		return true;
	} catch (err) {
		logError(`Signing key verification failed: ${err.message}`);
		return false;
	}
};

const triggerRemoteWorkflow = async (version, notes) => {
	try {
		const repoEnv = process.env.GITHUB_REPOSITORY || "";
		const repoFromEnv = repoEnv.split("/");
		const owner = process.env.GH_OWNER || repoFromEnv[0] || "matteoveglia";
		const repo = process.env.GH_REPO || repoFromEnv[1] || "AstraNotes";
		const ref = process.env.GH_REF || "main";
		const workflowFile = process.env.GH_WORKFLOW || "release.yml";
		const token =
			process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_PAT;

		if (!token) {
			logError(
				"Missing GitHub token. Set GH_TOKEN (or GITHUB_TOKEN/GH_PAT) in your environment/.env",
			);
			process.exit(1);
		}

		const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`;
		const payload = {
			ref,
			inputs: { version, notes, draft: "true" },
		};

		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			const text = await res.text();
			throw new Error(
				`Failed to dispatch workflow: ${res.status} ${res.statusText} - ${text}`,
			);
		}

		logSuccess(`Remote build dispatched for v${version}`);
		logInfo(
			`View runs: https://github.com/${owner}/${repo}/actions/workflows/${workflowFile}`,
		);
		logInfo(
			"The release will be created as a draft with your short notes. Edit the full notes on GitHub and publish when ready.",
		);
		process.exit(0);
	} catch (err) {
		logError(err.message);
		process.exit(1);
	}
};

// Main execution
const main = async () => {
	try {
		logInfo("=".repeat(50));
		logInfo("AstraNotes Build Script");
		logInfo("=".repeat(50));

		if (buildMode === "r") {
			// Remote CI path: dispatch workflow and exit
			await triggerRemoteWorkflow(selectedVersion, releaseNotes);
			return;
		}

		// Local path: Verify signing keys
		if (!verifySigningKeys()) {
			logError("Signing keys not properly configured");
			process.exit(1);
		}

		// Update version in config (local)
		updateTauriConfig(selectedVersion);

		logInfo(
			`Version and release notes collected - latest.json update deferred until build success`,
		);

		// Run build
		logInfo("Starting Tauri build...");
		execSync(`pnpm tauri build --target ${targets[target]}`, {
			stdio: "inherit",
			env: { ...process.env },
		});
		logSuccess("Build completed successfully");

		// Post-build operations (only run if build succeeded)
		logInfo("Processing build artifacts...");
		moveArtifacts(selectedVersion);
		logInfo("Updating latest.json with collected release notes...");
		updateLatestJson(selectedVersion, releaseNotes);

		logInfo("=".repeat(50));
		logSuccess("Release automation completed successfully");
		logInfo(`Target: ${target}`);
		logInfo(`Version: ${selectedVersion}`);
		logInfo("=".repeat(50));
	} catch (err) {
		logError(`Build failed: ${err.message}`);
		process.exit(1);
	}
};

// Execute main function
main();
