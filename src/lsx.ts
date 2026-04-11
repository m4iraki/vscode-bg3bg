import * as vscode from 'vscode';
import * as sax from 'sax';

export type LsxEntityType = string;

export interface LsxEntitiy {
    name: string;
    tpe: LsxEntityType;
    id: string;
    range: vscode.Range;
    document: vscode.TextDocument;
}

interface LsxParserContext {
    currentDepth: number;
    regionDepth: number;
    parser: sax.SAXParser;
    doc: vscode.TextDocument;
    region?: LsxEntityType;
    entity?: Partial<LsxEntitiy>;
    startPos?: vscode.Position;
}

export class LsxParser {
    //node: {attribute[] children: node[]}
    //save
    // version
    // region
    //  node - always 1 node with no attributes
    //   children
    //    node
    public static getEntities(document: vscode.TextDocument): LsxEntitiy[] {
        if (!document.fileName.endsWith('.lsx')) { return []; }
        const results: LsxEntitiy[] = [];
        const parser: sax.SAXParser = sax.parser(true);
        const ctx = {
            currentDepth: 0,
            regionDepth: -1,
            parser: parser,
            doc: document,
        } as LsxParserContext;
        parser.onopentag = (tag: sax.Tag | sax.QualifiedTag) => {
            ctx.currentDepth++;
            this.handleOpenTag(tag, ctx);
        };
        parser.onclosetag = (tagName: string) => {
            const entity = this.handleCloseTag(tagName, ctx);
            if (entity) { results.push(entity); }
            ctx.currentDepth--;
        };
        parser.write(document.getText()).close();
        return results;
    }

    private static entityDepth = 3;
    private static entityAttrsDepth = 4;
    private static handleOpenTag(
        tag: sax.Tag | sax.QualifiedTag,
        ctx: LsxParserContext,
    ): void {
        const name = tag.name.toLowerCase();
        const depthDiff = ctx.currentDepth - ctx.regionDepth;

        if (name === 'region') {
            ctx.region = this.attr(tag, 'id');
            ctx.regionDepth = ctx.currentDepth;
        } else if (
            name === 'node' &&
            depthDiff === this.entityDepth
        ) {
            ctx.entity = { tpe: ctx.region };
            ctx.startPos = ctx.doc.positionAt(ctx.parser.startTagPosition - 1);
        } else if (
            name === 'attribute' &&
            depthDiff === this.entityAttrsDepth &&
            ctx.entity
        ) {
            this.fillEntityData(tag, ctx.entity);
        }
    }

    private static handleCloseTag(
        name: string,
        ctx: LsxParserContext,
    ): LsxEntitiy | null {
        const tagName = name.toLowerCase();
        if (tagName === 'region') {
            ctx.region = undefined;
            ctx.regionDepth = -1;
        } else if (
            tagName === 'node' &&
            ctx.currentDepth - ctx.regionDepth === this.entityDepth
        ) {
            return this.finalizeEntity(ctx);
        }
        return null;
    }

    private static finalizeEntity(ctx: LsxParserContext): LsxEntitiy | null {
        if (ctx.entity?.id &&
            ctx.entity?.name &&
            ctx.startPos
        ) {
            const end = ctx.doc.positionAt(ctx.parser.position);
            const entity = {
                ...ctx.entity,
                range: new vscode.Range(ctx.startPos, end),
                document: ctx.doc
            } as LsxEntitiy;
            ctx.entity = undefined;
            return entity;
        }
        return null;
    }

    private static fillEntityData(
        tag: sax.Tag | sax.QualifiedTag,
        entity: Partial<LsxEntitiy>,
    ): void {
        const id = this.attr(tag, 'id');
        const value = this.attr(tag, 'value');
        if (id === 'ID' || id === 'MapKey') { entity.id = value; }
        if (id === 'Name') { entity.name = value; }
    }

    private static attr(
        tag: sax.Tag | sax.QualifiedTag,
        attribute: string,
    ): string | undefined {
        const a = tag.attributes?.[attribute];
        if (!a) {
            return;
        }
        //check for sax.QualifiedTag. string is not a object
        if ('ns' in tag) {
            return (a as sax.QualifiedAttribute).value;
        }

        return a as string;
    }
}
