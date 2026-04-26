import * as vscode from 'vscode';
import * as util from './util';
import { BG3EntityDragController } from './dnd';

export const extension = 'xml';
export const dotExtension = '.' + extension;
export const localization = 'Localization';
export const ALL_LANGUAGES = [
    'BrazilianPortuguese',
    'Chinese',
    'ChineseTraditional',
    'English',
    'French',
    'German',
    'Italian',
    'Japanese',
    'Korean',
    'LatinSpanish',
    'Polish',
    'Russian',
    'Spanish',
    'Turkish',
    'Ukrainian',
] as const;
export type Language = (typeof ALL_LANGUAGES)[number];
export function isLanguage(value: string): value is Language {
    return ALL_LANGUAGES.includes(value as Language);
}
export interface LocaEntry {
    language: Language;
    text: string;
    uri: vscode.Uri;
    range: vscode.Range;
}

export interface LocaEntity {
    id: string;
    localizations: Record<Language, LocaEntry>;
}

const locaRegexp = /<content\s+contentuid="(h[\da-g]+)"\s+(version="\d+")?\s*>([^<]*)</gi;

function isLoca(
    file: vscode.Uri,
): boolean {
    const extOk = util.fext(file) === dotExtension;
    const parent = util.fparentName(util.fparent(file));
    const parentOk = parent === localization;
    return extOk && parentOk;
}

export class LocaStorage {
    private static entities = new Map<string, LocaEntity>();
    public static getEntities(): LocaEntity[] {
        return [...this.entities.values()]
            .sort((a, b) => a.id.localeCompare(b.id));
    }

    public static async updateEntitiesInFile(
        file: vscode.Uri,
    ): Promise<void> {
        if (!isLoca(file)) { return; }
        const lang = util.fparentName(file);
        if (!isLanguage(lang)) { return; }
        const doc = await vscode.workspace.openTextDocument(file);
        const matches = doc.getText().matchAll(locaRegexp);
        for (const match of matches) {
            const [m, handle, _2, text] = match;
            const start = doc.positionAt(match.index);
            const end = doc.positionAt(match.index + m.length);
            const range = new vscode.Range(start, end);
            const entry = {
                language: lang,
                text: text,
                uri: doc.uri,
                range: range,
            } as LocaEntry;
            const existing = this.entities.get(handle);
            if (!existing) {
                const entity = {
                    id: handle,
                    localizations: {
                        [lang]: entry,
                    },
                } as LocaEntity;
                this.entities.set(handle, entity);
            } else {
                existing.localizations[lang] = entry;
            }
        }
    }

    public static removeEntitiesByFile(
        file: vscode.Uri,
    ) {
        if (!isLoca(file)) { return; }
        const lang = util.fparentName(file);
        if (!isLanguage(lang)) { return; }
        for (const [id, entity] of this.entities) {
            const elang = entity.localizations[lang];
            if (!elang || elang.uri.fsPath !== file.fsPath) { continue; }

            if (Object.keys(entity.localizations).length === 1) {
                this.entities.delete(id);
            } else {
                delete entity.localizations[lang];
            }

        }
    }

    public static async updateAll(): Promise<void> {
        const files = await vscode.workspace.findFiles(
            `**/${localization}/*/*.xml`);
        for (const file of files) {
            await this.updateEntitiesInFile(file);
        }
    }
    public static registerCommands(context: vscode.ExtensionContext) {
        ALL_LANGUAGES.forEach(lang => {
            const commandId = `bg3bg.open${lang}`;
            const disposable = vscode.commands.registerCommand(
                commandId,
                async (item: LocaTreeItem) => {
                    const entry = item.entity.localizations[lang];
                    if (entry) {
                        const doc = await vscode.workspace.openTextDocument(
                            entry.uri);
                        await vscode.window.showTextDocument(doc, {
                            selection: entry.range,
                            preserveFocus: false,
                            viewColumn: vscode.ViewColumn.Active
                        });
                    }
                });

            context.subscriptions.push(disposable);
        });
    }
}

class LocaTreeItem extends vscode.TreeItem {
    public identifier: string;
    public static primaryEntry(entity: LocaEntity): LocaEntry {
        const locas = entity.localizations;
        const available = Object.keys(locas);
        if (locas['English']) { return locas['English']; }
        if (locas['Russian']) { return locas['Russian']; }
        const sorted = available.sort((a, b) => a.localeCompare(b));
        return locas[sorted[0] as Language];
    }
    public static allEntries(entity: LocaEntity): LocaEntry[] {
        return Object.values(entity.localizations);
    }
    constructor(public readonly entity: LocaEntity) {
        const primary = LocaTreeItem.primaryEntry(entity);
        super(primary.text);
        this.identifier = entity.id;
        const entries = LocaTreeItem.allEntries(entity);
        if (entries.length > 1) {
            this.contextValue = entries.map(e => e.language).join('_');
        }
        const tooltip = entries.map(e => e.text).join('\n');
        this.description = entity.id;
        this.tooltip = tooltip;
        this.iconPath = new vscode.ThemeIcon('code');

        const cursor = primary.range.start;
        this.command = {
            command: 'vscode.open',
            title: 'Open Localization',
            arguments: [
                primary.uri,
                {
                    selection: new vscode.Range(cursor, cursor),
                    preserveFocus: false,
                    viewColumn: vscode.ViewColumn.Active
                }
            ]
        };
    }
}

type LocaTreeEvent = LocaTreeItem | undefined | void;
export class LocaTreeView
    implements vscode.TreeDataProvider<LocaTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<LocaTreeEvent>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(public readonly viewId: string) { }
    init(context: vscode.ExtensionContext): void {
        const dnd = new BG3EntityDragController<LocaTreeItem>(
            item => item.identifier);
        const treeView = vscode.window.createTreeView(
            this.viewId,
            {
                treeDataProvider: this,
                dragAndDropController: dnd,
            }
        );
        const refreshCmd = vscode.commands.registerCommand(
            'bg3bg.refreshLoca',
            this.updateAll.bind(this));
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument(this.updateDoc.bind(this)),
            vscode.workspace.onDidOpenTextDocument(this.updateDoc.bind(this)),
            vscode.workspace.onDidDeleteFiles(e => {
                e.files.forEach(this.deleteDoc.bind(this));
                this.refresh();
            }),
            refreshCmd,
            treeView,
        );
        LocaStorage.registerCommands(context);
        this.updateAll();
    }
    async updateDoc(doc: vscode.TextDocument) {
        await LocaStorage.updateEntitiesInFile(doc.uri);
        this.refresh();
    }
    async deleteDoc(uri: vscode.Uri) {
        LocaStorage.removeEntitiesByFile(uri);
    }
    async updateAll() {
        await LocaStorage.updateAll();
        this.refresh();
    }
    getChildren(
        element?: LocaTreeItem,
    ): vscode.ProviderResult<LocaTreeItem[]> {
        if (!element) {
            return Promise.resolve(
                LocaStorage.getEntities()
                    .map(e => new LocaTreeItem(e))
            );
        }
        return Promise.resolve([]);
    }
    getTreeItem(
        element: LocaTreeItem,
    ): vscode.TreeItem {
        return element;
    }
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}
