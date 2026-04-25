import * as vscode from 'vscode';
import { Commands } from './commands';
import { ActionsTreeProvider } from './action';
import * as identifiers from './identifiers';
import { LsxEntityTreeView } from './lsx';
import { toolkitify } from './toolkitify';
import { LocaTreeView } from './loca';
import { BG3EntityDropProvider } from './dnd';

export async function activate(context: vscode.ExtensionContext) {
  const helpersTreeProvider = new ActionsTreeProvider('bg3bg.helpers');
  helpersTreeProvider.createMany([
    ['Generate UUID', identifiers.generateUUID],
    ['Generate Handle', identifiers.generateHandle],
    ['Regenerate Selected Id', identifiers.regenerateSelected],
    ['Regenerate All Ids', identifiers.regenerateAll(context)],
    ['Toolkitify', toolkitify, new vscode.ThemeIcon('archive')],
  ]);

  Commands.init(context);
  helpersTreeProvider.init();

  const entitiesTreeProvider = new LsxEntityTreeView('bg3bg.entExplorer');
  entitiesTreeProvider.init(context);
  const locaTreeProvider = new LocaTreeView('bg3bg.locaExplorer');
  locaTreeProvider.init(context);

  const selector: vscode.DocumentSelector = { scheme: 'file' };
  const dropProvider = vscode.languages.registerDocumentDropEditProvider(
    selector, new BG3EntityDropProvider());
  context.subscriptions.push(dropProvider);
}

export function deactivate() { }