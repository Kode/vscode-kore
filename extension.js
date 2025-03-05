'use strict';

const child_process = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');

let channel = null;

function sys() {
	if (os.platform() === 'linux') {
		if (os.arch() === 'arm') return '-linuxarm';
		else if (os.arch() === 'arm64') return '-linuxaarch64';
		else if (os.arch() === 'x64') return '-linux64';
		else return '-linux32';
	}
	else if (os.platform() === 'win32') {
		return '.exe';
	}
	else if (os.platform() === 'freebsd') {
		return '-freebsd';
	}
	else {
		return '-osx';
	}
}

function sys2() {
	if (os.platform() === 'win32') {
		return '.exe';
	}
	else {
		return '';
	}
}

function sysdir() {
	if (os.platform() === 'linux') {
		if (os.arch() === 'arm') return 'linux_arm';
		if (os.arch() === 'arm64') return 'linux_arm64';
		else if (os.arch() === 'x64') return 'linux_x64';
		else throw 'Unsupported CPU';
	}
	else if (os.platform() === 'win32') {
		return 'windows_x64';
	}
	else if (os.platform() === 'freebsd') {
		return 'freebsd_x64';
	}
	else {
		return 'macos';
	}
}

function getExtensionPath() {
	return vscode.extensions.getExtension('kodetech.kore').extensionPath;
}

// will error when findKore is used
function findKoreWithKfile(channel, directory) {
	return new Promise((resolve, reject) => {
		try {
			const kfile = path.resolve(directory, 'kfile.js');
			if (fs.existsSync(kfile)) {
				const resolver = (project) => {
					resolve(project);
				};

				const rejecter = () => {
					reject();
				};

				const file = fs.readFileSync(kfile, 'utf8');
				const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
				const project = new AsyncFunction(
					'log',
					'Project',
					'Platform',
					'platform',
					'GraphicsApi',
					'graphics',
					'Architecture',
					'arch',
					'AudioApi',
					'audio',
					'VrApi',
					'vr',
					'cpp',
					'require',
					'resolve',
					'reject',
					'__dirname',
					'Options',
					'targetDirectory',
					file)
					(new Proxy({}, {
						set: (object, key, value, proxy) => {
							return true;
						},
						get: (target, prop, receiver) => {
							return () => {};
						}
					}),
					Project,
					Platform,
					'tizen',
					GraphicsApi,
					'default',
					Architecture,
					'default',
					AudioApi,
					'default',
					VrApi,
					'none',
					false,
					require,
					resolver,
					rejecter,
					path.resolve(directory),
					{},
					'').catch(
						(err) => {
							channel.appendLine('Error when searching for Kore in the kfile: ' + err);
							reject();
						}
					);;
			}
			else {
				reject();
			}
		}
		catch (err) {
			channel.appendLine('Error when searching for Kore in the kfile: ' + err);
			reject();
		}
	});
}

let currentDirectory = null;
let koreDirectory = null;

class Project {
	constructor(name) {
		if (name === 'Kore') {
			koreDirectory = currentDirectory;
		}

		return new Proxy(this, {
			set: (object, key, value, proxy) => {
				return true;
			},
			get: (target, prop, receiver) => {
				if (prop === 'addProject') {
					return async (directory) => {
						if (name === 'Kore' || name === 'Kinc') {
							return new Proxy({}, {
								set: (object, key, value, proxy) => {
									return true;
								},
								get: (target, prop, receiver) => {
									return () => {};
								}
							});
						}
						else {
							const prevDirectory = currentDirectory;
							currentDirectory = path.resolve(currentDirectory, directory);
							const r = await findKoreWithKfile(channel, currentDirectory);
							currentDirectory = prevDirectory;
							return r;
						}
					};
				}
				else if (prop === 'then') {
					return undefined;
				}
				else {
					return () => {};
				}
			}
		});
	}
}

const Platform = {
	Tizen: 'tizen'
};

const GraphicsApi = {};

const Architecture = {};

const AudioApi = {};

const VrApi = {};

let ranKoreFile = false;

async function findKore(channel) {
	if (!ranKoreFile) {
		koreDirectory = null;
		currentDirectory = path.resolve(vscode.workspace.rootPath);
		try {
			await findKoreWithKfile(channel, currentDirectory);
			ranKoreFile = true;
		}
		catch (err) {

		}
	}

	if (koreDirectory) {
		return koreDirectory;
	}

	let localkorepath = path.resolve(vscode.workspace.rootPath, 'Kore');
	if (fs.existsSync(localkorepath) &&
		(
			fs.existsSync(path.join(localkorepath, 'tools', sysdir(), 'kmake' + sys2()))
			|| fs.existsSync(path.join(localkorepath, 'tools', 'kmake', 'kmake'))
			|| fs.existsSync(path.join(localkorepath, 'Tools', sysdir(), 'kmake' + sys2()))
			|| fs.existsSync(path.join(localkorepath, 'Tools', 'kmake', 'kmake'))
		)) {
		return localkorepath;
	}

	let korepath = vscode.workspace.getConfiguration('kore').korePath;
	if (korepath.length > 0) {
		return path.isAbsolute(korepath) ? korepath : path.resolve(vscode.workspace.rootPath, korepath);
	}

	return path.join(getExtensionPath(), 'Kore');
}

async function isUsingInternalKore(channel) {
	return await findKore(channel) === path.join(getExtensionPath(), 'Kore');
}

async function findKmake(channel) {
	let kmakePath = path.join(await findKore(channel), 'tools', sysdir(), 'kmake' + sys2());
	if (fs.existsSync(kmakePath)) {
		return kmakePath;
	}

	kmakePath = path.join(await findKore(channel), 'Tools', sysdir(), 'kmake' + sys2());
	if (fs.existsSync(kmakePath)) {
		return kmakePath;
	}

	return path.join(await findKore(channel), 'Tools', 'kmake', 'kmake' + sys());
}

function findFFMPEG() {
	return vscode.workspace.getConfiguration('kore').ffmpeg;
}

function createOptions(target, compile) {
	const options = [
		'--from', vscode.workspace.rootPath,
		'--to', path.join(vscode.workspace.rootPath, vscode.workspace.getConfiguration('kore').buildDir),
		'-t', target
	];
	if (findFFMPEG()) {
		options.push('--ffmpeg');
		options.push(findFFMPEG());
	};
	if (compile) {
		options.push('--compile');
	}
	return options;
}

function compile(target, silent) {
	return new Promise(async (resolve, reject) => {
		if (!silent) {
			channel.appendLine('Saving all files.');
			vscode.commands.executeCommand('workbench.action.files.saveAll');
		}

		if (!vscode.workspace.rootPath) {
			channel.appendLine('No project opened.');
			reject();
			return;
		}

		if (!fs.existsSync(path.join(vscode.workspace.rootPath, 'kfile.js')) && !fs.existsSync(path.join(vscode.workspace.rootPath, 'korefile.js')) && !fs.existsSync(path.join(vscode.workspace.rootPath, 'kincfile.js'))) {
			channel.appendLine('No kfile found.');
			reject();
			return;
		}

		if (fs.existsSync(path.join(vscode.workspace.rootPath, 'khafile.js'))) {
			channel.appendLine('khafile found.');
			reject();
			return;
		}

		const child = child_process.spawn(await findKmake(channel), createOptions(target, true));

		child.stdout.on('data', (data) => {
			channel.appendLine(data);
		});

		child.stderr.on('data', (data) => {
			channel.appendLine(data);
		});

		child.on('error', () => {
			channel.appendLine('Could not start kmake to compile the project.');
		});

		child.on('close', (code) => {
			if (code === 0) {
				resolve();
			}
			else {
				reject();
			}
		});
	});
}

/*let KoreDisplayArgumentsProvider = {
	init: (api, activationChangedCallback) => {
		this.api = api;
		this.activationChangedCallback = activationChangedCallback;
		this.description = 'Kore project';
	},
	activate: (provideArguments) => {
		this.updateArgumentsCallback = provideArguments;
		if (this.args) {
			this.update(this.args);
		}
		this.activationChangedCallback(true);
	},
	deactivate: () => {
		this.updateArgumentsCallback = null;
		this.activationChangedCallback(false);
	},
	update: (args) => {
		if (this.args !== args && this.api) {
			this.args = args;
			this.parsedArguments = this.api.parseHxmlToArguments(args);
			if (this.updateArgumentsCallback) {
				this.updateArgumentsCallback(this.parsedArguments);
			}
		}
	}
}*/

function currentPlatform() {
	if (os.platform() === 'win32') {
		return 'windows';
	}
	else if (os.platform() === 'darwin') {
		return 'osx';
	}
	else {
		return 'linux'
	}

}

function chmod(filepath) {
	if (fs.existsSync(filepath)) {
		fs.chmodSync(filepath, 0o755);
	}
}

async function chmodEverything() {
	if (os.platform() === 'win32') {
		return;
	}

	const base = await findKore();

	chmod(path.join(base, 'tools', sysdir(), 'kraffiti'));
	chmod(path.join(base, 'tools', sysdir(), 'krafix'));
	chmod(path.join(base, 'tools', sysdir(), 'kmake'));

	chmod(path.join(base, 'Tools', sysdir(), 'kraffiti'));
	chmod(path.join(base, 'Tools', sysdir(), 'krafix'));
	chmod(path.join(base, 'Tools', sysdir(), 'kmake'));
}

async function checkProject(rootPath, channel) {
	if (!fs.existsSync(path.join(rootPath, 'kfile.js'))) {
		return;
	}

	if (fs.existsSync(path.join(rootPath, 'khafile.js'))) {
		return;
	}

	if (await isUsingInternalKore(channel)) {
		chmodEverything()
	}

	const options = createOptions(currentPlatform(), false);
	options.push('--vscode');
	options.push('--noshaders');
	child_process.spawnSync(await findKmake(channel), options);

	/*const protoPath = path.join(rootPath, '.vscode', 'protolaunch.json');
	let proto = null;
	if (fs.existsSync(protoPath)) {
		proto = JSON.parse(fs.readFileSync(protoPath, 'utf-8'));
	}

	const configuration = vscode.workspace.getConfiguration();
	let config = configuration.get('launch');
	config.configurations = config.configurations.filter((value) => {
		return !value.name.startsWith('Kore: ');
	});
	if (proto) {
		config.configurations.push(proto);
	}
	configuration.update('launch', config, false);*/
}

const KoreTaskProvider = {
	kmake: null,
	provideTasks: () => {
		let workspaceRoot = vscode.workspace.rootPath;
		if (!workspaceRoot) {
			return [];
		}

		const systems = [
			{ arg: 'windows', name: 'Windows', default: false, withdebug: true },
			{ arg: 'windows', name: 'Windows (Direct3D 11)', default: false, graphics: 'direct3d11', withdebug: true },
			{ arg: 'windows', name: 'Windows (Direct3D 9)', default: false, graphics: 'direct3d9', withdebug: true },
			{ arg: 'windows', name: 'Windows (Vulkan)', default: false, graphics: 'vulkan', withdebug: true },
			{ arg: 'windows', name: 'Windows (OpenGL)', default: false, graphics: 'opengl', withdebug: true },
			{ arg: 'windowsapp', name: 'Windows Universal', default: false, withdebug: true },
			{ arg: 'osx', name: 'macOS', default: false, withdebug: true },
			{ arg: 'osx', name: 'macOS (OpenGL)', default: false, graphics: 'opengl', withdebug: true },
			{ arg: 'linux', name: 'Linux', default: false, withdebug: true },
			{ arg: 'linux', name: 'Linux (OpenGL)', default: false, graphics: 'opengl', withdebug: true },
			{ arg: 'android', name: 'Android', default: false, withdebug: false },
			{ arg: 'android', name: 'Android (OpenGL)', default: false, graphics: 'opengl', withdebug: false },
			{ arg: 'ios', name: 'iOS', default: false, withdebug: false },
			{ arg: 'ios', name: 'iOS (OpenGL)', default: false, graphics: 'opengl', withdebug: false },
			{ arg: 'pi', name: 'Raspberry Pi', default: false, withdebug: false },
			{ arg: 'tvos', name: 'tvOS', default: false, withdebug: false },
			{ arg: 'html5', name: 'HTML5', default: false, withdebug: false },
			{ arg: 'ps4', name: 'PlayStation 4', default: false, withdebug: false },
			{ arg: 'xboxone', name: 'Xbox One', default: false, withdebug: false },
			{ arg: 'switch', name: 'Switch', default: false, withdebug: false },
			{ arg: 'ps5', name: 'PlayStation 5', default: false, withdebug: false },
			{ arg: 'xboxscarlett', name: 'Xbox Series X|S', default: false, withdebug: false }
		];

		let tasks = [];
		for (const system of systems) {
			let debugflags = system.withdebug ? [false, true] : [false];
			for (const debugflag of debugflags) {
				let args = [system.arg];

				if (findFFMPEG().length > 0) {
					args.push('--ffmpeg');
					args.push(findFFMPEG());
				}

				args.push('--compile');
				if (debugflag) {
					args.push('--debug');
				}

				if (system.graphics) {
					args.push('--graphics');
					args.push(system.graphics);
				}

				let kind = {
					type: 'Kore',
					target: system.name,
				}

				let prefix = '';
				if (debugflag) {
					kind.target += ' Debug';
					prefix = 'Debug ';
				}

				let task = null;
				let kmakePath = KoreTaskProvider.kmake; //findKmake();

				// On Windows, git bash shell won't accept backward slashes and will fail,
				// so we explicitly need to convert path to unix-style.
				if (os.platform() === 'win32') {
					let winShell = vscode.workspace.getConfiguration('terminal.integrated.shell').get('windows');
					if (!winShell) {
						winShell = vscode.workspace.getConfiguration('terminal.integrated.defaultProfile').get('windows');
					}
					if (winShell && winShell.toLowerCase().includes('bash') > -1) {
						kmakePath = kmakePath.replace(/\\/g, '/');
					}
				}

				function compile() {}

				task = new vscode.Task(kind, vscode.TaskScope.Workspace, `${prefix}Build for ${system.name}`, 'Kore', new vscode.ShellExecution(kmakePath, args), ['$msCompile']);
				task.group = vscode.TaskGroup.Build;
				tasks.push(task);
			}
		}

		return tasks;
	},
	resolveTask: (task/*, token*/) => {
		return task;
	}
}

/*const KoreDebugProvider = {
	provideDebugConfigurations: (folder) => {
		let configs = [];

		folder.uri;

		const buildDir = vscode.workspace.getConfiguration('kore').buildDir;
		configs.push({
			name: 'Kore: Launch',
			request: 'launch',
			type: 'kore',
			appDir: '${workspaceFolder}/' + buildDir,
			preLaunchTask: 'Kore: Build',
			internalConsoleOptions: 'openOnSessionStart',
		});

		return configs;
	},
	resolveDebugConfiguration: (folder, debugConfiguration) => {
		return undefined;
	}
}*/

//let currentTarget = 'HTML5';

async function directoryExists(filePath) {
    return new Promise((resolve, reject) => {
        fs.stat(filePath, (err, stats) => {
            if (stats && stats.isDirectory()) {
                resolve(true);
            }
			else {
                resolve(false);
            }
        });
    });
}

function resolveDownloadPath(filename) {
	let basePath = getExtensionPath();
    basePath = path.resolve(basePath, filename);
    return basePath;
}

let koreDownloaded = false;

async function checkKore(channel) {
	if (!await isUsingInternalKore(channel)) {
		return;
	}

	const downloadPath = resolveDownloadPath('Kore');
	if (await directoryExists(downloadPath)) {
		koreDownloaded = true;
		return;
	}

	return new Promise((resolve, reject) => {
		vscode.window.showInformationMessage('Downloading Kore...');
		let message = vscode.window.setStatusBarMessage('Downloading Kore...');

		const process = child_process.spawn('git', ['clone', 'https://github.com/Kode/Kore.git', downloadPath]);

		let error = null;

		process.on('error', (err) => {
			error = err;
		})

		process.on('close', (code) => {
			if (code === 0) {
				child_process.exec(path.join(downloadPath, (os.platform() === 'win32') ? 'get_dlc.bat' : 'get_dlc'), (err) => {
					message.dispose();

					if (err) {
						vscode.window.showInformationMessage('Could not download Kore because ' + error);
					}
					else {
						koreDownloaded = true;
						vscode.window.showInformationMessage('Finished downloading Kore.');
					}

					resolve();
				});
			}
			else {
				message.dispose();
				if (error) {
					vscode.window.showInformationMessage('Could not download Kore because ' + error);
				}
				else {
					vscode.window.showInformationMessage('Could not download Kore, git returned ' + code + '.');
				}
				resolve();
			}
		});
	});
}

async function updateKore() {
	const downloadPath = resolveDownloadPath('Kore');
	if (!koreDownloaded) {
		vscode.window.showInformationMessage('Could not update Kore because it was not yet downloaded');
		return;
	}

	return new Promise((resolve, reject) => {
		vscode.window.showInformationMessage('Updating Kore...');
		let message = vscode.window.setStatusBarMessage('Updating Kore...');

		const process = child_process.spawn('git', ['-C', downloadPath, 'pull', 'origin', 'main']);

		let error = null;

		process.on('error', (err) => {
			error = err;
		})

		process.on('close', (code) => {
			if (code === 0) {
				child_process.exec(path.join(downloadPath, (os.platform() === 'win32') ? 'get_dlc.bat' : 'get_dlc'), (err) => {
					message.dispose();

					if (err) {
						vscode.window.showInformationMessage('Could not update Kore because ' + error);
					}
					else {
						vscode.window.showInformationMessage('Finished updating Kore.');
					}

					resolve();
				});
			}
			else {
				message.dispose();
				if (error) {
					vscode.window.showInformationMessage('Could not update Kore because ' + error);
				}
				else {
					vscode.window.showInformationMessage('Could not update Kore, git returned ' + code + '.');
				}
				resolve();
			}
		});
	});
}

exports.activate = async (context) => {
	channel = vscode.window.createOutputChannel('Kore');

	await checkKore(channel);

	if (vscode.workspace.rootPath) {
		checkProject(vscode.workspace.rootPath, channel);
	}

	findKmake(channel).then((kmake) => {
		KoreTaskProvider.kmake = kmake;
		let provider = vscode.workspace.registerTaskProvider('Kore', KoreTaskProvider);
		context.subscriptions.push(provider);
	});

	// TODO: Figure out why this prevents debugging
	// let debugProvider = vscode.debug.registerDebugConfigurationProvider('kore', KoreDebugProvider);
	// context.subscriptions.push(debugProvider);

	vscode.workspace.onDidChangeWorkspaceFolders((e) => {
		for (let folder of e.added) {
			if (folder.uri.fsPath) {
				checkProject(folder.uri.fsPath);
			}
		}
	});

	const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], '{kfile.js,korefile.js,kincfile.js}'));
	context.subscriptions.push(watcher.onDidChange((filePath) => {
		checkProject(vscode.workspace.workspaceFolders[0]);
	}));

	let disposable = vscode.commands.registerCommand('kore.init', async function () {
		if (!vscode.workspace.rootPath) {
			channel.appendLine('No project opened.');
			return;
		}

		if (fs.existsSync(path.join(vscode.workspace.rootPath, 'kfile.js'))
		|| fs.existsSync(path.join(vscode.workspace.rootPath, 'korefile.js'))
		|| fs.existsSync(path.join(vscode.workspace.rootPath, 'kincfile.js'))) {
			channel.appendLine('A Kore project already exists in the project directory.');
			return;
		}

		if (fs.existsSync(path.join(vscode.workspace.rootPath, 'khafile.js'))) {
			channel.appendLine('A Kha project already exists in the project directory.');
			return;
		}

		const child = child_process.spawn(await findKmake(channel), ['--init', '--name', 'Project', '--from', vscode.workspace.rootPath]);

		child.on('error', () => {
			channel.appendLine('Could not start kmake to initialize a new project.');
		});

		child.on('close', (code) => {
			if (code === 0) {
				vscode.commands.executeCommand('workbench.action.reloadWindow');
				vscode.window.showInformationMessage('Kore project created.');
			}
			else {
				channel.appendLine('kmake --init returned an error.');
			}
		});
	});

	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('kore.findKore', () => {
		return findKore();
	});

	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('kore.findFFMPEG', () => {
		return findFFMPEG();
	});

	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('kore.updateKore', () => {
		updateKore();
	});

	context.subscriptions.push(disposable);

	/*const targetItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	targetItem.text = '$(desktop-download) HTML5';
	targetItem.tooltip = 'Select Completion Target';
	targetItem.command = 'kha.selectCompletionTarget';
	targetItem.show();
	context.subscriptions.push(targetItem);

	disposable = vscode.commands.registerCommand("kha.selectCompletionTarget", () => {
		let items = ['HTML5', 'Krom', 'Kore', 'Android (Java)', 'Flash', 'HTML5-Worker', 'Java', 'Node.js', 'Unity', 'WPF'];
		vscode.window.showQuickPick(items).then((choice) => {
			if (!choice || choice === currentTarget) {
				return;
			}

			currentTarget = choice;
			targetItem.text = '$(desktop-download) ' + choice;

			function choiceToHxml() {
				switch (choice) {
					case 'HTML5':
						return 'debug-html5';
					case 'Krom':
						return 'krom';
					case 'Kore':
						switch (process.platform) {
							case 'win32':
								return 'windows';
							case 'darwin':
								return 'osx';
							case 'linux':
								return 'linux';
							default:
								return process.platform;
						}
					case 'Android (Java)':
						return 'android';
					case 'Flash':
						return 'flash';
					case 'HTML5-Worker':
						return 'html5worker';
					case 'Java':
						return 'java';
					case 'Node.js':
						return 'node';
					case 'Unity':
						return 'unity';
					case 'WPF':
						return 'wpf';
				}
			}

			const rootPath = vscode.workspace.rootPath;
			const buildDir = vscode.workspace.getConfiguration('kha').buildDir;
			const hxmlPath = path.join(rootPath, buildDir, 'project-' + choiceToHxml() + '.hxml');
			if (fs.existsSync(hxmlPath)) {
				updateHaxeArguments(rootPath, hxmlPath);
			}
			else {
				compile(choiceToHxml(), true).then(() => {
					updateHaxeArguments(rootPath, hxmlPath);
				});
			}
		});
	});
	context.subscriptions.push(disposable);*/

	let api = {
		findKore: findKore,
		findFFMPEG: findFFMPEG,
		compile: compile,
		updateKore: updateKore
	};

	return api;
};

exports.deactivate = () => {

};
