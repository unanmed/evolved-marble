import {
    BodyContact,
    IMap,
    ITickExcitation,
    IWorldBody,
    IWorldBodyInstance,
    WorldBodyData
} from '@/common';
import { MotaOffscreenCanvas2D } from '@motajs/client';
import EventEmitter from 'eventemitter3';
import { isNil } from 'lodash-es';
import { Vec2, World, Body, Contact } from 'planck-js';

export interface MapBaseEvent {
    addBody: [data: WorldBodyData<any>, id: number];
    removeBody: [data: WorldBodyData<any>, id: number];
}

export abstract class MapBase
    extends EventEmitter<MapBaseEvent>
    implements IMap
{
    protected world!: World;

    private counter: number = 0;

    /** id -> 物体实例 */
    protected readonly bodyMap: Map<number, WorldBodyData<any>> = new Map();
    /** 物体实例 -> id */
    protected readonly idMap: Map<IWorldBodyInstance, number> = new Map();
    /** planck-js 物体实例 -> id */
    protected readonly bodyIdMap: Map<Body, number> = new Map();

    constructor(public readonly excitation: ITickExcitation) {
        super();
        this.reset();
    }

    reset() {
        // 复制一份保证遍历不会出问题
        for (const id of [...this.bodyMap.keys()]) {
            this.removeBody(id);
        }
        this.bodyIdMap.clear();
        this.bodyIdMap.clear();
        this.world = new World(new Vec2(0, 0));
        this.world.on('begin-contact', contact => this.contactBody(contact));
        this.onReset(this.world);
    }

    private contactBody(contact: Contact) {
        const fixtureA = contact.getFixtureA();
        const fixtureB = contact.getFixtureB();
        const bodyInsA = fixtureA.getBody();
        const bodyInsB = fixtureB.getBody();
        const idA = this.bodyIdMap.get(bodyInsA);
        const idB = this.bodyIdMap.get(bodyInsB);
        if (!idA || !idB) return;
        const bodyA = this.bodyMap.get(idA);
        const bodyB = this.bodyMap.get(idB);
        if (!bodyA || !bodyB) return;

        const contactA: BodyContact<any> = {
            selfFixture: fixtureA,
            oppoFixture: fixtureB,
            selfBodyIns: bodyInsA,
            oppoBodyIns: bodyInsB,
            selfBody: bodyA,
            oppoBody: bodyB,
            isA: true,
            contact: contact
        };
        const contactB: BodyContact<any> = {
            selfFixture: fixtureB,
            oppoFixture: fixtureA,
            selfBodyIns: bodyInsB,
            oppoBodyIns: bodyInsA,
            selfBody: bodyB,
            oppoBody: bodyA,
            isA: false,
            contact: contact
        };
        bodyA.body.contact(contactA, this.excitation.now());
        bodyB.body.contact(contactB, this.excitation.now());
    }

    /**
     * 重置地图时执行，用于初始化地图
     * @param world 世界信息
     */
    abstract onReset(world: World): void;

    getWorld(): World {
        return this.world;
    }

    addBody<T>(body: IWorldBody<T>, data: T): number {
        const ins = body.create(this.world, data, this);
        const id = this.counter++;
        const bodyData: WorldBodyData<T> = { ins, body };
        this.bodyMap.set(id, bodyData);
        this.idMap.set(bodyData.ins, id);
        ins.bodyList.forEach(v => {
            this.bodyIdMap.set(v, id);
        });
        this.emit('addBody', bodyData, id);
        return id;
    }

    removeBody(id: number): boolean {
        const data = this.bodyMap.get(id);
        if (!data) return false;
        this.bodyMap.delete(id);
        this.idMap.delete(data.ins);
        data.ins.bodyList.forEach(v => {
            this.bodyIdMap.delete(v);
            this.world.destroyBody(v);
        });
        const success = data.body.destroy(data.ins);
        return success;
    }

    updatedBody(ins: IWorldBodyInstance): void {
        const num = this.idMap.get(ins);
        if (isNil(num)) return;
        ins.bodyList.forEach(v => {
            if (!this.bodyIdMap.has(v)) {
                this.bodyIdMap.set(v, num);
            }
        });
    }

    /**
     * 在默认渲染前渲染内容
     * @param canvas 渲染至的画布
     */
    abstract preDraw(canvas: MotaOffscreenCanvas2D): void;

    /**
     * 在默认渲染后渲染内容
     * @param canvas 渲染至的画布
     */
    abstract postDraw(canvas: MotaOffscreenCanvas2D): void;

    render(canvas: MotaOffscreenCanvas2D): void {
        this.preDraw(canvas);
        this.bodyMap.forEach(v => {
            v.body.render(canvas, v.ins);
        });
        this.postDraw(canvas);
    }

    step(
        time: number,
        velocityIterations?: number,
        positionIterations?: number
    ): void {
        this.world.step(time, velocityIterations, positionIterations);
    }
}
