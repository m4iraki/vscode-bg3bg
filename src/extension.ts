import * as vscode from 'vscode';
import { Commands } from './commands';
import { ActionsTreeProvider } from './action';
import * as identifiers from './identifiers';
import { LsxTreeView } from './entity';
import { toolkitify } from './toolkitify';

export async function activate(context: vscode.ExtensionContext) {
  const helpersTreeProvider = new ActionsTreeProvider('bg3bg.main');
  helpersTreeProvider.createMany([
    ['Generate UUID', identifiers.generateUUID],
    ['Generate Handle', identifiers.generateHandle],
    ['Regenerate Selected Id', identifiers.regenerateSelected],
    ['Regenerate All Ids', identifiers.regenerateAll(context)],
    ['Toolkitify', toolkitify],
  ]);

  Commands.init(context);
  helpersTreeProvider.init();

  const entitiesTreeProvider = new LsxTreeView('bg3bg.explorer');
  entitiesTreeProvider.init(context);
}

export function deactivate() { }