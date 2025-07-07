import { BodyContact, IMap, IWorldBody, IWorldBodyInstance } from '@/common';
import { MotaOffscreenCanvas2D } from '@motajs/client';
import EventEmitter from 'eventemitter3';
import { World } from 'planck-js';

export interface BodyBaseEvent<T> {
    contact: [body: BodyContact<T>];
}

/**
 * 一个世界中的物体，可以存储一些必要信息，例如兵种的血量。每个物体可能会被用于不同的世界，
 * 此时会调用多次 `create` 方法，生成不同的物体实例，但是数据是互通的。
 */
export abstract class BodyBase<T>
    extends EventEmitter<BodyBaseEvent<T>>
    implements IWorldBody<T>
{
    protected readonly bodyIns: Set<IWorldBodyInstance> = new Set();

    /**
     * 创建物体实例
     * @param world 创建至的世界
     * @param data 传入的数据信息
     * @param map 创建至的地图
     */
    abstract createBody(world: World, data: T, map: IMap): IWorldBodyInstance;

    create(world: World, data: T, map: IMap): IWorldBodyInstance {
        const ins = this.createBody(world, data, map);
        this.bodyIns.add(ins);
        return ins;
    }

    /**
     * 摧毁物体实例，当物体从世界上移除之后执行
     * @param ins 要摧毁的物体实例
     * @param world 物体所在的世界
     * @param map 物体所在的地图
     */
    abstract destroyBody(ins: IWorldBodyInstance): boolean;

    destroy(ins: IWorldBodyInstance) {
        if (!this.bodyIns.has(ins)) return false;
        const success = this.destroyBody(ins);
        this.bodyIns.delete(ins);
        return success;
    }

    abstract render(
        canvas: MotaOffscreenCanvas2D,
        body: IWorldBodyInstance
    ): void;

    /**
     * 更新物体实例
     * @param ins 要更新的物体实例
     */
    abstract onUpdate(ins: IWorldBodyInstance): void;

    updateBody(ins: IWorldBodyInstance) {
        this.onUpdate(ins);
        ins.map.updatedBody(ins);
    }

    /**
     * 更新这个物体所拥有的所有物体实例
     */
    updateAllBodies() {
        this.bodyIns.forEach(v => this.updateBody(v));
    }

    /**
     * 当前物体与另一个物体开始接触时执行
     * @param body IWorldBody 对象
     * @param ins 物体实例
     */
    abstract onContact(body: BodyContact<T>, timestamp: number): void;

    contact(body: BodyContact<T>, timestamp: number) {
        this.onContact(body, timestamp);
        this.emit('contact', body);
    }
}
