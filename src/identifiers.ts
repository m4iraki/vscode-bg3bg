import * as vscode from 'vscode';
import * as util from './util';
import { Command, Commands } from './commands';
import { LsxEntityStorage } from './lsx';

export const generateUUID: Command = Commands.add(new Command(
    'bg3bg.generateUUID',
    () => generateToClipboard(util.newUUID, "UUID")));

export const generateHandle: Command = Commands.add(new Command(
    'bg3bg.generateHandle',
    () => generateToClipboard(util.newHandle, "handle")));

export const regenerateSelected: Command = Commands.create(
    'bg3bg.regenerateSelected',
    handleGlobalReplace);

export const regenerateAll = (ctx: vscode.ExtensionContext) => Commands.create(
    'bg3bg.regenerateAllIds',
    () => regenerateAllIdentifiers(ctx));

export const generateToClipboard = async (f: () => string, name: string) => {
    const text = f();
    try {
        await vscode.env.clipboard.writeText(text);
        util.logInfo('Generated new ' + name + ': ' + text);
    } catch {
        util.logError('Failed to generate ' + name);
    }
};

const handleRegexp = new RegExp(
    'h' +
    '[0-9a-f]{8}g' +
    '[0-9a-f]{4}g' +
    '4[0-9a-f]{3}g' +
    '[89ab][0-9a-f]{3}g' +
    '[0-9a-f]{12}',
    'i'
);

const uuidV4Regexp = new RegExp(
    '[0-9a-f]{8}-' +
    '[0-9a-f]{4}-' +
    '4[0-9a-f]{3}-' +
    '[89ab][0-9a-f]{3}-' +
    '[0-9a-f]{12}',
    'i'
);

const identifierRegexp = new RegExp(
    handleRegexp.source +
    '|' +
    uuidV4Regexp.source,
    'i'
);

const selectSmthError = 'Select some id to regenerate it!';

async function handleGlobalReplace() {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        util.logWarning(selectSmthError);
        return;
    }

    if (editor.selections.length > 1) {
        util.logWarning('Multiple selections found!\n' + selectSmthError);
        return;
    }

    const selectedText = getSelectedIdentifier(editor);
    if (!selectedText) {
        util.logWarning(selectSmthError);
        return;
    }

    const newIdentifier = getNewIdentifier(selectedText);
    if (!newIdentifier) {
        util.logWarning('Selected text is not an identifier. Abort operaion.');
        return;
    }

    const edit = new vscode.WorkspaceEdit();
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Replacing ${selectedText} in project...`,
        cancellable: false
    }, () => replaceInWholeProject(selectedText, newIdentifier, edit));
}

async function regenerateAllIdentifiers(
    context: vscode.ExtensionContext,
): Promise<void> {
    const regions = await util.qpWithConfig(
        'Select Entities to Regenerate IDs for',
        LsxEntityStorage.getEntityTypes(),
        'bg3bg.regen.selected',
        context,
    );
    const entities = LsxEntityStorage.getEntitiesByTypes(regions);
    const uniqueIds = [... new Set(entities.map(e => e.id))];
    const idMap: Record<string, string> = {};
    for (const id of uniqueIds) {
        const newId = getNewIdentifier(id);
        if (newId) {
            idMap[id] = newId;
        }
    }
    const edit = new vscode.WorkspaceEdit();
    if (!idMap.isEmpty) {
        await replaceIdentifiersInProject(edit, idMap);
    }
}

function getNewIdentifier(selectedText: string): string | undefined {
    if (uuidV4Regexp.test(selectedText)) {
        return util.newUUID();
    }
    if (handleRegexp.test(selectedText)) {
        return util.newHandle();
    }
    return;
}

function getSelectedIdentifier(editor: vscode.TextEditor): string | undefined {
    if (editor.selection.isEmpty) {

        const position = editor.selection.active;
        const range = editor.document.getWordRangeAtPosition(
            position,
            /"([-\w]+)"/);

        if (range) {
            const text = editor.document.getText(range);
            return text.substring(1, text.length - 1).trim();
        } else {
            return;
        }
    } else {
        return editor.document.getText(editor.selection).trim();
    }
}

async function replaceInWholeProject(
    from: string,
    to: string,
    edit: vscode.WorkspaceEdit,
) {
    const success = await replaceIdentifiersInProject(edit, { [from]: to });
    if (success) {
        await vscode.env.clipboard.writeText(to);
        util.logInfo(
            `${from} replaced with ` +
            `${to} in project. ` +
            `${to} added to clipboard`);
    } else {
        util.logWarning(`${from} replacement not finished!`);
    }
}

async function replaceIdentifiersInProject(
    edit: vscode.WorkspaceEdit,
    map: Record<string, string>,
): Promise<boolean> {
    const fileUris = await util.findFiles('lsx', 'xml', 'txt');
    const processingTasks = fileUris.map(async (uri) => {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            processFile(document, edit, map);
        } catch (e: unknown) {
            if (e instanceof Error) {
                util.logError(`Failed to process ${uri.fsPath}: ${e.message}`);
            } else {
                util.logError(`Failed to process ${uri.fsPath}`);
            }
        }
    });
    await Promise.all(processingTasks);
    return vscode.workspace.applyEdit(edit);
}

async function processFile(
    document: vscode.TextDocument,
    edit: vscode.WorkspaceEdit,
    map: Record<string, string>,
) {
    const text = document.getText();
    const regexp = new RegExp(identifierRegexp, 'gi');
    for (const match of text.matchAll(regexp)) {
        const foundId = match[0];
        const replacementId = map[foundId];

        if (replacementId && match.index !== undefined) {
            const range = new vscode.Range(
                document.positionAt(match.index),
                document.positionAt(match.index + foundId.length));

            edit.replace(document.uri, range, replacementId);
        }
    }
}
