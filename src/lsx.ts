import * as vscode from 'vscode';
import * as sax from 'sax';
import * as util from './util';

const extension = 'lsx';
const dotExtension = '.' + extension;
function isLsx(uri: vscode.Uri): boolean {
    return util.fext(uri.fsPath) === dotExtension;
}

type LsxEntityType = string;
export interface LsxEntity {
    name: string;
    tpe: LsxEntityType;
    nodeTpe: string;
    id: string;
    range: vscode.Range;
    document: vscode.Uri;
    attributes: Map<string, string>;
}
interface LsxParserContext {
    currentDepth: number;
    regionDepth: number;
    parser: sax.SAXParser;
    doc: vscode.TextDocument;
    region?: LsxEntityType;
    entity?: Partial<LsxEntity>;
    startPos?: vscode.Position;
}
class LsxParser {
    public static getEntities(document: vscode.TextDocument): LsxEntity[] {
        if (!isLsx(document.uri)) { return []; }
        const results: LsxEntity[] = [];
        const parser: sax.SAXParser = sax.parser(true);
        const ctx = {
            currentDepth: 0,
            regionDepth: -1,
            parser: parser,
            doc: document,
        } as LsxParserContext;
        parser.onopentag = (tag: sax.Tag | sax.QualifiedTag) => {
            ctx.currentDepth++;
            this.handleOpenTag(tag, ctx);
        };
        parser.onclosetag = (tagName: string) => {
            const entity = this.handleCloseTag(tagName, ctx);
            if (entity) { results.push(entity); }
            ctx.currentDepth--;
        };
        parser.write(document.getText()).close();
        return results;
    }

    private static entityDepth = 3;
    private static entityAttrsDepth = 4;
    private static handleOpenTag(
        tag: sax.Tag | sax.QualifiedTag,
        ctx: LsxParserContext,
    ): void {
        const name = tag.name.toLowerCase();
        const depthDiff = ctx.currentDepth - ctx.regionDepth;

        if (name === 'region') {
            ctx.region = this.attr(tag, 'id');
            ctx.regionDepth = ctx.currentDepth;
        } else if (
            name === 'node' &&
            depthDiff === this.entityDepth
        ) {
            ctx.entity = {
                tpe: ctx.region,
                nodeTpe: this.attr(tag, 'id') || '',
                attributes: new Map<string, string>(),
            };
            ctx.startPos = ctx.doc.positionAt(ctx.parser.startTagPosition - 1);
        } else if (
            name === 'attribute' &&
            depthDiff === this.entityAttrsDepth &&
            ctx.entity
        ) {
            this.fillEntityData(tag, ctx.entity);
        }
    }

    private static handleCloseTag(
        name: string,
        ctx: LsxParserContext,
    ): LsxEntity | null {
        const tagName = name.toLowerCase();
        if (tagName === 'region') {
            ctx.region = undefined;
            ctx.regionDepth = -1;
        } else if (
            tagName === 'node' &&
            ctx.currentDepth - ctx.regionDepth === this.entityDepth
        ) {
            return this.finalizeEntity(ctx);
        }
        return null;
    }

    private static finalizeEntity(ctx: LsxParserContext): LsxEntity | null {
        if (ctx.entity?.id &&
            ctx.entity?.name &&
            ctx.startPos
        ) {
            const end = ctx.doc.positionAt(ctx.parser.position);
            const entity = {
                ...ctx.entity,
                range: new vscode.Range(ctx.startPos, end),
                document: ctx.doc.uri,
            } as LsxEntity;
            ctx.entity = undefined;
            return entity;
        }
        return null;
    }

    private static fillEntityData(
        tag: sax.Tag | sax.QualifiedTag,
        entity: Partial<LsxEntity>,
    ): void {
        const id = this.attr(tag, 'id');
        const value = this.attr(tag, 'value');
        if (
            id === 'ID' ||
            id === 'MapKey' ||
            id === 'UUID'
        ) { entity.id = value; }
        if (id === 'Name') { entity.name = value; }
        if (id && value) {
            entity.attributes?.set(id, value);
        }
    }

    private static attr(
        tag: sax.Tag | sax.QualifiedTag,
        attribute: string,
    ): string | undefined {
        const a = tag.attributes?.[attribute];
        if (!a) {
            return;
        }
        //check for sax.QualifiedTag. string is not a object
        if ('ns' in tag) {
            return (a as sax.QualifiedAttribute).value;
        }

        return a as string;
    }

}

export class LsxEntityStorage {
    private static storage = new Map<LsxEntityType, LsxEntity[]>();

    public static async updateFile(
        document: vscode.TextDocument,
    ): Promise<void> {
        if (!isLsx(document.uri)) { return; }
        this.removeFile(document.uri);
        const entities = LsxParser.getEntities(document);
        for (const entity of entities) {
            const region = entity.tpe;
            if (!this.storage.has(region)) {
                this.storage.set(region, []);
            }
            this.storage.get(region)!.push(entity);
        }
    }

    public static getEntityTypes(): string[] {
        return Array.from(this.storage.keys()).sort();
    }

    public static getEntitiesByTypes(types: string[]): LsxEntity[] {
        const result: LsxEntity[] = [];
        for (const r of types) {
            const entities = this.storage.get(r) || [];
            result.push(...entities);
        }
        return result;
    }
    public static getEntitiesByType(tpe: string): LsxEntity[] {
        const entities = this.storage.get(tpe) || [];
        return [...entities].sort((a, b) => a.name.localeCompare(b.name));
    }
    public static getAllEntities(): LsxEntity[] {
        return Array.from(this.storage.values()).flatMap(entities => entities);
    }
    public static removeFile(uri: vscode.Uri): void {
        if (!isLsx(uri)) { return; }
        const uriStr = uri.fsPath;
        for (const r of this.storage.keys()) {
            const list = this.storage.get(r);
            if (list) {
                const filtered = list.filter(
                    e => e.document.fsPath !== uriStr);
                if (filtered.length === 0) {
                    this.storage.delete(r);
                } else {
                    this.storage.set(r, filtered);
                }
            }
        }
    }

    public static meta(): ModMeta | null {
        const m = this.storage.get('Config')?.[0];
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


type LsxTreeEntity = LsxTypeItem | LsxEntityItem;
type LsxTreeEvent = LsxTreeEntity | undefined | void;
export class LsxEntityTreeView
    implements vscode.TreeDataProvider<LsxTreeEntity> {

    private _onDidChangeTreeData = new vscode.EventEmitter<LsxTreeEvent>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(public readonly viewId: string) { }

    init(context: vscode.ExtensionContext): void {
        vscode.window.registerTreeDataProvider(this.viewId, this);
        const refreshCmd = vscode.commands.registerCommand(
            'bg3bg.refreshEntities',
            this.updateAll.bind(this));
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument(this.updateDoc.bind(this)),
            vscode.workspace.onDidOpenTextDocument(this.updateDoc.bind(this)),
            vscode.workspace.onDidDeleteFiles(e => {
                e.files.forEach(uri => LsxEntityStorage.removeFile(uri));
                this.refresh();
            }),
            refreshCmd,
        );
        this.updateAll();
    }

    async updateDoc(doc: vscode.TextDocument): Promise<void> {
        await LsxEntityStorage.updateFile(doc);
        this.refresh();
    }

    async updateAll() {
        const lsxFiles = await util.findFiles(extension);
        for (const file of lsxFiles) {
            try {
                const doc = await vscode.workspace.openTextDocument(file);
                await LsxEntityStorage.updateFile(doc);
            } catch (e) {
                util.logWarning(
                    `Failed to parse: ${file.fsPath} because of ${e}`);
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
                LsxEntityStorage.getEntityTypes()
                    .map(r => new LsxTypeItem(r))
            );
        }

        if (element instanceof LsxTypeItem) {
            return Promise.resolve(
                LsxEntityStorage.getEntitiesByType(element.label)
                    .map(e => new LsxEntityItem(e))
            );
        }

        return Promise.resolve([]);
    }
}

class LsxTypeItem extends vscode.TreeItem {
    constructor(public readonly label: string) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon('folder');
        // this.contextValue = 'entitytype';
    }
}

class LsxEntityItem extends vscode.TreeItem {
    constructor(public readonly entity: LsxEntity) {
        super(entity.name, vscode.TreeItemCollapsibleState.None);
        this.description = entity.id;
        this.iconPath = new vscode.ThemeIcon('code');

        const cursor = entity.range.start;
        this.command = {
            command: 'vscode.open',
            title: 'Open Entity',
            arguments: [
                entity.document,
                {
                    selection: new vscode.Range(cursor, cursor),
                    preserveFocus: false,
                    viewColumn: vscode.ViewColumn.Active
                }
            ]
        };
    }
}
