import * as vscode from 'vscode';
import * as util from './util';

export class Commands {
    private static _commands: Command[] = [];
    private static _commandIds: string[] = [];
    public static add(command: Command): Command {
        if (this._commandIds.includes(command.identifier)) {
            const error = `Duplicate command: ${command.identifier}`;
            util.logError(error);
            throw new Error(error);
        }
        this._commands.push(command);
        return command;
    }
    public static create(
        identifier: string,
        action: () => void | Promise<void>,
    ): Command {
        return this.add(new Command(identifier, action));
    }
    public static async init(context: vscode.ExtensionContext): Promise<void> {
        const existing = await vscode.commands.getCommands(true);
        const intersections = this.existingContains(existing);
        if (intersections.length > 0) {
            const err = 'External commands overriding: ' +
                intersections.join(', ');
            util.logError(err);
            throw new Error(err);
        }

        const disposables = this._commands.map(cmd => this.register(cmd));
        context.subscriptions.push(...disposables);
    }
    private static register(command: Command): vscode.Disposable {
        return vscode.commands.registerCommand(
            command.identifier,
            command.action,
        );
    }
    private static existingContains(existingCommands: string[]): string[] {
        const intersections = [];
        for (const commandId of this._commandIds) {
            if (existingCommands.includes(commandId)) {
                intersections.push((commandId));
            }
        }
        return intersections;
    }
}

export class Command {
    constructor(
        public readonly identifier: string,
        public readonly action: () => void | Promise<void>,
    ) { }

    async init(): Promise<vscode.Disposable> {
        return vscode.commands.registerCommand(this.identifier, this.action);
    }
}
