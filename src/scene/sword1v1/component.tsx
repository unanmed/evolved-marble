import { defineComponent, ref, shallowReactive } from 'vue';
import {
    ElementLocator,
    Font,
    GameUI,
    MotaOffscreenCanvas2D,
    onTick,
    SetupComponentOptions,
    Sprite
} from '@motajs/client';
import { SceneUIProps, SceneMode } from '@/common';
import {
    BallBodyData,
    BattleFixtureData,
    BodyType,
    DamageRender,
    ISword1v1DisplayInfo,
    ISword1v1SceneState
} from './types';
import { Sword1v1Scene } from './scene';

const sword1v1SceneProps = {
    props: ['scene']
} satisfies SetupComponentOptions<
    SceneUIProps<ISword1v1SceneState, ISword1v1DisplayInfo>
>;

export const Sword1v1SceneCom = defineComponent<
    SceneUIProps<ISword1v1SceneState, ISword1v1DisplayInfo>
>(props => {
    const ele = ref<Sprite>();
    const hideScene = ref(false);
    const hideInfo = ref(false);

    const d = shallowReactive<ISword1v1DisplayInfo>({
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
    });

    onTick(() => {
        ele.value?.update();
        const mode = props.scene.getMode();
        if (mode === SceneMode.None || mode === SceneMode.Info) {
            hideScene.value = true;
        } else {
            hideScene.value = false;
        }
        if (mode === SceneMode.None) {
            hideInfo.value = true;
        } else {
            hideInfo.value = false;
        }
        const display = props.scene.getDisplayInfo();
        if (!display) return;
        d.episode = display.episode;
        d.remainTime = Math.max(display.remainTime, 0);
        d.red = { ...display.red };
        d.blue = { ...display.blue };
    });

    const drawScene = (canvas: MotaOffscreenCanvas2D, scene: Sword1v1Scene) => {
        const ctx = canvas.ctx;
        ctx.drawImage(scene.backImage, 0, 0, canvas.width, canvas.height);
        const scale = canvas.width / 20;

        for (
            let body = scene.world.getBodyList();
            body;
            body = body.getNext()
        ) {
            const pos = body.getPosition();
            const angle = body.getAngle();
            const data = body.getUserData() as BallBodyData;
            if (data && data.isMarble) {
                // 生命值
                ctx.save();
                ctx.translate(pos.x * scale, pos.y * scale);
                ctx.beginPath();
                ctx.rect(-0.5 * scale, -0.9 * scale, 1 * scale, 0.1 * scale);
                ctx.lineWidth = 6;
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
        const now = performance.now();
        for (const damage of scene.damageRender) {
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
            scene.damageRender.delete(v);
        });
        ctx.restore();
    };

    const render = (canvas: MotaOffscreenCanvas2D) => {
        const scene = props.scene as Sword1v1Scene;
        const mode = scene.getMode();

        if (mode === SceneMode.Scene) {
            drawScene(canvas, scene);
        }
    };

    /** Win Ratio */
    const wr = (count: number) => {
        const ratio = Math.min(count / (d.red.win + d.blue.win), 1);
        if (isNaN(ratio)) return '0(0%)';
        else return `${count}(${(ratio * 100).toFixed(2)}%)`;
    };

    const time = (time: number) => {
        return `${Math.floor(time / 1000 / 60)}:${Math.floor(
            (time / 1000) % 60
        )}`;
    };

    /** Normalize */
    const n = (num: number) => {
        return num.toFixed(2);
    };

    /** Right */
    const r = (h: number, interval: number = 0): ElementLocator => {
        return [224, 24 + 36 * h + interval * 32, void 0, void 0, 1, 0.5];
    };

    /** Left */
    const l = (h: number, interval: number = 0): ElementLocator => {
        return [16, 24 + 36 * h + interval * 32, void 0, void 0, 0, 0.5];
    };

    Font.setDefaults(new Font('Arial', 28));

    return () => (
        <container loc={[0, 0, 1920, 1080]}>
            <sprite
                loc={[240, 0, 1440, 1080]}
                ref={ele}
                hidden={hideScene.value}
                render={render}
                zIndex={0}
            ></sprite>
            <container
                loc={[0, 540, 240, 648, 0, 0.5]}
                hidden={hideInfo.value}
                zIndex={5}
            >
                <text text={`剩余时间  ${time(d.remainTime)}`} loc={r(0)} />
                <text text="红方胜率" loc={r(1, 1)} />
                <text text={wr(d.red.win)} loc={r(2, 1)} />
                <text text="红方信息" loc={r(3, 2)} />
                <text text={`生命值：${n(d.red.hp)}`} loc={r(4, 2)} />
                <text text={`x坐标：${n(d.red.x)}`} loc={r(5, 2)} />
                <text text={`y坐标：${n(d.red.y)}`} loc={r(6, 2)} />
                <text text={`x速度：${n(d.red.vx)}`} loc={r(7, 2)} />
                <text text={`y速度：${n(d.red.vy)}`} loc={r(8, 2)} />
                <text text={`旋转角：${n(d.red.angle)}`} loc={r(9, 2)} />
                <text text={`角速度：${n(d.red.angularVel)}`} loc={r(10, 2)} />
                <text text="红方操作" loc={r(11, 3)} />
                <text text={`水平：${n(d.red.actionHor)}`} loc={r(12, 3)} />
                <text text={`竖直：${n(d.red.actionVer)}`} loc={r(13, 3)} />
                <text text={`旋转：${n(d.red.actionRotate)}`} loc={r(14, 3)} />
            </container>
            <container
                loc={[1680, 540, 240, 648, 0, 0.5]}
                hidden={hideInfo.value}
                zIndex={5}
            >
                <text text={`当前轮数：${Math.max(d.episode, 0)}`} loc={l(0)} />
                <text text="蓝方胜率" loc={l(1, 1)} />
                <text text={wr(d.blue.win)} loc={l(2, 1)} />
                <text text="蓝方信息" loc={l(3, 2)} />
                <text text={`生命值：${n(d.blue.hp)}`} loc={l(4, 2)} />
                <text text={`x坐标：${n(d.blue.x)}`} loc={l(5, 2)} />
                <text text={`y坐标：${n(d.blue.y)}`} loc={l(6, 2)} />
                <text text={`x速度：${n(d.blue.vx)}`} loc={l(7, 2)} />
                <text text={`y速度：${n(d.blue.vy)}`} loc={l(8, 2)} />
                <text text={`旋转角：${n(d.blue.angle)}`} loc={l(9, 2)} />
                <text text={`角速度：${n(d.blue.angularVel)}`} loc={l(10, 2)} />
                <text text="蓝方操作" loc={l(11, 3)} />
                <text text={`水平：${n(d.blue.actionHor)}`} loc={l(12, 3)} />
                <text text={`竖直：${n(d.blue.actionVer)}`} loc={l(13, 3)} />
                <text text={`旋转：${n(d.blue.actionRotate)}`} loc={l(14, 3)} />
            </container>
        </container>
    );
}, sword1v1SceneProps);

export const Sword1v1SceneUI = new GameUI('sowrd1v1-scene', Sword1v1SceneCom);
