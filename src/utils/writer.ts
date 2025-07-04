import { IRecorderDestination } from './record';

export class RecordWriter implements IRecorderDestination {
    handle?: FileSystemFileHandle;
    writable?: FileSystemWritableFileStream;

    async start() {
        this.handle = await window.showSaveFilePicker({
            suggestedName: 'record.raw',
            types: [
                {
                    description: 'MPEG4 Video Raw Chunk',
                    accept: { 'video/mp4': ['.raw'] }
                }
            ]
        });
        this.writable = await this.handle.createWritable();
    }

    async receive(chunk: ArrayBuffer) {
        this.writable?.write(chunk);
    }

    async finish() {
        this.writable?.close();
    }
}
