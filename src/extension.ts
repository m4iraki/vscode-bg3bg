import * as vscode from 'vscode';
import { Commands } from './commands';
import { MyTreeProvider } from './action';
import { initIdentifiers } from './identifiers';
import { initEntities } from './entity';

export async function activate(context: vscode.ExtensionContext) {
  const MainTreeProvider = new MyTreeProvider('bg3bg.main');
  initIdentifiers(MainTreeProvider);

  Commands.init(context);

  MainTreeProvider.init();

  initEntities(context);

}

export function deactivate() { }