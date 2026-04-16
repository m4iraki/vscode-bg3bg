import * as vscode from 'vscode';
import { Commands } from './commands';
import { ActionsTreeProvider } from './action';
import { initIdentifiers } from './identifiers';
import { initEntities } from './entity';
import { initToolkitify } from './toolkitify';

export async function activate(context: vscode.ExtensionContext) {
  const helpersTreeProvider = new ActionsTreeProvider('bg3bg.main');
  initIdentifiers(helpersTreeProvider);

  initToolkitify(helpersTreeProvider);
  Commands.init(context);

  helpersTreeProvider.init();

  initEntities(context);
}

export function deactivate() { }