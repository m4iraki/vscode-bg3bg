import * as vscode from 'vscode';
import { Command } from './commands';

export class ActionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        cmd: Command,
        public readonly iconPath?: string | vscode.IconPath,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState =
            vscode.TreeItemCollapsibleState.None
    ) {

        super(label, collapsibleState);

        this.command = {
            command: cmd.identifier,
            title: label,
            arguments: [this]
        };
    }
}
export class ActionsTreeProvider
    implements vscode.TreeDataProvider<ActionItem> {
    constructor(public readonly viewId: string) { }
    _children: ActionItem[] = [];
    init() {
        vscode.window.registerTreeDataProvider(this.viewId, this);
    }
    create(
        label: string,
        command: Command,
        icon?: string | vscode.IconPath
    ): ActionItem {
        const ai = new ActionItem(label, command, icon);
        this._children.push(ai);
        return ai;
    }
    createMany(
        entries: [string, Command, (string | vscode.IconPath)?][],
    ): void {
        entries.map(entry => this.create(entry[0], entry[1], entry[2]));
    }
    add(ai: ActionItem): ActionItem {
        this._children.push(ai);
        return ai;
    }
    getTreeItem(element: ActionItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ActionItem): ActionItem[] {
        if (element) {
            return [];
        }

        return this._children;
    }
}