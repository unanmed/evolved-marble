import { Vec2 } from 'planck-js';
import { IDisplayInfoBase } from '../../common';

interface Sword1v1DisplayBallInfo {
    color: string;
    win: number;
    hp: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    angularVel: number;
    actionHor: number;
    actionVer: number;
    actionRotate: number;
}

export interface ISword1v1DisplayInfo extends IDisplayInfoBase {
    remainTime: number;
    red: Sword1v1DisplayBallInfo;
    blue: Sword1v1DisplayBallInfo;
}

interface BallInfo {
    color: string;
    x: number;
    y: number;
    angle: number;
    vx: number;
    vy: number;
    /** 角速度 */
    va: number;
    /** 当前血量 */
    hp: number;
}

export interface ISword1v1SceneState {
    balls: BallInfo;
}

export interface BallBodyData {
    isMarble: boolean;
    color: string;
    hp: number;
    attackTime: number;
}

export const enum BodyType {
    Marble,
    Helmet,
    Sword
}

export interface BattleFixtureData {
    type: BodyType;
    color: string;
}

export interface DamageRender {
    x: number;
    y: number;
    startTime: number;
    value: number;
}

export interface BattleMove {
    linear: Vec2;
    angular: number;
}
