import * as vscode from 'vscode';
import * as util from './util';
import { LsxEntitiy, LsxParser } from './lsx';

//todo non-lsx entities (loca, stats)
type EntityType = string;

export class EntityCache {
    private static cache = new Map<EntityType, LsxEntitiy[]>();

    public static async update(document: vscode.TextDocument): Promise<void> {
        if (!(await EntityCache.fileFilter(document))) { return; }

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

    public static getRegions(): string[] {
        return Array.from(this.cache.keys()).sort();
    }

    public static getEntitiesByRegions(regions: string[]): LsxEntitiy[] {
        const result: LsxEntitiy[] = [];
        for (const r of regions) {
            const entities = this.cache.get(r) || [];
            result.push(...entities);
        }
        return result;
    }
    public static getEntitiesByRegion(region: string): LsxEntitiy[] {
        const entities = this.cache.get(region) || [];
        return [...entities].sort((a, b) => a.name.localeCompare(b.name));
    }
    public static getAllEntities(): LsxEntitiy[] {
        return Array.from(this.cache.values()).flatMap(entities => entities);
    }
    public static removeFile(uri: vscode.Uri): void {
        const uriStr = uri.toString();
        for (const r of this.cache.keys()) {
            const list = this.cache.get(r);
            if (list) {
                const filtered = list.filter(
                    e => e.document.uri.toString() !== uriStr);
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
    static async fileFilter(document: vscode.TextDocument): Promise<boolean> {
        for (const ext of this.extensions) {
            if (
                document.fileName.endsWith(ext) //&&
                // !document.fileName.endsWith('.lsf' + ext)
            ) {
                return true;
            }
        }
        return false;
    }

    public static meta(): ModMeta | null {
        const m = this.cache.get('Config')?.[0];
        if (!m) {
            return null;
        }
        return {
            author: m.attributes.get('Author') || '',
            name: m.attributes.get('Name') || '',
            id: m.attributes.get('UUID') || '',
            folder: m.attributes.get('Folder') || '',
        } as ModMeta;
    }
}

export interface ModMeta {
    author: string,
    name: string,
    id: string,
    folder: string,
}

type LsxTreeEntity = RegionItem | EntityItem;
type LsxTreeEvent = LsxTreeEntity | undefined | void;
export class LsxTreeView
    implements vscode.TreeDataProvider<LsxTreeEntity> {

    private _onDidChangeTreeData = new vscode.EventEmitter<LsxTreeEvent>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(public readonly viewId: string) { }

    init(context: vscode.ExtensionContext): void {
        vscode.window.registerTreeDataProvider(this.viewId, this);
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument(this.updateDoc.bind(this)),
            vscode.workspace.onDidOpenTextDocument(this.updateDoc.bind(this)),
            vscode.workspace.onDidDeleteFiles(e => {
                e.files.forEach(uri => EntityCache.removeFile(uri));
                this.refresh();
            })
        );
        this.updateAll();
    }

    async updateDoc(doc: vscode.TextDocument) {
        await EntityCache.update(doc);
        this.refresh();
    }

    async updateAll() {
        const files = await util.findFiles();
        for (const file of files) {
            try {
                const doc = await vscode.workspace.openTextDocument(file);
                await EntityCache.update(doc);
            } catch (e) {
                util.logWarning(
                    `Failed to initial parse: ${file.fsPath}` +
                    ` because of ${e}`);
            }
        }
        this.refresh();
    }

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
                EntityCache.getRegions()
                    .map(r => new RegionItem(r))
            );
        }

        if (element instanceof RegionItem) {
            return Promise.resolve(
                EntityCache.getEntitiesByRegion(element.label)
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
