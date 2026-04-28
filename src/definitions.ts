import * as vscode from 'vscode';
import * as util from './util';
import * as lsx from './lsx';
import * as loca from './loca';

export class LSIDDefinitionProvider
    implements vscode.DefinitionProvider {
    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
    ): vscode.ProviderResult<
        | vscode.Definition
        | vscode.DefinitionLink[]
        | undefined> {
        const range = document.getWordRangeAtPosition(position, /"([-\w]*)"/);
        if (!range) { return; }

        const text = document.getText(range);
        const lsid = text.substring(1, text.length - 1).trim();
        //todo unify entities before stats parsing
        if (util.uuidV4Regexp.test(lsid)) {
            const entity = lsx.LsxEntityStorage.get(lsid);
            if (!entity) { return; }
            return new vscode.Location(entity.document, entity.range);
        }
        if (util.handleRegexp.test(lsid)) {
            const entity = loca.LocaStorage.get(lsid);
            if (!entity) { return; }
            const entries = loca.LocaStorage.allEntries(entity.entity);
            return entries.map(
                entry => new vscode.Location(entry.uri, entry.range));
        }
        return undefined;
    }

}

export class LSIDHoverProvider
    implements vscode.HoverProvider {
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover | undefined> {
        const range = document.getWordRangeAtPosition(position, /"([-\w]*)"/);
        if (!range) { return; }

        const text = document.getText(range);
        const lsid = text.substring(1, text.length - 1).trim();
        if (util.uuidV4Regexp.test(lsid)) {
            const entity = lsx.LsxEntityStorage.get(lsid);
            if (!entity) { return; }
            const content = new vscode.MarkdownString();
            content.appendMarkdown(`**UUID:** \`${entity.id}\`  \n`);
            content.appendMarkdown(`**Name:** \`${entity.name}\`  \n`);
            content.appendMarkdown(`**Type:** \`${entity.tpe}\`  \n`);

            content.isTrusted = true;
            return new vscode.Hover(content, range);
        }
        if (util.handleRegexp.test(lsid)) {
            const entity = loca.LocaStorage.get(lsid);
            if (!entity) { return; }
            const entries = loca.LocaStorage.allEntries(entity.entity);
            const content = new vscode.MarkdownString();
            entries.forEach(entry => content.appendMarkdown(
                `**${entry.language}:** ${entry.text}  \n`));

            content.isTrusted = true;
            return new vscode.Hover(content, range);
        }
        return undefined;
    }

}