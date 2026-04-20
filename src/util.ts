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

const qpItem = (s: string) => {
    return { label: s };
};

export async function qp(
    title: string,
    items: string[],
    options?: {
        defaultItems?: string[],
        placeholder?: string,
    },
): Promise<string[]> {
    const qp = vscode.window.createQuickPick();
    const qpitems = items.map(qpItem);
    const selectedItems = qpitems.filter(item =>
        options?.defaultItems?.includes(item.label)
    );
    qp.items = qpitems;
    qp.selectedItems = selectedItems;
    qp.canSelectMany = true;
    qp.title = title;
    qp.placeholder = options?.placeholder;
    qp.show();
    return new Promise<string[]>((resolve) => {
        qp.onDidAccept(() => {
            const selected = qp.selectedItems.map(i => i.label);
            qp.hide();
            resolve(selected);
        });
        qp.onDidHide(() => {
            qp.dispose();
            resolve([]);
        });
    });
}

export async function qpWithConfig(
    title: string,
    items: string[],
    key: string,
    ctx: vscode.ExtensionContext,
    options?: {
        placeholder?: string,
    }
): Promise<string[]> {
    const saved = ctx.workspaceState.get<string[]>(key, []);
    const selected = await qp(
        title,
        items,
        {
            defaultItems: saved,
            placeholder: options?.placeholder,
        }
    );
    await ctx.workspaceState.update(key, selected);
    return selected;
}