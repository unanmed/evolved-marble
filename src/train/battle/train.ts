import { Vec2 } from 'planck-js';
import type { BallBodyData, BattleScene } from '../../scene/battle/scene';
import {
    TrainProcess,
    type ITrainDataBase,
    type ITrainParallelResets
} from '../manager';

interface BattleTrainData extends ITrainDataBase {
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

export class BattleTrain extends TrainProcess<
    BattleTrainData,
    ITrainParallelResets<number[], BattleBallInfo>
> {
    readonly id: string = 'battle';
    readonly interval: number = 100;

    private scene!: BattleScene;

    private damageInfo: DamageInfo[] = [];
    private colors: string[] = [];
    private teleport: number[] = [];
    private totalTeleport: number[] = [];
    private winInfo: WinInfo = { won: false, color: 'red' };
    private wins: Record<string, number> = {};

    private lastReset: number = 0;

    initialize(): void {
        this.scene = this.manager.scene.get('battle') as BattleScene;
        this.scene.on(
            'attack',
            (attacker: string, defender: string, damage: number) => {
                const attIdx = this.colors.indexOf(attacker);
                const defIdx = this.colors.indexOf(defender);
                if (attIdx === -1 || defIdx === -1) return;
                const now = performance.now();
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
        });
        this.scene.on('contact', (a: string, b: string) => {
            const now = performance.now();
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

        // 展示数据
        const left = document.createElement('div');
        const right = document.createElement('div');
        left.style.position = 'fixed';
        left.style.left = '0';
        left.style.top = '0';
        left.style.width = '200px';
        left.style.height = '100%';
        left.style.display = 'flex';
        left.style.flexDirection = 'column';
        left.style.justifyContent = 'center';
        left.style.alignItems = 'end';
        left.style.color = 'white';
        left.style.font = '24px Arial';
        right.style.position = 'fixed';
        right.style.right = '0';
        right.style.top = '0';
        right.style.width = '200px';
        right.style.height = '100%';
        right.style.display = 'flex';
        right.style.flexDirection = 'column';
        right.style.justifyContent = 'center';
        right.style.alignItems = 'start';
        right.style.color = 'white';
        right.style.font = '24px Arial';

        document.body.appendChild(left);
        document.body.appendChild(right);

        const remainTime = document.createElement('span');
        const episode = document.createElement('span');
        const info1 = document.createElement('span');
        const info2 = document.createElement('span');
        const info3 = document.createElement('span');
        const info4 = document.createElement('span');
        const win1 = document.createElement('span');
        const win2 = document.createElement('span');
        const winInfo1 = document.createElement('span');
        const winInfo2 = document.createElement('span');

        remainTime.style.marginBottom = '32px';
        episode.style.marginBottom = '32px';
        info3.style.marginTop = '32px';
        info4.style.marginTop = '32px';
        // win1.style.marginTop = '32px';
        // win2.style.marginTop = '32px';
        winInfo1.style.marginBottom = '32px';
        winInfo2.style.marginBottom = '32px';

        info1.innerText = '红方信息';
        info2.innerText = '蓝方信息';
        info3.innerText = '红方操作';
        info4.innerText = '蓝方操作';
        win1.innerText = '红方胜率';
        win2.innerText = '蓝方胜率';

        const infoName: Record<string, string> = {
            hp: '生命值',
            x: 'x坐标',
            y: 'y坐标',
            vx: 'x速度',
            vy: 'y速度',
            angle: '旋转角',
            angularVel: '角速度'
        };
        const actionName: Record<string, string> = {
            horizontal: '水平',
            vertical: '竖直',
            rotate: '旋转'
        };

        const infos: Record<string, Record<string, HTMLSpanElement>> = {};
        const actions: Record<string, Record<string, HTMLSpanElement>> = {};

        left.appendChild(remainTime);
        left.appendChild(win1);
        left.appendChild(winInfo1);
        left.appendChild(info1);
        right.appendChild(episode);
        right.appendChild(win2);
        right.appendChild(winInfo2);
        right.appendChild(info2);

        for (const color of this.colors) {
            infos[color] = {};
            actions[color] = {};
            for (const key of Object.keys(infoName)) {
                infos[color][key] = document.createElement('span');
            }
            for (const key of Object.keys(actionName)) {
                actions[color][key] = document.createElement('span');
            }
        }

        for (const ele of Object.values(infos.red)) {
            left.appendChild(ele);
        }
        for (const ele of Object.values(infos.blue)) {
            right.appendChild(ele);
        }

        left.appendChild(info3);
        right.appendChild(info4);

        for (const ele of Object.values(actions.red)) {
            left.appendChild(ele);
        }
        for (const ele of Object.values(actions.blue)) {
            right.appendChild(ele);
        }

        const update = () => {
            const now = performance.now();
            const remain = 60000 - now + this.lastReset;
            remainTime.innerText = `剩余时间：${Math.floor(
                remain / 1000
            ).toString()}`;

            episode.innerText = `当前轮数：${this.iteration}`;
            const redWin = this.wins.red ?? 0;
            const blueWin = this.wins.blue ?? 0;
            const total = redWin + blueWin;
            const redWinRatio = (redWin / total) * 100 || 0;
            const blueWinRatio = (blueWin / total) * 100 || 0;
            winInfo1.innerText = `${redWin}(${redWinRatio.toFixed(2)}%)`;
            winInfo2.innerText = `${blueWin}(${blueWinRatio.toFixed(2)}%)`;

            this.colors.forEach((v, i) => {
                const ball = this.scene.getBall(v);
                if (!ball) return;
                const data = ball.getUserData() as BallBodyData;
                if (!data) return;
                const pos = ball.getPosition();
                const vel = ball.getLinearVelocity();
                const angle = ball.getAngle() % (Math.PI * 2);
                const angularVel = ball.getAngularVelocity();

                const values: Record<string, number> = {
                    hp: data.hp,
                    x: pos.x,
                    y: pos.y,
                    vx: vel.x,
                    vy: vel.y,
                    angle: angle,
                    angularVel: angularVel
                };
                const actionValue: Record<string, number> = {
                    horizontal: this.scene.actions[i].linear.x,
                    vertical: this.scene.actions[i].linear.y,
                    rotate: this.scene.actions[i].angular
                };

                for (const [key, value] of Object.entries(values)) {
                    infos[v][key].innerText = `${
                        infoName[key]
                    }：${value.toFixed(2)}`;
                }
                for (const [key, value] of Object.entries(actionValue)) {
                    actions[v][key].innerText = `${
                        actionName[key]
                    }：${value.toFixed(2)}`;
                }
            });

            requestAnimationFrame(update);
        };
        update();
    }

    onReset(): ITrainParallelResets<number[], BattleBallInfo> {
        const now = performance.now();
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

    async onData(data: BattleTrainData): Promise<void> {
        if (this.pending || data.type !== 'action') return;
        this.colors.forEach(v => {
            const [x, y] = data.actions[v].linear;
            this.scene.actionMove(v, new Vec2(x, y));
            this.scene.actionRotate(v, data.actions[v].angular);
        });
        const [ballA, ballB] = this.scene.balls;
        const posA = ballA.getPosition();
        const posB = ballB.getPosition();
        const lastLength = posA.clone().sub(posB.clone()).length();
        await this.waitPending();
        const nowLength = posA.clone().sub(posB.clone()).length();

        const now = performance.now();
        const done = now - this.lastReset > 60000 || this.winInfo.won;

        const reward: number[] = Array(this.colors.length).fill(0);
        const teleported = this.teleport.some(v => v > 0);
        this.colors.forEach((color, i) => {
            if (this.iteration < 20 && !teleported) {
                // 场地长宽为 20*15
                reward[i] += -(nowLength - lastLength) * 0.1;
            }
            const info = this.damageInfo[i];
            // 生命值最大为 100
            reward[i] += info.damage.reduce(
                (prev, curr) => prev + curr * 0.3,
                0
            );
            reward[i] -= info.recv.reduce((prev, curr) => prev + curr * 0.1, 0);
            // 去边界施加惩罚
            reward[i] -= this.teleport[i] * this.totalTeleport[i];

            this.teleport[i] = 0;
            info.damage = [];
            info.recv = [];
            if (now - info.lastContact > 10000) {
                // 每多一秒没有接触就增加惩罚量，并逐渐降低权重
                const ratio = Math.max(1 - this.iteration / 50, 0);
                reward[i] -= ratio;
            }
            if (now - this.lastReset > 60000) {
                // 超时惩罚
                reward[i] -= 20;
            }
            if (this.winInfo.won) {
                // 获胜奖惩
                if (this.winInfo.color === color) {
                    reward[i] += 20;
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
                (now - this.lastReset) / 60000
            ];
            rewardObj[v] = reward[i];
            termination[v] = done;
            truncation[v] = v === this.winInfo.color;
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

        this.send(toSend);
    }
}
