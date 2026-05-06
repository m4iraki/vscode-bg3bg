import * as vscode from 'vscode';
import * as util from './util';
import * as lsx from './lsx';
import * as loca from './loca';
import * as stats from './stats';
import { BG3EntityDropProvider } from './dnd';

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
        const range = document.getWordRangeAtPosition(position, /[-\w]+/);
        if (!range) { return; }

        const lsid = document.getText(range);
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
        const stat = stats.StatsStorage.get(lsid);
        if (!stat) { return; }
        const docLine = document.lineAt(range.start.line).text;
        const isStats = BG3EntityDropProvider.usingRegexp.test(docLine) ||
            BG3EntityDropProvider.statsRegexp.test(docLine);
        const isDataDefinition = /^\s*data\s+/.test(docLine);
        const allowedInData =
            stat.type === 'StatusData' ||
            stat.type === 'PassiveData';
        if (isStats || (isDataDefinition && allowedInData)) {
            return new vscode.Location(
                stat.uri,
                new vscode.Range(stat.start, stat.end));
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
        const range = document.getWordRangeAtPosition(position, /[-\w]+/);
        if (!range) { return; }

        const lsid = document.getText(range);
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

        const stat = stats.StatsStorage.get(lsid);
        if (!stat) { return; }
        const docLine = document.lineAt(range.start.line).text;
        const isStats = BG3EntityDropProvider.usingRegexp.test(docLine) ||
            BG3EntityDropProvider.statsRegexp.test(docLine);
        const isDataDefinition = /^\s*data\s+/.test(docLine);
        const allowedInData =
            stat.type === 'StatusData' ||
            stat.type === 'PassiveData';
        if (isStats || (isDataDefinition && allowedInData)) {
            const content = new vscode.MarkdownString();
            content.appendMarkdown(`**Name:** \`${stat.name}\`  \n`);
            content.appendMarkdown(`**Type:** \`${stat.type}\`  \n`);
            if (stat.using) {
                content.appendMarkdown(`**Using:** \`${stat.using}\`  \n`);
            }
            for (const [k, v] of stat.data.entries()) {
                let value = v;
                if (util.handleRegexp.test(v)) {
                    const tr = loca.LocaStorage.get(v);
                    value = tr?.primary.text || v;
                }
                content.appendMarkdown(`**${k}:** \`${value}\`  \n`);
            }

            content.isTrusted = true;
            return new vscode.Hover(content, range);
        }
        return undefined;
    }

}