import * as lsx from './lsx';
import * as util from './util';
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { localization } from './loca';
import { promisify } from 'util';
import * as cp from 'child_process';
import { Command, Commands } from './commands';
import { Zip, ZipPassThrough, strToU8 } from 'fflate';
import * as ffs from 'fs';

const fs = vscode.workspace.fs;
const join = vscode.Uri.joinPath;

async function pack(
    _progress: vscode.Progress<{message?: string, increment?: number}>,
    token: vscode.CancellationToken,
): Promise<void> {
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
        await createZip(pak, tmp, meta, token);
    }
    await util.rmrfDirectory(tmp);
    if (pak) { await vscode.env.openExternal(join(root, '..')); }
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
function createInfo(
    rawMD5: string,
    meta: lsx.ModMeta,
): ModsInfo {
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
    const md5 = rawMD5
        .replaceAll('-', '')
        .toLocaleLowerCase();
    return {
        Mods: [mod],
        MD5: md5,
    } as ModsInfo;
}

async function createZip(
    pak: vscode.Uri,
    tmp: vscode.Uri,
    meta: lsx.ModMeta,
    token: vscode.CancellationToken,
): Promise<vscode.Uri> {
    const target = join(tmp, '..', `${meta.name}.zip`);
    if (await util.fileExists(target)) {
        await fs.delete(target, { useTrash: false });
    }
    const rawMD5 = crypto.createHash('md5');
    const zip = new Zip();
    const os = ffs.createWriteStream(target.fsPath);
    zip.ondata = (err, data, final) => {
        if (err) { throw err; }
        os.write(data);
        if (final) { os.end(); }
    };

    const pakEntry = new ZipPassThrough(util.fname(pak));
    zip.add(pakEntry);
    const is = ffs.createReadStream(pak.fsPath);
    for await (const batch of is) {
        if (token.isCancellationRequested) {
            is.destroy();
            os.destroy();
            util.logWarning('Canceled by user');
            break;
        }
        rawMD5.update(batch);
        pakEntry.push(new Uint8Array(batch));
    }
    pakEntry.push(new Uint8Array(0), true);

    const info = createInfo(rawMD5.digest('hex'), meta);
    const infoEntry = new ZipPassThrough('info.json');
        zip.add(infoEntry);
        infoEntry.push(strToU8(JSON.stringify(info)), true);
    zip.end();

    return target;
}

async function packProject(): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Packing Project...",
        cancellable: true
    }, pack);
}
export const createPackage: Command = Commands.create(
    'bg3bg.createPackage',
    packProject);
