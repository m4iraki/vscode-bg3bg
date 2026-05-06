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
import { cmdHotloadOn, cmdHotloadOff } from './hotload';
import {StatsTreeView} from './stats';

export async function activate(context: vscode.ExtensionContext) {
  const helpersTreeProvider = new ActionsTreeProvider('bg3bg.helpers');
  helpersTreeProvider.createMany([
    ['Generate UUID',
      identifiers.generateUUID,
      undefined,
      'Generate new UUID and add it to Clipboard.'],
    ['Generate Handle',
      identifiers.generateHandle,
      undefined,
      'Generate new Handle and add it to Clipboard.'],
    ['Regenerate Selected Id',
      identifiers.regenerateSelected,
      undefined,
      'Replace all occurences of selected identifier ' +
      'across project and add new value to Clipboard.'],
    ['Regenerate All Ids',
      identifiers.regenerateAll(context),
      undefined,
      'Replace all identifiers of defined entities with new ones.'],
    ['Toolkitify',
      toolkitify,
      new vscode.ThemeIcon('archive'),
      'Make a copy of project that can be used as BG3 Toolkit Project. ' +
      'Must have Divine.exe path specified in config.'
    ],
    ['Remove Toolkit Project',
      removeToolkitProject,
      new vscode.ThemeIcon('unarchive'),
      'Remove project files from Data. Must have Data path specified in config.'
    ],
    ['Create PAK',
      createPackage,
      new vscode.ThemeIcon('file-zip'),
      'Package your project to .zip. ' +
      'Must have Divine.exe path specified in config.'
    ],
    ['Hotload Enable',
      cmdHotloadOn,
      new vscode.ThemeIcon('eye'),
      'Enable Hotloading of assets. Must have Data path specified in config.'
    ],
    ['Hotload Disable',
      cmdHotloadOff,
      new vscode.ThemeIcon('eye-closed'),
      'Disable Hotloading of assets. Must have Data path specified in config.'
    ],
  ]);

  Commands.init(context);
  helpersTreeProvider.init();

  const entitiesTreeProvider = new LsxEntityTreeView('bg3bg.entExplorer');
  entitiesTreeProvider.init(context);
  const statsTreeProvider = new StatsTreeView('bg3bg.stats');
  statsTreeProvider.init(context);
  const locaTreeProvider = new LocaTreeView('bg3bg.locaExplorer');
  locaTreeProvider.init(context);

  const selector: vscode.DocumentSelector = [
    { language: 'xml' },
    { language: 'bg3stats' },
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