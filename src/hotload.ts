import * as vscode from 'vscode';
import * as fs from 'fs';
import * as paths from 'path';
import * as util from './util';
import { Command, Commands } from './commands';
import { LsxEntityStorage } from './lsx';

export const cmdHotloadOn: Command = Commands.create(
    'bg3bg.hotloadOn',
    () => hotload(true));
export const cmdHotloadOff: Command = Commands.create(
    'bg3bg.hotloadOff',
    () => hotload(false));

interface FromTo {
    from: string;
    to: string;
    short: string[];
}
const GEN = 'Generated';
const PUB = 'Public';
const MOD = 'Mods';
const DEL = 'Delete';
const TRM = 'Cancel';
async function hotload(on: boolean): Promise<void> {
    const root = util.rootFolder();
    const meta = LsxEntityStorage.meta();
    if (!root || !meta) {
        util.logNoProj();
        return;
    }
    const data = util.getConfig('gamedata');
    if (data === undefined) {
        util.setupConfig(
            'gamedata',
            'Game\' \'Data\' path is not specified');
        return;
    }
    const ft = (...e: string[]) => ({
        from: paths.join(root.fsPath, ...e, meta.folder),
        to: paths.join(data, ...e, meta.folder),
        short: e,
    } as FromTo);
    const fts = [
        ft(GEN, PUB),
        ft(MOD),
        ft(PUB),
    ];
    const realDirs = fts.filter(f => isRealDir(f.to));
    if (realDirs.length > 0) {
        const act = await util.logError(
            'Folders really exists: ' +
            realDirs.map(d => d.short.join('/')).join(', ') +
            ' Delete them? Cannot proceed without deletion.',
            DEL, TRM);
        if (act === DEL) {
            await Promise.all(
                realDirs.map(d =>
                    util.rmrfDirectory(vscode.Uri.file(d.to))));
        } else {
            util.logWarning('Terminated');
            return;
        }
    }
    fts.forEach(rmLink);
    if (!on) {
        util.logInfo(`Hotload for ${meta.name} disabled!`);
        return;
    }
    util.logInfo(`Hotload for ${meta.name} enabled!`);
    fts.forEach(f => fs.symlinkSync(f.from, f.to, 'dir'));
}

function isRealDir(path: string): boolean {
    const stats = fs.lstatSync(path, { throwIfNoEntry: false });
    if (!stats) { return false; }
    return !stats.isSymbolicLink();
}

function rmLink(ft: FromTo): void {
    if (fs.existsSync(ft.to)) { fs.unlinkSync(ft.to); }
}