import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';

export type LogLevel = 'Information' | 'Warning' | 'Error';

export const log =
    (level: LogLevel) =>
        <T extends string>(msg: string, ...items: T[]) =>
            logActions[level](msg, ...items);

export const logInfo = log('Information');
export const logWarning = log('Warning');
export const logError = log('Error');

type LogFuction =
    <T extends string>(msg: string, ...items: T[]) =>
        Thenable<T | undefined>;

const logActions: Record<LogLevel, LogFuction> = {
    Information: vscode.window.showInformationMessage,
    Warning: <T extends string>(msg: string, ...items: T[]) => {
        console.warn(msg);
        return vscode.window.showWarningMessage(msg, ...items);
    },
    Error: <T extends string>(msg: string, ...items: T[]) => {
        console.error(msg);
        return vscode.window.showErrorMessage(msg, ...items);
    },
};

export function newHandle(): string {
    return `h${uuidv4().replaceAll('-', 'g')}`;
}

export function newUUID(): string {
    return uuidv4();
}

export function findFiles(): Thenable<vscode.Uri[]> {
    return vscode.workspace.findFiles(
        '**/*.{txt,lsx,loca.xml}',
        '{**/toolkitified/**,**/tmp_toolkitify/**}',
    );
}

export async function dirExists(uri: vscode.Uri): Promise<boolean> {
    return exists(uri, vscode.FileType.Directory);
}

export async function fileExists(uri: vscode.Uri): Promise<boolean> {
    return exists(uri, vscode.FileType.File);
}

export async function exists(
    uri: vscode.Uri,
    tpe: vscode.FileType,
): Promise<boolean> {
    try {
        const fileStat = await vscode.workspace.fs.stat(uri);
        return fileStat.type === tpe;
    } catch {
        return false;
    }
}

export function rootFolder(): vscode.Uri | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return;
    }
    return workspaceFolders[0].uri;
}

export async function rmrfDirectory(uri: vscode.Uri): Promise<void> {
    if (await dirExists(uri)) {
        await vscode.workspace.fs.delete(
            uri,
            {
                recursive: true,
                useTrash: false
            }
        );
    }
}