import * as vscode from 'vscode';
import { Commands } from './commands';
import { ActionsTreeProvider } from './action';
import * as identifiers from './identifiers';
import { LsxEntityTreeView } from './lsx';
import { toolkitify, removeToolkitProject } from './toolkitify';
import { LocaTreeView } from './loca';
import { BG3EntityDropProvider } from './dnd';
import { createPackage } from './pack';
import { LSIDDefinitionProvider, LSIDHoverProvider } from './definitions';

export async function activate(context: vscode.ExtensionContext) {
  const helpersTreeProvider = new ActionsTreeProvider('bg3bg.helpers');
  helpersTreeProvider.createMany([
    ['Generate UUID', identifiers.generateUUID],
    ['Generate Handle', identifiers.generateHandle],
    ['Regenerate Selected Id', identifiers.regenerateSelected],
    ['Regenerate All Ids', identifiers.regenerateAll(context)],
    ['Toolkitify', toolkitify, new vscode.ThemeIcon('archive')],
    ['Remove Toolkit Project',
      removeToolkitProject, new vscode.ThemeIcon('unarchive')],
    ['Create PAK', createPackage, new vscode.ThemeIcon('file-zip')]
  ]);

  Commands.init(context);
  helpersTreeProvider.init();

  const entitiesTreeProvider = new LsxEntityTreeView('bg3bg.entExplorer');
  entitiesTreeProvider.init(context);
  const locaTreeProvider = new LocaTreeView('bg3bg.locaExplorer');
  locaTreeProvider.init(context);

  const selector: vscode.DocumentSelector = [
    { language: 'xml' },
    { language: 'plaintext' },
    { language: 'lsx' },
  ];
  const dropProvider = vscode.languages.registerDocumentDropEditProvider(
    selector, new BG3EntityDropProvider());
  const defProvider = vscode.languages.registerDefinitionProvider(
    selector, new LSIDDefinitionProvider());
  const hoverProvider = vscode.languages.registerHoverProvider(
    selector, new LSIDHoverProvider());
  context.subscriptions.push(dropProvider, defProvider, hoverProvider);
}

export function deactivate() { }