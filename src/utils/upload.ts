import { IRecorderDestination } from './record';

export class RecordUploader implements IRecorderDestination {
    private online: boolean = false;

    readonly socket: WebSocket;

    constructor() {
        this.socket = new WebSocket('ws://localhost:8076');
        this.socket.addEventListener('open', () => {
            // eslint-disable-next-line no-console
            console.log(`Record socket connect successfully.`);
        });
        this.socket.addEventListener('close', () => {
            this.finish();
        });
    }

    receive(frame: Blob) {
        if (this.socket.readyState !== this.socket.OPEN) return;
        this.socket.send(frame);
    }

    async finish() {
        if (this.socket.readyState !== this.socket.OPEN) return;
        this.socket.send('finish');
    }
}
