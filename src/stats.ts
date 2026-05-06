import * as vscode from 'vscode';
import * as util from './util';

export interface Stats {
    name: string;
    type: string;
    using?: string;
    data: Map<string, string>;
    uri: vscode.Uri;
    start: vscode.Position;
    end: vscode.Position;
}

export class StatsStorage {
    private static stats = new Map<string, Stats>();
    private static byFileCache = new Map<string, Stats[]>;
    public static get(name: string): Stats | undefined {
        return this.stats.get(name);
    }
    public static getAll(): Stats[] {
        return Array.from(this.stats.values());
    }
    public static updateFile(doc: vscode.TextDocument): void {
        const uri = doc.uri.fsPath;
        const records = this.byFileCache.get(uri);
        if (records) {
            for (const record of records) {
                this.stats.delete(record.name);
            }
        }
        const upd = this.parse(doc);
        if (upd.length > 0) {
            for (const record of upd) {
                this.stats.set(record.name, record);
            }
            this.byFileCache.set(uri, upd);
        }
    }
    public static async updateAll(): Promise<void> {
        const files = await vscode.workspace.findFiles('**/*.txt');
        this.stats.clear();
        await Promise.all(files.map(async file => {
            const doc = await vscode.workspace.openTextDocument(file);
            const records = this.parse(doc);
            if (records.length > 0) {
                records.forEach(r => this.stats.set(r.name, r));
                this.byFileCache.set(file.fsPath, records);
            }
        }));
    }
    public static deleteFiles(uris: readonly vscode.Uri[]): void {
        for (const uri of uris) {
            const records = this.byFileCache.get(uri.fsPath) || [];
            for (const record of records) {
                this.stats.delete(record.name);
            }
            this.byFileCache.delete(uri.fsPath);
        }
    }

    public static entryRegexp = /new\s+entry\s+"(\w+)"/i;
    public static typeRegexp = /type\s+"(\w+)"/i;
    public static usingRegexp = /using\s+"(\w+)"/i;
    public static dataRegexp = /data\s+"([^"]+)"\s+"([^"]+)"/i;

    private static fail = (s: string) =>
        util.logWarning(`invalid Stats declaration at ${s}`);

    private static parse(doc: vscode.TextDocument): Stats[] {
        const uri = doc.uri;
        const lineCount = doc.lineCount;
        const result: Stats[] = [];
        let current: Partial<Stats> = {};
        for (let i = 0; i < lineCount; i++) {
            const docLine = doc.lineAt(i);
            const line = docLine.text;
            const entry = line.match(this.entryRegexp);
            if (entry) {
                current.end = doc.lineAt((i === 0) ? 0 : i - 1).range.end;
                const stats = this.finalize(current);
                if (stats) { result.push(stats); }
                else if (current.name || current.type) { this.fail(entry[0]); }
                current = {
                    name: entry[1],
                    start: docLine.range.start,
                    uri: uri
                };
                continue;
            }
            const type = line.match(this.typeRegexp);
            if (type) {
                if (!current.name ||
                    current.type ||
                    current.data ||
                    current.using) {
                    this.fail(type[0]);
                    current = {};
                } else {
                    current.type = type[1];
                }
                continue;
            }
            const using = line.match(this.usingRegexp);
            if (using) {
                if (!current.name || !current.type) {
                    this.fail(using[0]);
                    current = {};
                } else {
                    current.using = using[1];
                }
                continue;
            }
            const data = line.match(this.dataRegexp);
            if (data) {
                if (!current.name || !current.type) {
                    this.fail(data[0]);
                    current = {};
                } else {
                    if (!current.data) {
                        current.data = new Map<string, string>();
                    }
                    current.data.set(data[1], data[2]);
                }
                continue;
            }
        }
        const final = this.finalize(current);
        if (final) { result.push(final); }
        return result;
    }

    private static finalize(stats: Partial<Stats>): Stats | null {
        if (
            (stats.name?.length && stats.name.length > 0) &&
            (stats.type?.length && stats.type.length > 0) &&
            (stats.uri && stats.start && stats.end) && (
                (stats.using?.length && stats.using.length > 0) ||
                (stats.data && stats.data.size > 0)
            )
        ) { return stats as Stats; }
        return null;
    }
}

class StatsTreeItem extends vscode.TreeItem {
    constructor(public readonly stats: Stats) {
        super(stats.name, vscode.TreeItemCollapsibleState.None);
        this.description = stats.type;
        this.iconPath = new vscode.ThemeIcon('list-tree');

        let tooltip = ((stats.using) ? stats.using + '\n' : '');
        stats.data.forEach((v, k) => tooltip += `${k}: ${v}\n`);
        this.tooltip = tooltip;
        const cursor = stats.start;
        this.command = {
            command: 'vscode.open',
            title: 'Open Stats',
            arguments: [
                stats.uri,
                {
                    selection: new vscode.Range(cursor, cursor),
                    preserveFocus: false,
                    viewColumn: vscode.ViewColumn.Active,
                }
            ]
        };
    }
}

export class StatsTreeView implements vscode.TreeDataProvider<StatsTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
    constructor(public readonly viewId: string) { }
    init(context: vscode.ExtensionContext): void {
        const dnd = new StatsDragController;
        const treeView = vscode.window.createTreeView(
            this.viewId,
            {
                treeDataProvider: this,
                dragAndDropController: dnd,
            }
        );
        const refreshCmd = vscode.commands.registerCommand(
            'bg3bg.refreshStats',
            this.updateAll.bind(this));
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument(this.updateDoc.bind(this)),
            vscode.workspace.onDidOpenTextDocument(this.updateDoc.bind(this)),
            vscode.workspace.onDidDeleteFiles(e => this.deleteFiles(e.files)),
            refreshCmd,
            treeView,
        );
        this.updateAll();

    }
    private async updateAll(): Promise<void> {
        await StatsStorage.updateAll();
        this.refresh();
    }
    private updateDoc(doc: vscode.TextDocument): void {
        StatsStorage.updateFile(doc);
        this.refresh();
    }
    private deleteFiles(files: readonly vscode.Uri[]) {
        StatsStorage.deleteFiles(files);
        this.refresh();
    }
    getTreeItem(element: StatsTreeItem): vscode.TreeItem {
        return element;
    }
    getChildren(element?: StatsTreeItem): vscode.ProviderResult<StatsTreeItem[]> {
        if (!element) {
            return StatsStorage.getAll().map(e => new StatsTreeItem(e));
        }
        return [];
    }


}

export class StatsDragController
    implements vscode.TreeDragAndDropController<StatsTreeItem> {
    dropMimeTypes: readonly string[] = [];
    dragMimeTypes: readonly string[] = ['text/plain'];
    handleDrag?(
        source: readonly StatsTreeItem[],
        dataTransfer: vscode.DataTransfer,
        _token: vscode.CancellationToken,
    ): Thenable<void> | void {
        const item = source[0];
        if (item && item.label) {
            dataTransfer.set(
                'text/plain',
                new vscode.DataTransferItem(item.stats.name),
            );
        }
    }

}
