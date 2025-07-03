import { IHTTPResponseBase } from '@/common';
import { IRecorderDestination } from './record';

export class RecordUploader implements IRecorderDestination {
    private online: boolean = false;

    constructor() {
        this.ping();
    }

    private async ping() {
        try {
            await fetch('/ping');
            this.online = true;
        } catch {
            this.online = false;
            // eslint-disable-next-line no-console
            console.warn(`Server offline! Please start python server first!`);
        }
    }

    async receive(frame: Blob): Promise<boolean> {
        if (!this.online) return false;
        try {
            const response = await fetch('/upload-frame', {
                method: 'POST',
                headers: { 'Content-Type': 'image/jpeg' },
                body: frame
            });
            const res = (await response.json()) as IHTTPResponseBase;
            const success = res.code === 0;
            return success;
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            return false;
        }
    }

    async finish() {
        try {
            await fetch('/end-frame', {
                method: 'POST',
                headers: { 'Content-Type': 'image/jpeg' },
                body: JSON.stringify({ finish: true })
            });
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
        }
    }
}
