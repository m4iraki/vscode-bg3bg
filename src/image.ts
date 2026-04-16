import * as vscode from 'vscode';
import * as fs from 'fs';

export interface ImageDesc {
    format: 'PNG' | 'DDS';
    width: number;
    height: number;
}
const MAGIC = {
    DDS: 0x44445320,
    PNG: 0x89504E47,
};

export async function imageDesc(
    uri: vscode.Uri,
): Promise<ImageDesc | null> {
    let fd: number | undefined;
    try {
        fd = fs.openSync(uri.fsPath, 'r');
        const buffer = Buffer.alloc(32);
        const read = fs.readSync(fd, buffer, 0, 32, 0);
        if (read >= 24) {
            const header = buffer.readUInt32BE(0);
            switch (header) {
                case MAGIC.DDS:
                    return {
                        format: 'DDS',
                        width: buffer.readUInt32LE(16),
                        height: buffer.readUint32LE(12),
                    } as ImageDesc;
                case MAGIC.PNG:
                    return {
                        format: 'PNG',
                        width: buffer.readUInt32BE(16),
                        height: buffer.readUint32BE(20),
                    } as ImageDesc;
                default:
                    return null;
            }

        }
    } finally {
        if (fd !== undefined) {
            fs.closeSync(fd);
        }
    }
    return null;
}