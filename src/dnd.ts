import * as vscode from 'vscode';
import * as util from './util';

export class BG3EntityDragController<T extends vscode.TreeItem>
    implements vscode.TreeDragAndDropController<T> {
    constructor(readonly id: (item: T) => string | null) { }
    dropMimeTypes: readonly string[] = [];
    dragMimeTypes: readonly string[] = ['text/plain'];
    handleDrag?(
        source: readonly T[],
        dataTransfer: vscode.DataTransfer,
        _token: vscode.CancellationToken,
    ): Thenable<void> | void {
        const item = source[0];
        if (item && item.label) {
            dataTransfer.set(
                'text/plain',
                new vscode.DataTransferItem(this.id(item)));
        }
    }
}
type BG3EntityDropProviderResult =
    | vscode.DocumentDropEdit
    | vscode.DocumentDropEdit[];
export class BG3EntityDropProvider implements vscode.DocumentDropEditProvider {
    static idRegexp = new RegExp(
        '"(' +
        util.handleRegexp.source +
        '|' +
        util.uuidV4Regexp.source +
        '|)"',
        'i'
    );
    provideDocumentDropEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        dataTransfer: vscode.DataTransfer,
        _token: vscode.CancellationToken,
    ): vscode.ProviderResult<BG3EntityDropProviderResult> {
        const dataItem = dataTransfer.get('text/plain');
        if (!dataItem) { return undefined; }
        const identifier = dataItem.value;
        const range = document.getWordRangeAtPosition(
            position,
            BG3EntityDropProvider.idRegexp);
        if (range) {
            const edit = new vscode.DocumentDropEdit('');
            const workspaceEdit = new vscode.WorkspaceEdit();
            workspaceEdit.replace(document.uri, range, `"${identifier}"`);
            edit.additionalEdit = workspaceEdit;
            return edit;
        }
        return new vscode.DocumentDropEdit(identifier);
    }

}