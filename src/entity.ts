import * as vscode from 'vscode';
import * as util from './util';
import {LsxEntitiy, LsxParser} from './lsx';

//todo non-lsx entities (loca, stats)
type EntityType = string;

export class EntityCache {
    private cache = new Map<EntityType, LsxEntitiy[]>();

    public async update(document: vscode.TextDocument): Promise<void> {
        if (!EntityCache.fileFilter(document)) { return; }

        this.removeFile(document.uri);

        const entities = LsxParser.getEntities(document);

        for (const entity of entities) {
            const region = entity.tpe;
            if (!this.cache.has(region)) {
                this.cache.set(region, []);
            }
            this.cache.get(region)!.push(entity);
        }
    }

    public getRegions(): string[] {
        return Array.from(this.cache.keys()).sort();
    }

    public getEntitiesByRegion(region: string): LsxEntitiy[] {
        const entities = this.cache.get(region) || [];
        return [...entities].sort((a, b) => a.name.localeCompare(b.name));
    }

    public removeFile(uri: vscode.Uri): void {
        for (const r of this.cache.keys()) {
            const list = this.cache.get(r);
            if (list) {
                const filtered = list.filter(e => e.document.uri !== uri);
                if (filtered.length === 0) {
                    this.cache.delete(r);
                } else {
                    this.cache.set(r, filtered);
                }
            }
        }
    }

    static extensions: string[] = [
        '.lsx',
        '.loca.xml',
        '.txt',
    ];
    static fileFilter(document: vscode.TextDocument): boolean {
        for (const ext of this.extensions) {
            if (
                document.fileName.endsWith(ext) &&
                !document.fileName.endsWith('.lsf' + ext)
            ) {
                return true;
            }
        }
        return false;
    }
}

type LsxTreeEntity = RegionItem | EntityItem;
type LsxTreeEvent = LsxTreeEntity | undefined | void;
export class LsxTreeView implements vscode.TreeDataProvider<LsxTreeEntity> {

    private _onDidChangeTreeData = new vscode.EventEmitter<LsxTreeEvent>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private store: EntityCache) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: LsxTreeEntity): vscode.TreeItem {
        return element;
    }

    getChildren(
        element?: LsxTreeEntity,
    ): Thenable<(LsxTreeEntity)[]> {
        if (!element) {
            return Promise.resolve(
                this.store.getRegions()
                    .map(r => new RegionItem(r))
            );
        }

        if (element instanceof RegionItem) {
            return Promise.resolve(
                this.store.getEntitiesByRegion(element.label)
                    .map(e => new EntityItem(e))
            );
        }

        return Promise.resolve([]);
    }
}

class RegionItem extends vscode.TreeItem {
    constructor(public readonly label: string) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon('folder');
        this.contextValue = 'region';
    }
}

class EntityItem extends vscode.TreeItem {
    constructor(public readonly entity: LsxEntitiy) {
        super(entity.name, vscode.TreeItemCollapsibleState.None);
        this.description = entity.id;
        this.iconPath = new vscode.ThemeIcon('symbol-property');

        const cursor = entity.range.start;
        this.command = {
            command: 'vscode.open',
            title: 'Open Entity',
            arguments: [
                entity.document.uri,
                {
                    selection: new vscode.Range(cursor, cursor),
                    preserveFocus: false,
                    viewColumn: vscode.ViewColumn.Active
                }
            ]
        };
    }
}

export async function initEntities(context: vscode.ExtensionContext) {
    const cache = new EntityCache();
    const treeProvider = new LsxTreeView(cache);

    vscode.window.registerTreeDataProvider('bg3bg.explorer', treeProvider);

    const updateAll = async (doc: vscode.TextDocument) => {
        await cache.update(doc);
        treeProvider.refresh();
    };

    const files = await util.findFiles();

    await Promise.all(
        files.map(async (fileUri) => {
            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                await cache.update(doc);
            } catch (e) {
                console.log(e);
                util.logWarning(`Failed to initial parse: ${fileUri.fsPath}`);
            }
        }));

    treeProvider.refresh();
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(updateAll),
        vscode.workspace.onDidOpenTextDocument(updateAll),
    );
}