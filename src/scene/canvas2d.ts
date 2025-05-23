import { EventEmitter } from 'eventemitter3';

interface OffscreenCanvasEvent {
    resize: [];
}

export class OffscreenCanvas2D extends EventEmitter<OffscreenCanvasEvent> {
    static list: Set<OffscreenCanvas2D> = new Set();

    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;

    width: number;
    height: number;

    /** 是否是高清画布 */
    highResolution: boolean = true;
    /** 是否启用抗锯齿 */
    antiAliasing: boolean = true;

    scale: number = 1;

    /** 更新标识符，如果发生变化则说明画布被动清空 */
    symbol: number = 0;

    private _freezed: boolean = false;
    /** 当前画布是否被冻结 */
    get freezed() {
        return this._freezed;
    }

    private _active: boolean = true;
    get active() {
        return this._active;
    }

    /**
     * 创建一个新的离屏画布
     * @param alpha 是否启用透明度通道
     * @param canvas 指定画布，不指定时会自动创建一个新画布
     */
    constructor(alpha: boolean = true, canvas?: HTMLCanvasElement) {
        super();

        this.canvas = canvas ?? document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { alpha })!;
        this.width = this.canvas.width / devicePixelRatio;
        this.height = this.canvas.height / devicePixelRatio;

        OffscreenCanvas2D.list.add(this);
    }

    /**
     * 设置画布的大小
     */
    size(width: number, height: number) {
        if (this._freezed) {
            console.warn(`Cannot set property of freezed canvas.`);
            return;
        }
        const w = Math.max(width, 1);
        const h = Math.max(height, 1);
        let ratio = this.highResolution ? devicePixelRatio : 1;
        this.scale = ratio;
        this.canvas.width = w * ratio;
        this.canvas.height = h * ratio;
        this.width = w;
        this.height = height;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(ratio, ratio);
        this.ctx.imageSmoothingEnabled = this.antiAliasing;
        if (this.canvas.isConnected) {
            this.canvas.style.width = `${w}px`;
            this.canvas.style.height = `${h}px`;
        }
    }

    /**
     * 设置当前画布是否为高清画布
     */
    setHD(hd: boolean) {
        if (this._freezed) {
            console.warn(`Cannot set property of freezed canvas.`);
            return;
        }
        this.highResolution = hd;
        this.size(this.width, this.height);
    }

    /**
     * 设置当前画布的抗锯齿设置
     */
    setAntiAliasing(anti: boolean) {
        if (this._freezed) {
            console.warn(`Cannot set property of freezed canvas.`);
            return;
        }
        this.antiAliasing = anti;
        this.ctx.imageSmoothingEnabled = anti;
    }

    /**
     * 清空画布
     */
    clear() {
        if (this._freezed) {
            console.warn(`Cannot clear freezed canvas.`);
            return;
        }
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
    }

    /**
     * 删除这个画布
     */
    delete() {
        this.canvas.remove();
        this.ctx.reset();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this._freezed = true;
        OffscreenCanvas2D.list.delete(this);
    }

    /**
     * 冻结这个画布的属性，之后便不能被修改，同时会从画布列表中删去。
     */
    freeze() {
        this._freezed = true;
        OffscreenCanvas2D.list.delete(this);
    }

    /**
     * 使此画布生效，使用前请务必调用此函数
     */
    activate() {
        if (this._active || this._freezed) return;
        OffscreenCanvas2D.list.add(this);
    }

    /**
     * 使此画布失效，当这个画布暂时不会被使用时请务必调用此函数，失效后若没有对此画布的引用，那么会自动垃圾回收
     */
    deactivate() {
        if (!this._active || this._freezed) return;
        OffscreenCanvas2D.list.delete(this);
    }

    /**
     * 复制一个离屏Canvas2D对象，一般用于缓存等操作
     * @param canvas 被复制的MotaOffscreenCanvas2D对象
     * @returns 复制结果，注意复制结果是被冻结的，无法进行大小等的修改，但是可以继续绘制
     */
    static clone(canvas: OffscreenCanvas2D): OffscreenCanvas2D {
        const newCanvas = new OffscreenCanvas2D();
        newCanvas.setHD(canvas.highResolution);
        newCanvas.size(canvas.width, canvas.height);
        newCanvas.ctx.drawImage(
            canvas.canvas,
            0,
            0,
            canvas.width,
            canvas.height
        );
        newCanvas.freeze();
        return newCanvas;
    }

    static refreshAll(force: boolean = false) {
        this.list.forEach(v => {
            if (force) {
                v.size(v.width, v.height);
                v.symbol++;
                v.emit('resize');
            }
        });
    }
}

window.addEventListener('resize', () => {
    requestAnimationFrame(() => {
        OffscreenCanvas2D.refreshAll();
    });
});
