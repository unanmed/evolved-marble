import {
    Body,
    Box,
    Circle,
    Contact,
    Polygon,
    Vec2,
    WeldJoint,
    World
} from 'planck-js';
import { Scene, SceneEvent } from '../scene';
import { MotaOffscreenCanvas2D } from '@motajs/client';
import { Sword1v1SceneUI } from './component';
import {
    BallBodyData,
    BattleFixtureData,
    BattleMove,
    BodyType,
    DamageRender,
    ISword1v1DisplayInfo,
    ISword1v1SceneState
} from './types';
import { InputType, SceneGameUI } from '@/common';

const MAX_SPEED = 10.0;
const MAX_ANGULAR_SPEED = 10.0;
const ACCELERATION = 15.0;
const ANGULAR_ACCEL = 5.0;
const LINEAR_DAMPING = 2.0;
const ANGULAR_DAMPING = 5.0;
const IVALID_FRAME = 500;

interface BattleSceneEvent extends SceneEvent {
    over: [win: string];
    attack: [attacker: string, defender: string, damage: number];
    contact: [a: string, b: string];
    teleport: [color: string];
}

export class Sword1v1Scene extends Scene<
    ISword1v1SceneState,
    ISword1v1DisplayInfo,
    BattleSceneEvent
> {
    readonly id: string = 'sword1v1';
    readonly name: string = '剑士 1v1';

    readonly backImage: HTMLImageElement = new Image();
    world: World = new World();

    balls: Body[] = [];
    swords: Body[] = [];
    helmets: Body[] = [];
    actions: BattleMove[] = [];
    readonly damageRender: Set<DamageRender> = new Set();

    private left: boolean = false;
    private up: boolean = false;
    private down: boolean = false;
    private right: boolean = false;
    private rotateCW: boolean = false;
    private rotateACW: boolean = false;
    private end: boolean = false;

    async load() {
        this.backImage.src = `${import.meta.env.BASE_URL}battle.webp`;
        return new Promise<void>(res => {
            this.backImage.addEventListener('load', () => res());
        });
    }

    render(canvas: MotaOffscreenCanvas2D): void {
        const ctx = canvas.ctx;
        ctx.drawImage(this.backImage, 0, 0, canvas.width, canvas.height);
        const scale = canvas.width / 20;

        for (let body = this.world.getBodyList(); body; body = body.getNext()) {
            const pos = body.getPosition();
            const angle = body.getAngle();
            const data = body.getUserData() as BallBodyData;
            if (data && data.isMarble) {
                // 生命值
                ctx.save();
                ctx.translate(pos.x * scale, pos.y * scale);
                ctx.beginPath();
                ctx.rect(-0.5 * scale, -0.9 * scale, 1 * scale, 0.1 * scale);
                ctx.lineWidth = 4;
                ctx.strokeStyle = '#fff';
                ctx.stroke();
                ctx.fillStyle = '#ccc';
                ctx.fill();
                ctx.beginPath();
                ctx.rect(
                    -0.5 * scale,
                    -0.9 * scale,
                    (data.hp / 100) * scale,
                    0.1 * scale
                );
                ctx.fillStyle = '#2eff47';
                ctx.fill();
                ctx.restore();
            }

            for (
                let fixture = body.getFixtureList();
                fixture;
                fixture = fixture.getNext()
            ) {
                ctx.save();
                ctx.translate(pos.x * scale, pos.y * scale);
                ctx.rotate(angle);
                const data = fixture.getUserData() as BattleFixtureData;
                if (!data) {
                    ctx.restore();
                    continue;
                }

                ctx.beginPath();
                switch (data.type) {
                    case BodyType.Marble:
                        ctx.arc(0, 0, 0.5 * scale, 0, Math.PI * 2);
                        ctx.fillStyle = data.color;
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 4;
                        ctx.fill();
                        ctx.stroke();
                        break;
                    case BodyType.Helmet:
                        ctx.arc(
                            0,
                            0,
                            0.5 * scale,
                            -Math.PI / 6,
                            -(Math.PI * 5) / 6,
                            true
                        );
                        ctx.lineWidth = 24;
                        ctx.strokeStyle = 'black';
                        ctx.lineCap = 'square';
                        ctx.stroke();
                        ctx.strokeStyle = 'gray';
                        ctx.lineWidth = 16;
                        ctx.stroke();
                        break;
                    case BodyType.Sword:
                        ctx.moveTo(-0.5 * scale, 0);
                        ctx.lineTo(-0.4 * scale, -0.1 * scale);
                        ctx.lineTo(-0.3 * scale, -0.1 * scale);
                        ctx.lineTo(-0.3 * scale, -0.2 * scale);
                        ctx.lineTo(-0.2 * scale, -0.2 * scale);
                        ctx.lineTo(-0.2 * scale, -0.1 * scale);
                        ctx.lineTo(0.4 * scale, -0.1 * scale);
                        ctx.lineTo(0.5 * scale, 0);
                        ctx.lineTo(0.4 * scale, 0.1 * scale);
                        ctx.lineTo(-0.2 * scale, 0.1 * scale);
                        ctx.lineTo(-0.2 * scale, 0.2 * scale);
                        ctx.lineTo(-0.3 * scale, 0.2 * scale);
                        ctx.lineTo(-0.3 * scale, 0.1 * scale);
                        ctx.lineTo(-0.4 * scale, 0.1 * scale);
                        ctx.lineTo(-0.5 * scale, 0);
                        ctx.lineWidth = 3;
                        ctx.fillStyle = 'white';
                        ctx.strokeStyle = 'black';
                        ctx.fill();
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(0.5 * scale, 0);
                        ctx.lineTo(-0.2 * scale, 0);
                        ctx.lineWidth = 2;
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(-0.2 * scale, -0.2 * scale);
                        ctx.lineTo(-0.2 * scale, 0.2 * scale);
                        ctx.moveTo(-0.3 * scale, -0.2 * scale);
                        ctx.lineTo(-0.3 * scale, 0.2 * scale);
                        ctx.lineWidth = 3;
                        ctx.stroke();
                        break;
                }

                ctx.restore();
            }
        }

        // 伤害弹出
        ctx.save();
        const toDelete = new Set<DamageRender>();
        const now = this.timestamp;
        for (const damage of this.damageRender) {
            const progress = (now - damage.startTime) / 2000;
            if (progress >= 1) {
                toDelete.add(damage);
                continue;
            }
            const x = damage.x * scale;
            const y = damage.y * scale - scale * Math.sqrt(progress);
            ctx.fillStyle = 'lightcoral';
            ctx.strokeStyle = 'black';
            ctx.font = '28px Arial';
            ctx.fillText(Math.floor(damage.value).toString(), x, y);
            ctx.strokeText(Math.floor(damage.value).toString(), x, y);
        }

        toDelete.forEach(v => {
            this.damageRender.delete(v);
        });
        ctx.restore();
    }

    private createHelmetShape(radius: number, angle: number, segments: number) {
        const vertices = [new Vec2(0, 0)]; // 中心点

        for (let i = 0; i <= segments; i++) {
            const theta = -angle / 2 + (i / segments) * angle;
            const x = radius * Math.cos(theta - Math.PI / 2);
            const y = radius * Math.sin(theta - Math.PI / 2);
            vertices.push(new Vec2(x, y));
        }
        vertices.push(new Vec2(0, 0));

        return vertices;
    }

    private createMarble(
        color: string,
        area: [number, number, number, number]
    ) {
        const world = this.world;

        // 球体
        const bodyX = Math.random() * area[1] + area[0];
        const bodyY = Math.random() * area[3] + area[2];
        const body = world.createBody({
            type: 'dynamic',
            position: new Vec2(bodyX, bodyY),
            userData: {
                color,
                hp: 100,
                isMarble: true,
                attackTime: 0
            }
        });
        body.createFixture(new Circle(new Vec2(0, 0), 0.5), {
            density: 1,
            friction: 1,
            restitution: 0.6,
            userData: {
                type: BodyType.Marble,
                color
            }
        });

        // 剑
        const sword = world.createBody({
            type: 'dynamic',
            position: new Vec2(bodyX + 1, bodyY),
            userData: {
                color,
                hp: 0,
                isMarble: false,
                attackTime: 0
            }
        });
        sword.createFixture(new Box(0.5, 0.2), {
            density: 0.5,
            restitution: 0.2,
            userData: {
                type: BodyType.Sword,
                color
            }
        });
        world.createJoint(
            new WeldJoint({
                bodyA: body,
                bodyB: sword,
                localAnchorA: new Vec2(0.5, 0), // 相对球球的位置
                localAnchorB: new Vec2(-0.5, 0) // 剑的根部
            })
        );

        // 头盔
        const helmet = world.createBody({
            type: 'dynamic',
            position: new Vec2(bodyX, bodyY)
        });
        helmet.createFixture(
            new Polygon(this.createHelmetShape(0.7, (Math.PI * 2) / 3, 8)),
            {
                density: 0.2,
                friction: 0.4,
                restitution: 0.5,
                userData: {
                    color,
                    type: BodyType.Helmet
                }
            }
        );
        world.createJoint(
            new WeldJoint({
                bodyA: body,
                bodyB: helmet,
                localAnchorA: new Vec2(0, 0),
                localAnchorB: new Vec2(0, 0)
            })
        );

        body.setLinearDamping(LINEAR_DAMPING);
        body.setAngularDamping(ANGULAR_DAMPING);

        return [body, sword, helmet];
    }

    private _createBoundaries(
        left: number,
        right: number,
        top: number,
        bottom: number,
        thickness: number = 0.5
    ) {
        const world = this.world;

        // 底部
        const b = world.createBody({
            type: 'static',
            position: new Vec2((left + right) / 2, bottom + thickness)
        });
        b.createFixture(new Box((right - left) / 2, thickness), {
            density: 0,
            friction: 0.5
        });

        // 顶部
        const t = world.createBody({
            type: 'static',
            position: new Vec2((left + right) / 2, top - thickness)
        });
        t.createFixture(new Box((right - left) / 2, thickness), {
            density: 0,
            friction: 0.5
        });

        // 左墙
        const leftWall = world.createBody({
            type: 'static',
            position: new Vec2(left - thickness, (top + bottom) / 2)
        });
        leftWall.createFixture(new Box(thickness, (bottom - top) / 2), {
            density: 0,
            friction: 0.5
        });

        // 右墙
        const rightWall = world.createBody({
            type: 'static',
            position: new Vec2(right + thickness, (top + bottom) / 2)
        });
        rightWall.createFixture(new Box(thickness, (bottom - top) / 2), {
            density: 0,
            friction: 0.5
        });
    }

    getBall(color: string) {
        return this.balls.find(v => {
            const data = v.getUserData() as BallBodyData;
            if (!data) return false;
            return data.color === color;
        });
    }

    attack(attacker: Body, defender: Body, defenderData: BattleFixtureData) {
        if (defenderData.type === BodyType.Sword) return;
        const bodyData = this.getBall(
            defenderData.color
        )?.getUserData() as BallBodyData;
        if (!bodyData) return;
        if (this.timestamp - bodyData.attackTime < IVALID_FRAME) return;
        const attackerData = attacker.getUserData() as BallBodyData;
        const isHelmet = defenderData.type === BodyType.Helmet;
        const v1 = attacker.getLinearVelocity();
        const v2 = defender.getLinearVelocity();
        const relVel = v1.clone().sub(v2); // 相对线速度

        const angVel = attacker.getAngularVelocity();

        const damage = Math.min(
            Math.sqrt(relVel.length() * 20 + Math.abs(angVel * 10)) *
                (isHelmet ? 0.25 : 1),
            20
        );

        bodyData.hp -= damage;
        bodyData.attackTime = this.timestamp;
        const pos = defender.getPosition();
        this.damageRender.add({
            x: pos.x,
            y: pos.y,
            startTime: this.timestamp,
            value: damage
        });
        this.emit('attack', attackerData.color, defenderData.color, damage);

        if (bodyData.hp <= 0) {
            bodyData.hp = 0;
            if (!attackerData) return;
            this.emit('over', attackerData.color);
            this.end = true;
        }
    }

    private contact(contact: Contact) {
        if (contact.getManifold().pointCount <= 0) return;
        const fixtureA = contact.getFixtureA();
        const fixtureB = contact.getFixtureB();
        const bodyA = fixtureA.getBody();
        const bodyB = fixtureB.getBody();
        const userDataA = fixtureA.getUserData() as BattleFixtureData;
        const userDataB = fixtureB.getUserData() as BattleFixtureData;
        if (!userDataA || !userDataB) return;
        if (userDataA.color === userDataB.color) return;
        this.emit('contact', userDataA.color, userDataB.color);
        if (userDataA.type === BodyType.Sword) {
            this.attack(bodyA, bodyB, userDataB);
        } else if (userDataB.type === BodyType.Sword) {
            this.attack(bodyB, bodyA, userDataA);
        }
    }

    resetWorld() {
        this.end = false;
        this.balls = [];
        this.actions = [];
        this.swords = [];
        this.helmets = [];
        this.world = new World(new Vec2(0, 0));
        // this.createBoundaries(0, 20, 0, 15);
        const [redBall, redSword, redHelmet] = this.createMarble(
            'red',
            [0.5, 9, 0.5, 14]
        );
        const [blueBall, blueSword, blueHelmet] = this.createMarble(
            'blue',
            [10.5, 9, 0.5, 14]
        );
        this.balls.push(redBall, blueBall);
        this.swords.push(redSword, blueSword);
        this.helmets.push(redHelmet, blueHelmet);
        this.actions.push({ linear: new Vec2(), angular: 0 });
        this.actions.push({ linear: new Vec2(), angular: 0 });
        this.world.on('begin-contact', contact => {
            this.contact(contact);
        });
    }

    onShown(): void {
        this.resetWorld();
    }

    onTick(_timestamp: number, dt: number, _lastTick: number): void {
        if (this.end) return;
        this.balls.forEach((v, i) => {
            const { linear, angular } = this.actions[i];
            if (linear.length() > 0) {
                const accel = linear.clone().mul(ACCELERATION);
                v.applyForceToCenter(accel);
            }

            // 角加速度处理
            if (angular !== 0) {
                v.applyTorque(angular * ANGULAR_ACCEL);
            }

            // 限速处理
            const vel = v.getLinearVelocity();
            if (vel.length() > MAX_SPEED) {
                v.setLinearVelocity(vel.clone().mul(MAX_SPEED / vel.length()));
            }

            const angVel = v.getAngularVelocity();
            if (Math.abs(angVel) > MAX_ANGULAR_SPEED) {
                v.setAngularVelocity(Math.sign(angVel) * MAX_ANGULAR_SPEED);
            }

            const pos = v.getPosition().clone();
            const offset = new Vec2(); // wraparound 修正偏移
            if (pos.x < 0) offset.x = 20;
            if (pos.x > 20) offset.x = -20;
            if (pos.y < 0) offset.y = 15;
            if (pos.y > 15) offset.y = -15;
            if (offset.length() > 0) {
                // 主体瞬移
                const ball = v;
                const sword = this.swords[i];
                const helmet = this.helmets[i];
                const data = ball.getUserData() as BallBodyData;
                if (!data) return;
                const color = data.color;

                ball.setPosition(ball.getPosition().clone().add(offset));
                sword.setPosition(sword.getPosition().clone().add(offset));
                helmet.setPosition(helmet.getPosition().clone().add(offset));

                this.emit('teleport', color);
            }
        });

        this.world.step(dt / 1000);
    }

    actionMove(color: string, vel: Vec2) {
        const index = this.balls.findIndex(v => {
            const data = v.getUserData() as BallBodyData;
            if (!data) return false;
            return data.color === color;
        });
        if (index === -1) return;
        this.actions[index].linear = vel;
    }

    actionRotate(color: string, angular: number) {
        const index = this.balls.findIndex(v => {
            const data = v.getUserData() as BallBodyData;
            if (!data) return false;
            return data.color === color;
        });
        if (index === -1) return;
        this.actions[index].angular = angular;
    }

    onInput(type: InputType, ev: KeyboardEvent): void {
        const { linear } = this.actions[0];
        if (type === InputType.KeyDown) {
            switch (ev.keyCode) {
                case 87: // W
                    linear.set(linear.x, -1);
                    this.up = true;
                    break;
                case 65: // A
                    linear.set(-1, linear.y);
                    this.left = true;
                    break;
                case 83: // S
                    linear.set(linear.x, 1);
                    this.down = true;
                    break;
                case 68: // D
                    linear.set(1, linear.y);
                    this.right = true;
                    break;
                case 37: // 左箭头
                    this.actions[0].angular = -1;
                    this.rotateACW = true;
                    break;
                case 39: // 右箭头
                    this.actions[0].angular = 1;
                    this.rotateCW = true;
                    break;
            }
        } else {
            switch (ev.keyCode) {
                case 87: // W
                    this.up = false;
                    if (this.down) {
                        linear.set(linear.x, 1);
                    } else {
                        linear.set(linear.x, 0);
                    }
                    break;
                case 65: // A
                    this.left = false;
                    if (this.right) {
                        linear.set(1, linear.y);
                    } else {
                        linear.set(0, linear.y);
                    }
                    break;
                case 83: // S
                    this.down = false;
                    if (this.up) {
                        linear.set(linear.x, -1);
                    } else {
                        linear.set(linear.x, 0);
                    }
                    break;
                case 68: // D
                    this.right = false;
                    if (this.left) {
                        linear.set(-1, linear.y);
                    } else {
                        linear.set(0, linear.y);
                    }
                    break;
                case 37: // 左箭头
                    this.rotateACW = false;
                    if (this.rotateCW) {
                        this.actions[0].angular = 1;
                    } else {
                        this.actions[0].angular = 0;
                    }
                    break;
                case 39: // 右箭头
                    this.rotateCW = false;
                    if (this.rotateACW) {
                        this.actions[0].angular = -1;
                    } else {
                        this.actions[0].angular = 0;
                    }
                    break;
            }
        }
    }

    endBattle() {
        this.end = true;
    }

    getGameUI(): SceneGameUI<ISword1v1SceneState, ISword1v1DisplayInfo> {
        return Sword1v1SceneUI;
    }

    getState(): ISword1v1SceneState {
        throw new Error('Method not implemented.');
    }
}
