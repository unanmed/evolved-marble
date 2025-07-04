import { Vec2 } from 'planck-js';
import { Sword1v1Scene } from '@/scene/sword1v1/scene';
import { TrainProcess, ITrainDataBase, ITrainParallelResets } from '../manager';
import {
    BallBodyData,
    ISword1v1DisplayInfo,
    ISword1v1SceneState
} from '@/scene/sword1v1/types';
import { IScene } from '@/common';

interface ISword1v1TrainData extends ITrainDataBase {
    actions: Record<
        string,
        {
            linear: [number, number];
            angular: number;
        }
    >;
}

interface DamageInfo {
    /** 受到的伤害 */
    recv: number[];
    /** 造成的伤害 */
    damage: number[];
    /** 上一次接触时刻 */
    lastContact: number;
}

interface WinInfo {
    /** 当前是否有一方胜利 */
    won: boolean;
    /** 胜利者是谁 */
    color: string;
}

interface BattleBallInfo {
    reason: string;
}

interface BattleSendData {
    observation: Record<string, number[]>;
    reward: Record<string, number>;
    termination: Record<string, boolean>;
    truncation: Record<string, boolean>;
    info: Record<string, BattleBallInfo>;
}

interface ISword1v1SaveData {
    episode: number;
    colors: string[];
    wins: number[];
}

export class Sword1v1Train extends TrainProcess<
    ISword1v1SceneState,
    ISword1v1SaveData,
    ISword1v1DisplayInfo,
    ISword1v1TrainData,
    ITrainParallelResets<number[], BattleBallInfo>
> {
    readonly id: string = 'sword1v1';
    readonly interval: number = 100;

    private scene!: Sword1v1Scene;

    private damageInfo: DamageInfo[] = [];
    private colors: string[] = [];
    private teleport: number[] = [];
    private totalTeleport: number[] = [];
    private winInfo: WinInfo = { won: false, color: 'red' };
    private wins: Record<string, number> = {};

    private lastReset: number = 0;
    private timeout: number = 120000;

    private readonly display: ISword1v1DisplayInfo = {
        episode: 0,
        remainTime: 0,
        red: {
            color: 'red',
            win: 0,
            hp: 0,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            angle: 0,
            angularVel: 0,
            actionHor: 0,
            actionVer: 0,
            actionRotate: 0
        },
        blue: {
            color: 'blue',
            win: 0,
            hp: 0,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            angle: 0,
            angularVel: 0,
            actionHor: 0,
            actionVer: 0,
            actionRotate: 0
        }
    };

    initialize(): void {
        this.scene = this.manager.scene.get('sword1v1') as Sword1v1Scene;
        this.scene.on(
            'attack',
            (attacker: string, defender: string, damage: number) => {
                const attIdx = this.colors.indexOf(attacker);
                const defIdx = this.colors.indexOf(defender);
                if (attIdx === -1 || defIdx === -1) return;
                const now = this.timestamp;
                this.damageInfo[attIdx].damage.push(damage);
                this.damageInfo[attIdx].lastContact = now;
                this.damageInfo[defIdx].recv.push(damage);
                this.damageInfo[defIdx].lastContact = now;
            }
        );
        this.scene.on('over', (win: string) => {
            this.winInfo.won = true;
            this.winInfo.color = win;
            this.wins[win] ??= 0;
            this.wins[win]++;
            if (win === 'red') {
                this.display.red.win = this.wins[win];
            } else if (win === 'blue') {
                this.display.blue.win = this.wins[win];
            }
        });
        this.scene.on('contact', (a: string, b: string) => {
            const now = this.timestamp;
            const aIdx = this.colors.indexOf(a);
            const bIdx = this.colors.indexOf(b);
            this.damageInfo[aIdx].lastContact = now;
            this.damageInfo[bIdx].lastContact = now;
        });
        this.scene.on('teleport', (color: string) => {
            const idx = this.colors.indexOf(color);
            this.teleport[idx]++;
            this.totalTeleport[idx]++;
        });

        this.reset();
    }

    onReset(): ITrainParallelResets<number[], BattleBallInfo> {
        const now = this.timestamp;
        this.lastReset = now;
        this.scene.resetWorld();
        this.colors = [];
        this.damageInfo = [];
        this.teleport = [];
        this.totalTeleport = [];
        this.winInfo = { won: false, color: 'red' };
        this.scene.balls.forEach(v => {
            const data = v.getUserData() as BallBodyData;
            if (!data) return;
            this.colors.push(data.color);
            this.damageInfo.push({
                recv: [],
                damage: [],
                lastContact: now
            });
            this.teleport.push(0);
            this.totalTeleport.push(0);
        });

        const obs: Record<string, number[]> = {};
        const info: Record<string, BattleBallInfo> = {};
        this.colors.forEach(v => {
            const ball = this.scene.getBall(v);
            if (!ball) return;
            const data = ball.getUserData() as BallBodyData;
            if (!data) return;
            const pos = ball.getPosition();
            const vel = ball.getLinearVelocity();
            const angle = ball.getAngle() % (Math.PI * 2);
            const angularVel = ball.getAngularVelocity();

            // 要归一化
            obs[v] = [
                data.hp / 100,
                pos.x / 20,
                pos.y / 15,
                vel.x / 10,
                vel.y / 10,
                angle / Math.PI / 2,
                angularVel / 10,
                0
            ];
            info[v] = { reason: 'reset' };
        });

        const observation = {
            red: [...obs.red, ...obs.blue],
            blue: [...obs.blue, ...obs.red]
        };

        return {
            observation,
            info
        };
    }

    actionTick(data: ISword1v1TrainData) {
        if (data.type !== 'action') return;
        this.colors.forEach(v => {
            const [x, y] = data.actions[v].linear;
            this.scene.actionMove(v, new Vec2(x, y));
            this.scene.actionRotate(v, data.actions[v].angular);
        });
        const [ballA, ballB] = this.scene.balls;
        const posA = ballA.getPosition();
        const posB = ballB.getPosition();
        const lastLength = posA.clone().sub(posB.clone()).length();
        const nowLength = posA.clone().sub(posB.clone()).length();

        const now = this.timestamp;
        const done = now - this.lastReset > this.timeout || this.winInfo.won;
        if (done) {
            this.scene.endBattle();
        }

        const time = now - this.lastReset;
        const reward: number[] = Array(this.colors.length).fill(0);
        const teleported = this.teleport.some(v => v > 0);
        this.colors.forEach((color, i) => {
            if (this.episode < 20 && !teleported) {
                // 场地长宽为 20*15
                reward[i] += -(nowLength - lastLength) * 0.1;
            }
            const info = this.damageInfo[i];
            // 生命值最大为 100
            reward[i] += info.damage.reduce(
                (prev, curr) => prev + curr * 0.2,
                0
            );
            reward[i] -= info.recv.reduce(
                (prev, curr) => prev + curr * 0.03,
                0
            );
            // 去边界施加惩罚
            reward[i] -= this.teleport[i] * this.totalTeleport[i];

            this.teleport[i] = 0;
            info.damage = [];
            info.recv = [];
            if (now - info.lastContact > 10000 && this.episode <= 50) {
                // 每多一秒没有接触就增加惩罚量，并逐渐降低权重
                const ratio = Math.max(1 - this.episode / 50, 0);
                reward[i] -= ratio;
            }
            if (time > this.timeout) {
                // 超时惩罚
                reward[i] -= 20;
            }
            if (this.winInfo.won) {
                // 获胜奖惩
                if (this.winInfo.color === color) {
                    reward[i] += 40 + (this.timeout - time) / 1000;
                } else {
                    reward[i] -= 10;
                }
            }
        });

        const reason = this.winInfo.won ? 'win' : 'timeout';

        const obs: Record<string, number[]> = {};
        const rewardObj: Record<string, number> = {};
        const termination: Record<string, boolean> = {};
        const truncation: Record<string, boolean> = {};
        const infos: Record<string, { reason: string }> = {};

        this.colors.forEach((v, i) => {
            const ball = this.scene.getBall(v);
            if (!ball) return;
            const data = ball.getUserData() as BallBodyData;
            if (!data) return;
            const pos = ball.getPosition();
            const vel = ball.getLinearVelocity();
            const angle = ball.getAngle() % (Math.PI * 2);
            const angularVel = ball.getAngularVelocity();

            // 要归一化
            obs[v] = [
                data.hp / 100,
                pos.x / 20,
                pos.y / 15,
                vel.x / 10,
                vel.y / 10,
                angle / Math.PI / 2,
                angularVel / 10,
                // 剩余时间
                (now - this.lastReset) / this.timeout
            ];
            rewardObj[v] = reward[i];
            termination[v] = done;
            truncation[v] = this.winInfo.won && v === this.winInfo.color;
            infos[v] = { reason };
        });

        const observation = {
            red: [...obs.red, ...obs.blue],
            blue: [...obs.blue, ...obs.red]
        };

        const toSend: BattleSendData = {
            observation,
            reward: rewardObj,
            termination,
            truncation,
            info: infos
        };

        this.send({ type: 'step', data: toSend });
    }

    async onTick(time: number, action: boolean) {
        if (action) {
            const action = (await this.getData()) as ISword1v1TrainData;
            this.actionTick(action);
        }
        this.display.remainTime = this.timeout - time + this.lastReset;
        this.display.episode = this.episode;
        this.colors.forEach((v, i) => {
            const ball = this.scene.getBall(v);
            if (!ball) return;
            const data = ball.getUserData() as BallBodyData;
            if (!data) return;
            const pos = ball.getPosition();
            const vel = ball.getLinearVelocity();
            const angle = ball.getAngle() % (Math.PI * 2);
            const angularVel = ball.getAngularVelocity();

            const obj = v === 'red' ? this.display.red : this.display.blue;
            obj.hp = data.hp;
            obj.x = pos.x;
            obj.y = pos.y;
            obj.vx = vel.x;
            obj.vy = vel.y;
            obj.angle = angle;
            obj.angularVel = angularVel;
            obj.actionHor = this.scene.actions[i].linear.x;
            obj.actionVer = this.scene.actions[i].linear.y;
            obj.actionRotate = this.scene.actions[i].angular;
        });
        this.tickEnd();
    }

    save(): ISword1v1SaveData {
        const info = this.getDisplayInfo();
        const data: ISword1v1SaveData = {
            episode: info.episode,
            colors: [info.red.color, info.blue.color],
            wins: [info.red.win, info.blue.win]
        };
        return data;
    }

    load(data: ISword1v1SaveData): void {
        this.episode = data.episode;
        this.display.red.win = data.wins[0];
        this.display.blue.win = data.wins[1];
        this.wins = { red: data.wins[0], blue: data.wins[1] };
    }

    getDisplayInfo(): ISword1v1DisplayInfo {
        return this.display;
    }

    onBind(scene: IScene<ISword1v1SceneState, ISword1v1DisplayInfo>): void {
        this.scene = scene as Sword1v1Scene;
    }
}
