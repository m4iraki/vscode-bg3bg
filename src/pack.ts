import * as lsx from './lsx';
import * as util from './util';
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { localization } from './loca';
import { promisify } from 'util';
import * as cp from 'child_process';
import * as ffs from 'fs';
import * as archiver from 'archiver';
import { Command, Commands } from './commands';

const fs = vscode.workspace.fs;
const join = vscode.Uri.joinPath;

async function pack(): Promise<void> {
    const root = util.rootFolder();
    const meta = lsx.LsxEntityStorage.meta();
    if (!root || !meta) {
        util.logError('Cannot pack project.' +
            ' Make sure meta.lsx is at /Mods/folder/meta.lsx');
        return;
    }
    const divine = util.getConfig('divineexe');
    if (!divine) {
        await util.setupConfig(
            'divineexe',
            'Divine.exe path not specified!');
        return;
    }
    const unsaved = await util.checkUnsaved();
    if (unsaved) {
        return;
    }
    const tmp = await mkTmp(root, meta);
    await mvLocalization(tmp, meta);
    await lsfFiles(tmp, meta, divine);

    const pak = await createPak(tmp, meta, divine);
    if (!pak) {
        util.logError('error during packing');
    } else {
        await createZip(pak, tmp, meta);
    }
    await util.rmrfDirectory(tmp);
}

async function mkTmp(
    root: vscode.Uri,
    meta: lsx.ModMeta,
): Promise<vscode.Uri> {
    const tmp = join(root, '..', `${meta.folder}_tmp`);
    await util.rmrfDirectory(tmp);
    await fs.copy(root, tmp);
    return tmp;
}

async function mvLocalization(
    tmp: vscode.Uri,
    meta: lsx.ModMeta,
): Promise<void> {
    const loca = join(tmp, localization);
    if (await util.dirExists(loca)) {
        const to = join(tmp, 'Mods', meta.folder, localization);
        await fs.copy(loca, to);
        await util.rmrfDirectory(loca);
    }
}

async function lsfFiles(
    tmp: vscode.Uri,
    meta: lsx.ModMeta,
    divine: string,
): Promise<void> {
    const pub = join(tmp, 'Public', meta.folder);
    const dirs = [
        join(pub, 'Content'),
        join(pub, 'RootTemplates'),
    ];
    const fts = dirs.map<lsx.LsLibFromTo>(
        e => ({ from: e, to: e, batch: true }));
    await lsx.lsx2lsf(fts, divine);
    const files = await Promise.all(dirs.map(async d => {
        const pattern = new vscode.RelativePattern(d, `**/*.lsx`);
        return await vscode.workspace.findFiles(pattern);
    })).then(r => r.flat());
    await Promise.all(files.map(async f => fs.delete(f, { useTrash: false })));
}

const exec = promisify(cp.execFile);
async function createPak(
    tmp: vscode.Uri,
    meta: lsx.ModMeta,
    divine: string,
): Promise<vscode.Uri | null> {
    try {
        const target = join(tmp, `${meta.name}.pak`);
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Converting...",
            cancellable: false
        }, async () => {
            const args = [
                '-g', 'bg3',
                '-a', 'create-package',
                '--source', tmp.fsPath,
                '--destination', target.fsPath,
            ];

            await exec(divine, args);
        });
        return target;
    } catch (e: unknown) {
        if (typeof (e) === 'object' && e && 'message' in e) {
            vscode.window.showErrorMessage(`${e.message}`);
        } else {
            vscode.window.showErrorMessage('error');
        }
        return null;
    }
}
interface ModInfo {
    Author: string;
    Name: string;
    Folder: string;
    Version: string;
    Description: string;
    UUID: string;
    Created: string;
    Dependencies: string[]; //todo deps reading. afaik not needed besides vertex
    Group: string;
}
interface ModsInfo {
    Mods: ModInfo[],
    MD5: string,
}
async function createInfo(
    pak: vscode.Uri,
    tmp: vscode.Uri,
    meta: lsx.ModMeta,
): Promise<vscode.Uri> {
    const data = await fs.readFile(pak);
    const now = new Date();
    const mod = {
        Author: meta.author,
        Name: meta.name,
        Folder: meta.folder,
        Version: meta.attrs.get('Version') || '',
        Description: meta.attrs.get('Description') || '',
        UUID: meta.id,
        Created: now.toJSON(),
        Dependencies: [],
        Group: '',
    } as ModInfo;
    const md5 =
        crypto.createHash('md5')
            .update(data)
            .digest('hex')
            .replaceAll('-', '')
            .toLocaleLowerCase();
    const info = {
        Mods: [mod],
        MD5: md5,
    } as ModsInfo;
    const target = join(tmp, 'info.json');
    await fs.writeFile(target, Buffer.from(JSON.stringify(info)));
    return target;
}

async function createZip(
    pak: vscode.Uri,
    tmp: vscode.Uri,
    meta: lsx.ModMeta,
): Promise<void> {
    const target = join(tmp, '..', `${meta.name}.zip`);
    if (await util.fileExists(target)) {
        await fs.delete(target, { useTrash: false });
    }
    const info = await createInfo(pak, tmp, meta);
    const os = ffs.createWriteStream(target.fsPath);
    const archive = archiver.create('zip');
    archive.pipe(os);
    archive.file(pak.fsPath, { name: `${meta.name}.pak` });
    archive.file(info.fsPath, { name: 'info.json' });
    await archive.finalize();
}

async function packProject(): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Packing Project...",
        cancellable: false
    }, pack);
}
export const createPackage: Command = Commands.create(
    'bg3bg.createPackage',
    packProject);
