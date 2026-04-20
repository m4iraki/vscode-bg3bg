import * as vscode from 'vscode';
import * as util from './util';
import * as lsx from './lsx';
import * as paths from 'path';

//todo non-lsx entities (loca, stats)
type EntityType = string;
type Entity = lsx.LsxEntity;

export class EntityCache {
    private static cache = new Map<EntityType, Entity[]>();

    public static async updateDoc(
        document: vscode.TextDocument,
    ): Promise<void> {
        const ext = paths.extname(document.uri.fsPath);
        switch (ext) {
            case lsx.dotExtension:
                this.updateLsx(document);
                break;
            default:
                break;
        }
    }

    public static async updateLsx(
        document: vscode.TextDocument,
    ): Promise<void> {
        if (!(await EntityCache.fileFilter(document))) { return; }

        this.removeFile(document.uri);

        const entities = lsx.LsxParser.getEntities(document);

        for (const entity of entities) {
            const region = entity.tpe;
            if (!this.cache.has(region)) {
                this.cache.set(region, []);
            }
            this.cache.get(region)!.push(entity);
        }
    }

    public static getEntityTypes(): string[] {
        return Array.from(this.cache.keys()).sort();
    }

    public static getEntitiesByTypes(types: string[]): Entity[] {
        const result: Entity[] = [];
        for (const r of types) {
            const entities = this.cache.get(r) || [];
            result.push(...entities);
        }
        return result;
    }
    public static getEntitiesByType(tpe: string): Entity[] {
        const entities = this.cache.get(tpe) || [];
        return [...entities].sort((a, b) => a.name.localeCompare(b.name));
    }
    public static getAllEntities(): Entity[] {
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
        lsx.dotExtension,
        '.xml',
        '.txt',
    ];
    static async fileFilter(document: vscode.TextDocument): Promise<boolean> {
        for (const ext of this.extensions) {
            if (
                document.fileName.endsWith(ext)
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

type TreeEntity = TypeItem | EntityItem;
type EntityTreeEvent = TreeEntity | undefined | void;
export class EntityTreeView
    implements vscode.TreeDataProvider<TreeEntity> {

    private _onDidChangeTreeData = new vscode.EventEmitter<EntityTreeEvent>();
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

    async updateDoc(doc: vscode.TextDocument): Promise<void> {
        await EntityCache.updateDoc(doc);
        this.refresh();
    }

    async updateAll() {
        const lsxFiles = await util.findFiles(lsx.extension);
        for (const file of lsxFiles) {
            try {
                const doc = await vscode.workspace.openTextDocument(file);
                await EntityCache.updateDoc(doc);
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

    getTreeItem(element: TreeEntity): vscode.TreeItem {
        return element;
    }

    getChildren(
        element?: TreeEntity,
    ): Thenable<(TreeEntity)[]> {
        if (!element) {
            return Promise.resolve(
                EntityCache.getEntityTypes()
                    .map(r => new TypeItem(r))
            );
        }

        if (element instanceof TypeItem) {
            return Promise.resolve(
                EntityCache.getEntitiesByType(element.label)
                    .map(e => new EntityItem(e))
            );
        }

        return Promise.resolve([]);
    }
}

class TypeItem extends vscode.TreeItem {
    constructor(public readonly label: string) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon('folder');
        this.contextValue = 'entitytype';
    }
}

class EntityItem extends vscode.TreeItem {
    constructor(public readonly entity: lsx.LsxEntity) {
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
