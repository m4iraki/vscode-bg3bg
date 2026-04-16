import * as util from './util';
import * as vscode from 'vscode';
import { Command, Commands } from './commands';
import { EntityCache, ModMeta } from './entity';
import { LsxEntitiy } from './lsx';
import * as paths from 'path';
import { promisify } from 'util';
import * as cp from 'child_process';
import { imageDesc } from './image';
import { ActionsTreeProvider } from './action';

const fs = vscode.workspace.fs;
const join = vscode.Uri.joinPath;
const exec = promisify(cp.execFile);

const consts = {
    toolkitified: 'toolkitified',
    tmp: 'tmp_toolkitify',
    projects: 'Projects',
    localization: 'Localization',
    mods: 'Mods',
    game: 'Game',
    templates: 'RootTemplates',
    content: 'Content',
    pub: 'Public',
    gui: 'GUI',
    meta: 'meta.lsx',
    metadata: 'metadata',
};

interface ToolkitifyCtx {
    root: vscode.Uri;
    meta: ModMeta;
    toolkitified: vscode.Uri;
    tmp: vscode.Uri;
};
export async function toolkitifyStructured(

): Promise<void> {
    const root = util.rootFolder();
    const meta = EntityCache.meta();

    if (!root || !meta) {
        util.logWarning('Cannot toolkitify project.' +
            ' Make sure meta.lsx is at /Mods/folder/meta.lsx');
        return;
    }

    const ctx = {
        root: root,
        meta: meta,
        toolkitified: join(root, '..', meta.name + '_tk', consts.toolkitified),
        tmp: join(root, '..', meta.name + '_tk', consts.tmp),
    } as ToolkitifyCtx;

    await util.rmrfDirectory(ctx.tmp);
    await fs.createDirectory(ctx.tmp);

    await processProject(ctx.toolkitified, ctx.tmp, ctx);

    await util.rmrfDirectory(ctx.toolkitified);
    await fs.createDirectory(ctx.toolkitified);

    await copyAsIs(ctx);
    await copyConditional(ctx);
    await processProject(ctx.tmp, ctx.toolkitified, ctx);

    const lslibFT = await prepareForLslib(ctx);
    await execLsLib(lslibFT);

    await util.rmrfDirectory(ctx.tmp);
}


const projectPath = (meta: ModMeta) => [
    consts.projects,
    meta.folder,
    consts.meta,
];
// preserve toolkit project uuid on multiple calls
async function processProject(
    fromRoot: vscode.Uri,
    toRoot: vscode.Uri,
    ctx: ToolkitifyCtx,
): Promise<void> {
    const from = join(fromRoot, ...projectPath(ctx.meta));
    const to = join(toRoot, ...projectPath(ctx.meta));
    if (await util.fileExists(from)) {
        await fs.copy(from, to);
        return;
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<save>
    <version major="4" minor="8" revision="0" build="500"/>
    <region id="MetaData">
        <node id="root">
            <attribute id="GameProject" type="LSString" value=""/>
            <attribute id="Module" type="LSString" value="${ctx.meta.id}"/>
            <attribute id="Name" type="LSString" value="${ctx.meta.name}"/>
            <attribute id="UUID" type="LSString" value="${util.newUUID()}"/>
            <attribute id="UpdatedDependencies" type="bool" value="false"/>
            <children>
                <node id="Categories"/>
            </children>
        </node>
    </region>
</save>`;
    await fs.writeFile(to, Buffer.from(xml));
}

const excludes = (ctx: ToolkitifyCtx) => {
    const pub = vscode.Uri.parse(consts.pub);
    return [
        vscode.Uri.parse(consts.tmp).fsPath,
        vscode.Uri.parse(consts.toolkitified).fsPath,
        vscode.Uri.parse(consts.localization).fsPath,
        join(pub, ctx.meta.folder, consts.content).fsPath,
        join(pub, ctx.meta.folder, consts.templates).fsPath,
        join(pub, consts.game).fsPath,
    ];
};
async function copyAsIs(
    ctx: ToolkitifyCtx,
): Promise<void> {
    const excl = excludes(ctx);
    async function inner(
        subpath: vscode.Uri,
    ) {
        const entries = await fs.readDirectory(join(ctx.root, subpath.fsPath));
        for (const entry of entries) {
            if (entry[1] == vscode.FileType.Directory) {
                const nSubpath = join(subpath, entry[0]);
                if (excl.includes(nSubpath.fsPath)) {
                    continue;
                }
                fs.createDirectory(join(ctx.toolkitified, nSubpath.fsPath));
                await inner(join(subpath, entry[0]));
            } else {
                const rel = join(subpath, entry[0]);
                const from = join(ctx.root, rel.fsPath);
                const to = join(ctx.toolkitified, rel.fsPath);
                await fs.copy(from, to, { overwrite: true });
            }
        }
    };
    await inner(vscode.Uri.parse(''));
}

interface LsLibFromTo {
    from: vscode.Uri;
    to: vscode.Uri;
    batch: boolean,
}
async function prepareForLslib(
    ctx: ToolkitifyCtx,
): Promise<LsLibFromTo[]> {
    const resourcesFT = await splitResources(ctx);
    const metadataFT = await prepareIconMetadata(ctx);
    return [...resourcesFT, metadataFT];
}
function wrap(enitity: LsxEntitiy): string {
    const data = enitity.document.getText(enitity.range);
    return `<?xml version="1.0" encoding="utf-8"?>
<save>
	<version major="4" minor="0" revision="6" build="5" lslib_meta="v1,bswap_guids" />
	<region id="${enitity.tpe}">
		<node id="${enitity.tpe}">
			<children>
				${data}
			</children>
		</node>
	</region>
</save>`;
}
async function splitResources(
    ctx: ToolkitifyCtx,
): Promise<LsLibFromTo[]> {
    const entities = EntityCache.getAllEntities();

    const templatesSubPath = [consts.pub, ctx.meta.folder, consts.templates];
    const contentSubPath = [consts.pub, ctx.meta.folder, consts.content];
    const rootTemplates = join(ctx.root, ...templatesSubPath).fsPath;
    const content = join(ctx.root, ...contentSubPath).fsPath;

    const filtered = entities.filter(e => {
        const path = e.document.uri.fsPath;
        return path.startsWith(rootTemplates) ||
            path.startsWith(content);
    });
    await Promise.all(filtered.map(e => {
        const content = wrap(e);
        const rel = paths.relative(ctx.root.fsPath, e.document.uri.fsPath);
        const relPath = paths.parse(rel).dir;
        const target = paths.resolve(ctx.tmp.fsPath, relPath, `${e.id}.lsx`);
        const targetPath = vscode.Uri.file(target);
        fs.writeFile(targetPath, Buffer.from(content));
    }));

    const templatesFT = {
        from: join(ctx.tmp, ...templatesSubPath),
        to: join(ctx.toolkitified, ...templatesSubPath),
        batch: true,
    } as LsLibFromTo;
    const contentFT = {
        from: join(ctx.tmp, ...contentSubPath),
        to: join(ctx.toolkitified, ...contentSubPath),
        batch: true,
    } as LsLibFromTo;

    return [templatesFT, contentFT];
}
//lslib overrides existing files
async function prepareIconMetadata(
    ctx: ToolkitifyCtx,
): Promise<LsLibFromTo> {
    const nonTKPath =
        '**/' +
        `${consts.pub}/` +
        `${consts.game}/` +
        `${consts.gui}/` +
        `**/*.{png,PNG,dds,DDS}`;
    const tkPath =
        '**/' +
        `${consts.mods}/` +
        `${ctx.meta.folder}/` +
        `${consts.gui}/` +
        `**/*.{png,PNG,dds,DDS}`;
    // const pattern = new vscode.RelativePattern(
    //     ctx.root,
    //     `{${tkPath},${nonTKPath}}`);
    const icons1 = await vscode.workspace.findFiles(
        nonTKPath,
        '{**/toolkitified/**,**/tmp_toolkitify/**}',
    );
    const icons2 = await vscode.workspace.findFiles(
        tkPath,
        '{**/toolkitified/**,**/tmp_toolkitify/**}',
    );
    const icons = [...icons1, ...icons2];
    console.log(icons2.join(','));
    const entries: string =
        (await Promise.all(icons.map(wrapIcon)))
            .filter(icon => icon !== null)
            .join('\n');
    const metadata = `<?xml version="1.0" encoding="utf-8"?>
<save>
	<version major="4" minor="8" revision="0" build="500" lslib_meta="v1,bswap_guids,lsf_keys_adjacency" />
	<region id="config">
		<node id="config">
			<children>
				<node id="entries">
					<children>
${entries}
                    </children>
				</node>
			</children>
		</node>
	</region>
</save>`;
    const tmpMetadata = join(ctx.tmp, `${consts.metadata}.lsx`);
    fs.writeFile(tmpMetadata, Buffer.from(metadata));
    return {
        from: tmpMetadata,
        to: join(ctx.toolkitified, consts.mods, ctx.meta.folder, consts.gui, `${consts.metadata}.lsf`),
        batch: false
    } as LsLibFromTo;
}
async function wrapIcon(
    icon: vscode.Uri,
): Promise<string | null> {
    const desc = await imageDesc(icon);
    if (desc == null) { return null; }

    const path = icon.path;
    const pivot = `/${consts.gui}/`;
    const pivotIndex = path.lastIndexOf(pivot);
    if (pivotIndex === -1) { return null; }
    const relativePart = path.substring(pivotIndex + pivot.length);
    const parsed = paths.posix.parse(relativePart);
    const relPath = paths.posix.join(parsed.dir, `${parsed.name}.png`);

    const wrapped = `<node id="Object">
	<attribute id="MapKey" type="FixedString" value="${relPath}" />
	<children>
		<node id="entries">
			<attribute id="h" type="int16" value="${desc.height}" />
			<attribute id="mipcount" type="int8" value="1" />
			<attribute id="w" type="int16" value="${desc.width}" />
		</node>
	</children>
</node>`;
    //just for humans. lsf eliminates formatting
    return wrapped
        .split('\n')
        .map(line => '						' + line)
        .join('\n');
}

async function copyConditional(
    ctx: ToolkitifyCtx,
): Promise<void> {
    await mergeToTmp(
        [
            join(ctx.root, consts.pub, consts.game, consts.gui),
            join(ctx.root, consts.mods, ctx.meta.folder, consts.gui),
        ],
        join(ctx.toolkitified, consts.mods, ctx.meta.folder, consts.gui),
    );

    await mergeToTmp(
        [
            join(ctx.root, consts.localization),
            join(ctx.root, consts.mods, ctx.meta.folder, consts.localization),
        ],
        join(ctx.toolkitified, consts.mods, ctx.meta.folder, consts.localization),
    );
}
async function mergeToTmp(
    from: vscode.Uri[],
    to: vscode.Uri,
) {
    for (const f of from) {
        try {
            if (await util.dirExists(f)) {
                await fs.copy(f, to, { overwrite: true });
            }
        } catch (e) {
            if (!(e instanceof vscode.FileSystemError && e.code === 'FileNotFound')) {
                util.logError(`Failed to copy ${f.fsPath}: ${e}`);
            }
        }
    }
}

async function execLsLib(
    targets: LsLibFromTo[],
): Promise<void> {
    const config = vscode.workspace.getConfiguration('bg3bg');
    const exePath = config.get<string>('divineexe');
    if (!exePath) {
        const setup = 'Open Settings';
        const selection = await util.logError(
            'Divine.exe path not specified!',
            setup
        );
        if (selection === setup) {
            vscode.commands.executeCommand('workbench.action.openSettings', 'bg3bg.divineexe');
        }
        return;
    }
    try {

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Converting...",
            cancellable: false
        }, async () => {
            for (const target of targets) {
                const args1 = [
                    '-g', 'bg3',
                    '-a', (target.batch) ? 'convert-resources' : 'convert-resource',
                    '--source', target.from.fsPath,
                    '--destination', target.to.fsPath,
                    '-i', 'lsx',
                    '-o', 'lsf'
                ];
                console.log(`${exePath} ${args1.join(', ')}`);
                await exec(exePath, args1);
            }
        });
    } catch (e: unknown) {
        if (typeof (e) === 'object' && e && 'message' in e) {
            vscode.window.showErrorMessage(`${e.message}`);

        } else {
            vscode.window.showErrorMessage('error');
        }
    }
}

export function initToolkitify(treeProvider: ActionsTreeProvider) {
    const toolkitify: Command = Commands.create(
        'bg3bg.toolkitify',
        toolkitifyStructured);

    treeProvider.create('Toolkitify', toolkitify);
}