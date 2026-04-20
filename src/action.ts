import * as vscode from 'vscode';
import { Command } from './commands';

export class ActionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly _command: Command,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState =
            vscode.TreeItemCollapsibleState.None
    ) {

        super(label, collapsibleState);

        this.command = {
            command: _command.identifier,
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
    ): ActionItem {
        const ai = new ActionItem(label, command);
        this._children.push(ai);
        return ai;
    }
    createMany(
        entries: [string, Command][],
    ): void {
        entries.map(entry => this.create(entry[0], entry[1]));
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