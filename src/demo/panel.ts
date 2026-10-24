/**
 * 操作者控制台（D-12/D-24）：`class OperatorPanel implements IOperatorPanel`。
 * 全部节点都用 `createElement` 构建、全部文本都经 `textContent` 写入，
 * 因此场景/势力/军队名永远不会被当作标记解析（T-05-42/ASVS V5）；
 * 全部监听器共用一个 `AbortController` 的信号，`dispose()` 一次 abort 即全部移除；
 * 比例尺读数另有一个有界定时器，同样在 `dispose()` 中清除。
 * 本类是纯 DOM 适配器：它只调用 `IOperatorPanelOptions` 上已声明的接缝
 * （runner 的暂停/单步/复位/延时/自动跟拍、camera 的跟拍目标、world 的 `issueOrder`），
 * 从不推进世界、从不渲染、也不读取单位内部——面板位于 canvas 之外，永不进入视频（D-12）。
 */

import type { IOperatorPanel, IOperatorPanelOptions } from '@/demo/types';
import { ArmyOrderKind } from '@/kingdom/types';
import type { IArmy, ICity, IFaction, IWorld } from '@/kingdom/types';
import { screenToWorld } from '@/render/cameraMath';
import { MAX_FRAME_DELAY_MS, MIN_FRAME_DELAY_MS } from '@/render/constants';
import type { ICameraTransform } from '@/render/types';

/** 面板标题（D-12）。 */
const PANEL_TITLE = '操作台';

/** 循环运行时的状态文案。 */
const STATUS_RUNNING = '运行中';

/** 循环停止时的状态文案。 */
const STATUS_PAUSED = '已暂停';

/** 自动跟拍开启时的状态文案。 */
const STATUS_AUTO_FOLLOW_ON = '自动跟拍';

/** 自动跟拍关闭时的状态文案（操作者选定的镜头不会被 runner 覆盖）。 */
const STATUS_AUTO_FOLLOW_OFF = '手动镜头';

/** 暂停按钮在循环运行时的文案（点击后暂停）。 */
const LABEL_PAUSE = '暂停';

/** 暂停按钮在循环停止时的文案（点击后继续）。 */
const LABEL_RESUME = '继续';

/** MoveTo 按钮的默认文案。 */
const LABEL_MOVE_TO = 'MoveTo';

/** MoveTo 按钮进入拾取模式后的文案（提示操作者去点画布）。 */
const LABEL_MOVE_TO_PICKING = '点击画布选点';

/** 空选择值：`<select>` 未选中任何项时的 `value`。 */
const NO_OPTION_VALUE = '';

/** 地图网格边长（米）：比例尺提示里的固定参照。 */
const MAP_GRID_METERS = 100;

/** 比例尺刷新间隔（毫秒）：有界定时器，`dispose()` 时清除。 */
const SCALE_REFRESH_INTERVAL_MS = 250;

/** 无法测量比例尺时的占位文案（canvas 未挂载或镜头缩放非有限值）。 */
const SCALE_UNAVAILABLE = '比例尺 --';

/**
 * 建造一行面板控件。
 * @returns 空的 `<div>` 容器。
 */
function createRow(): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'panel-row';
    return row;
}

/**
 * 建造一个按钮：节点与文案都不经 HTML 字符串，监听器绑定到释放信号。
 * @param label 按钮文案。
 * @param onClick 点击回调。
 * @param signal 释放信号：`dispose()` 后监听器自动移除。
 * @returns 按钮元素。
 */
function createButton(
    label: string,
    onClick: () => void,
    signal: AbortSignal
): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onClick, { signal });
    return button;
}

/**
 * 建造一个说明文字。
 * @param text 文案（只经 `textContent` 写入）。
 * @returns 说明文字节点。
 */
function createLabel(text: string): HTMLSpanElement {
    const label = document.createElement('span');
    label.className = 'panel-label';
    label.textContent = text;
    return label;
}

/**
 * 建造一个空的下拉框（选项由 `mount` 之后的世界读取填充）。
 * @returns 空的 `<select>`。
 */
function createSelect(): HTMLSelectElement {
    const select = document.createElement('select');
    select.className = 'panel-select';
    return select;
}

/**
 * 建造一个选项：`value` 是数字 id 的字符串形式，文本只经 `textContent` 写入。
 * @param value 数字 id。
 * @param text 选项文案。
 * @returns 选项元素。
 */
function createOption(value: number, text: string): HTMLOptionElement {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = text;
    return option;
}

/** 操作者控制台：canvas 之外的 HTML 控件，只驱动已声明的接缝（D-12/D-18/D-24）。 */
export class OperatorPanel implements IOperatorPanel {
    /** 注入的接缝集合（世界、镜头、runner、canvas、视口、场景名）。 */
    private readonly options: IOperatorPanelOptions;
    /** 挂载宿主；未挂载或已释放时为 `null`（缺失对象）。 */
    private host: HTMLElement | null;
    /** 当前选中的军队 id；未选中时为 `undefined`（缺失字面量）。 */
    private selectedArmyId: number | undefined;
    /** 是否处于 MoveTo 画布拾取模式。 */
    private picking: boolean;
    /** 面板事件的统一释放信号；`dispose()` 后重建以实现重新挂载。 */
    private controller: AbortController;
    /** 状态行文本节点。 */
    private statusText: HTMLSpanElement | null;
    /** 比例尺读数节点（canvas 之外，永不入镜，D-12）。 */
    private scaleText: HTMLDivElement | null;
    /** 比例尺刷新定时器；`dispose()` 后为 `null`（无计时器泄漏）。 */
    private scaleTimer: ReturnType<typeof setInterval> | null;
    /** 当前每帧延时的文本节点。 */
    private speedLabel: HTMLSpanElement | null;
    /** 速度滑杆（也用于把 runner 的延时回写进界面）。 */
    private speedInput: HTMLInputElement | null;
    /** 军队下拉框。 */
    private armySelect: HTMLSelectElement | null;
    /** 城池下拉框。 */
    private citySelect: HTMLSelectElement | null;
    /** 暂停/继续按钮（文案随循环状态切换）。 */
    private pauseButton: HTMLButtonElement | null;
    /** MoveTo 按钮（文案随拾取模式切换）。 */
    private moveToButton: HTMLButtonElement | null;
    /**
     * 面板记录的循环状态：`mount` 之后 `main` 会启动循环，因此初值为“运行中”，
     * 只在操作者动作（暂停/继续/重置）后由 runner 的实际状态同步。
     */
    private paused: boolean;

    /**
     * 构造面板：不触碰 DOM，也不读取世界——DOM 只在 `mount` 中创建。
     * @param options 注入的接缝集合。
     */
    constructor(options: IOperatorPanelOptions) {
        this.options = options;
        this.host = null;
        this.selectedArmyId = undefined;
        this.picking = false;
        this.controller = new AbortController();
        this.statusText = null;
        this.scaleText = null;
        this.scaleTimer = null;
        this.speedLabel = null;
        this.speedInput = null;
        this.armySelect = null;
        this.citySelect = null;
        this.pauseButton = null;
        this.moveToButton = null;
        this.paused = false;
    }

    /**
     * 把面板挂到宿主元素（D-12）：清空宿主后填入标题、比例尺、状态、运行、镜头、速度、
     * 军队与指令行，并挂上 canvas 拾取监听与比例尺刷新定时器；重复挂载为空操作。
     * @param host 面板宿主（canvas 之外的兄弟节点）。
     */
    mount(host: HTMLElement): void {
        if (this.host !== null) {
            return;
        }
        if (this.controller.signal.aborted) {
            this.controller = new AbortController();
        }
        this.host = host;
        host.replaceChildren();

        const section = document.createElement('section');
        section.className = 'panel';
        section.append(
            this.buildHeader(),
            this.buildScaleRow(),
            this.buildRunRow(),
            this.buildCameraRow(),
            this.buildSpeedRow(),
            this.buildArmyRow(),
            this.buildOrderRow(),
            this.buildErrorRow()
        );
        host.append(section);

        this.options.canvas.addEventListener(
            'click',
            event => this.onCanvasClick(event),
            { signal: this.controller.signal }
        );

        this.refreshArmyOptions();
        this.refreshCityOptions();
        this.refreshSpeedLabel();
        this.refreshPauseLabel();
        this.refreshStatus();
        this.refreshScale();
        this.scaleTimer = setInterval(
            () => this.refreshScale(),
            SCALE_REFRESH_INTERVAL_MS
        );
    }

    /**
     * 幂等释放：中止信号（移除 canvas 与全部控件监听）、清空宿主并丢弃所有节点引用。
     */
    dispose(): void {
        this.controller.abort();
        if (this.scaleTimer !== null) {
            clearInterval(this.scaleTimer);
            this.scaleTimer = null;
        }
        if (this.host !== null) {
            this.host.replaceChildren();
        }
        this.host = null;
        this.statusText = null;
        this.scaleText = null;
        this.speedLabel = null;
        this.speedInput = null;
        this.armySelect = null;
        this.citySelect = null;
        this.pauseButton = null;
        this.moveToButton = null;
        this.selectedArmyId = undefined;
        this.picking = false;
    }

    /**
     * 建造标题块：面板标题、场景名与状态行。
     * @returns 标题块元素。
     */
    private buildHeader(): HTMLElement {
        const header = document.createElement('header');
        const title = document.createElement('h1');
        title.textContent = PANEL_TITLE;
        const scenario = document.createElement('span');
        scenario.className = 'panel-scenario';
        scenario.textContent = this.options.scenarioName;
        const status = document.createElement('span');
        status.className = 'panel-status';
        this.statusText = status;
        header.append(title, scenario, status);
        return header;
    }

    /**
     * 建造比例尺行（仅操作台可见）：显示当前缩放下的米/像素换算与 100 m 网格提示，
     * 位于 canvas 之外，因此永远不会进入被捕捉的画面（D-12）。
     * @returns 比例尺文本块。
     */
    private buildScaleRow(): HTMLDivElement {
        const scale = document.createElement('div');
        scale.className = 'panel-scale';
        this.scaleText = scale;
        return scale;
    }

    /**
     * 建造运行行：暂停/继续、单步、重置。
     * @returns 运行行元素。
     */
    private buildRunRow(): HTMLElement {
        const row = createRow();
        const pause = createButton(
            LABEL_PAUSE,
            () => this.togglePause(),
            this.controller.signal
        );
        this.pauseButton = pause;
        row.append(
            pause,
            createButton('单步', () => this.stepOnce(), this.controller.signal),
            createButton(
                '重置',
                () => this.resetSession(),
                this.controller.signal
            )
        );
        return row;
    }

    /**
     * 建造镜头行：战斗 / 全景 / 自动（D-12/REND-04）。
     * @returns 镜头行元素。
     */
    private buildCameraRow(): HTMLElement {
        const row = createRow();
        row.append(
            createButton(
                '战斗',
                () => this.selectBattleCamera(),
                this.controller.signal
            ),
            createButton(
                '全景',
                () => this.selectStrategicCamera(),
                this.controller.signal
            ),
            createButton(
                '自动',
                () => this.selectAutoCamera(),
                this.controller.signal
            )
        );
        return row;
    }

    /**
     * 建造速度行：每帧延时滑杆（0–1000 ms）与当前值。
     * @returns 速度行元素。
     */
    private buildSpeedRow(): HTMLElement {
        const row = createRow();
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(MIN_FRAME_DELAY_MS);
        input.max = String(MAX_FRAME_DELAY_MS);
        input.step = '1';
        input.value = String(this.options.runner.getFrameDelay());
        input.addEventListener(
            'input',
            () => this.onSpeedInput(input.valueAsNumber),
            { signal: this.controller.signal }
        );
        this.speedInput = input;
        const value = document.createElement('span');
        value.className = 'panel-value';
        this.speedLabel = value;
        row.append(createLabel('每帧延时'), input, value);
        return row;
    }

    /**
     * 建造军队行：军队下拉框；选项在 `focus` 时按当前世界重建（reset 后仍可用）。
     * @returns 军队行元素。
     */
    private buildArmyRow(): HTMLElement {
        const row = createRow();
        const select = createSelect();
        select.addEventListener(
            'change',
            () => {
                this.selectedArmyId = this.parseId(select.value);
                this.refreshStatus();
            },
            { signal: this.controller.signal }
        );
        select.addEventListener('focus', () => this.refreshArmyOptions(), {
            signal: this.controller.signal
        });
        this.armySelect = select;
        row.append(createLabel('军队'), select);
        return row;
    }

    /**
     * 建造指令行：MoveTo（画布拾取）、Hold、城池下拉框与 Garrison。
     * @returns 指令行元素。
     */
    private buildOrderRow(): HTMLElement {
        const row = createRow();
        const moveTo = createButton(
            LABEL_MOVE_TO,
            () => this.setPicking(!this.picking),
            this.controller.signal
        );
        this.moveToButton = moveTo;
        const select = createSelect();
        select.addEventListener('focus', () => this.refreshCityOptions(), {
            signal: this.controller.signal
        });
        this.citySelect = select;
        row.append(
            moveTo,
            createButton(
                'Hold',
                () => this.issueHold(),
                this.controller.signal
            ),
            createLabel('城池'),
            select,
            createButton(
                'Garrison',
                () => this.issueGarrison(),
                this.controller.signal
            )
        );
        return row;
    }

    /**
     * 建造错误行：面板自身从不写它，`main` 负责上报启动/运行错误（Pitfall 23）。
     * @returns 空的 `role="status"` 段落。
     */
    private buildErrorRow(): HTMLElement {
        const line = document.createElement('p');
        line.className = 'panel-error';
        line.setAttribute('role', 'status');
        return line;
    }

    /**
     * 暂停/继续循环；runner 是运行状态的唯一真相，按钮与状态随后同步。
     */
    private togglePause(): void {
        const runner = this.options.runner;
        if (runner.isRunning()) {
            runner.pause();
            this.paused = true;
        } else {
            runner.start();
            this.paused = false;
        }
        this.refreshPauseLabel();
        this.refreshStatus();
    }

    /** 暂停时推进恰好一帧；运行中为空操作（由 runner 决定）。 */
    private stepOnce(): void {
        this.options.runner.stepOnce();
        this.refreshStatus();
    }

    /**
     * 复位会话：runner 暂停并重建世界，随后从新世界重建下拉框并清空选择。
     * 复位后循环处于暂停状态（`IManualRunner.reset` 的语义），操作者按“继续”恢复。
     */
    private resetSession(): void {
        this.options.runner.reset();
        this.paused = true;
        this.selectedArmyId = undefined;
        this.refreshArmyOptions();
        this.refreshCityOptions();
        this.refreshPauseLabel();
        this.setPicking(false);
    }

    /**
     * 战斗：重新开启自动跟拍并立即跟拍第一场活跃战斗（没有活跃战斗时回到全景）。
     */
    private selectBattleCamera(): void {
        this.options.runner.setAutoFollow(true);
        this.options.camera.setBattleTarget(
            this.firstActiveBattleId(this.options.getWorld())
        );
        this.refreshStatus();
    }

    /**
     * 全景：先关闭自动跟拍再清空跟拍目标，
     * 因此即使有活跃战斗，操作者选定的全景也不会被 runner 覆盖（D-12/REND-04）。
     */
    private selectStrategicCamera(): void {
        this.options.runner.setAutoFollow(false);
        this.options.camera.setBattleTarget(undefined);
        this.refreshStatus();
    }

    /**
     * 自动：开启自动跟拍；已有活跃战斗时立即跟拍，否则把选择留给下一帧的自动策略。
     */
    private selectAutoCamera(): void {
        this.options.runner.setAutoFollow(true);
        const battleId = this.firstActiveBattleId(this.options.getWorld());
        if (battleId !== undefined) {
            this.options.camera.setBattleTarget(battleId);
        }
        this.refreshStatus();
    }

    /**
     * 处理速度滑杆输入：非有限值忽略，其余交给 `runner.setFrameDelay` 钳制（D-12/D-17）。
     * @param value 滑杆读数（毫秒）。
     */
    private onSpeedInput(value: number): void {
        if (!Number.isFinite(value)) {
            return;
        }
        this.options.runner.setFrameDelay(value);
        this.refreshSpeedLabel();
        this.refreshStatus();
    }

    /**
     * 切换 MoveTo 拾取模式，并同步按钮文案与状态行。
     * @param picking 是否进入拾取模式。
     */
    private setPicking(picking: boolean): void {
        this.picking = picking;
        if (this.moveToButton !== null) {
            this.moveToButton.textContent = picking
                ? LABEL_MOVE_TO_PICKING
                : LABEL_MOVE_TO;
        }
        this.refreshStatus();
    }

    /**
     * canvas 点击拾取（D-24/T-05-43）：非拾取模式下立即返回；
     * CSS 像素先按 `getBoundingClientRect` 换算到 1920×1080 视口，
     * 再经排除震动的 `screenToWorld` 反变换成世界坐标，最后交给 `issueMoveTo` 校验。
     * @param event 点击事件。
     */
    private onCanvasClick(event: MouseEvent): void {
        if (!this.picking) {
            return;
        }
        const rect = this.options.canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            this.setPicking(false);
            return;
        }
        const viewport = this.options.viewport;
        const screen = {
            x: ((event.clientX - rect.left) / rect.width) * viewport.width,
            y: ((event.clientY - rect.top) / rect.height) * viewport.height
        };
        const transform = this.options.camera.getTransform();
        const shakeFree: ICameraTransform = {
            ...transform,
            shakeX: 0,
            shakeY: 0
        };
        const point = screenToWorld(screen, shakeFree, viewport);
        this.issueMoveTo(point.x, point.y);
    }

    /**
     * 下达 `MoveTo`（D-24）：点必须有限且落在地图内，否则只退出拾取模式而不下达，
     * 因此震动中的一次点击不会把军队送去错误坐标（T-05-43）。
     * @param x 目标点世界 x 坐标（米）。
     * @param y 目标点世界 y 坐标（米）。
     */
    private issueMoveTo(x: number, y: number): void {
        this.setPicking(false);
        const armyId = this.currentArmyId();
        if (
            armyId === undefined ||
            !Number.isFinite(x) ||
            !Number.isFinite(y)
        ) {
            return;
        }
        const bounds = this.options.getWorld().getBounds();
        if (x < 0 || x > bounds.width || y < 0 || y > bounds.height) {
            return;
        }
        this.options.getWorld().issueOrder({
            armyId,
            kind: ArmyOrderKind.MoveTo,
            targetX: x,
            targetY: y
        });
        this.refreshStatus();
    }

    /**
     * 下达 `Hold`；没有选中军队时为空操作。
     */
    private issueHold(): void {
        const armyId = this.currentArmyId();
        if (armyId === undefined) {
            return;
        }
        this.options.getWorld().issueOrder({
            armyId,
            kind: ArmyOrderKind.Hold
        });
        this.refreshStatus();
    }

    /**
     * 下达 `Garrison`；需要同时选中军队与城池。
     */
    private issueGarrison(): void {
        const armyId = this.currentArmyId();
        const cityId =
            this.citySelect === null
                ? undefined
                : this.parseId(this.citySelect.value);
        if (armyId === undefined || cityId === undefined) {
            return;
        }
        this.options.getWorld().issueOrder({
            armyId,
            kind: ArmyOrderKind.Garrison,
            cityId
        });
        this.refreshStatus();
    }

    /**
     * 当前选中的军队 id：只有有限非负整数才被接受。
     * @returns 军队 id 或 `undefined`（缺失字面量）。
     */
    private currentArmyId(): number | undefined {
        const armyId = this.selectedArmyId;
        if (armyId === undefined || !Number.isInteger(armyId) || armyId < 0) {
            return undefined;
        }
        return armyId;
    }

    /**
     * 解析下拉框的 id 值：空值与非法数字返回 `undefined`（缺失字面量，AGENTS §8）。
     * @param value 下拉框的 `value`。
     * @returns 有限非负整数或 `undefined`。
     */
    private parseId(value: string): number | undefined {
        if (value === NO_OPTION_VALUE) {
            return undefined;
        }
        const id = Number(value);
        return Number.isInteger(id) && id >= 0 ? id : undefined;
    }

    /**
     * 第一场活跃战斗的 id（与 runner 的自动跟拍策略一致）。
     * @param world 当前世界。
     * @returns 战斗 id 或 `undefined`。
     */
    private firstActiveBattleId(world: IWorld): number | undefined {
        return world.getBattleSystem().listActiveBattles()[0]?.getId();
    }

    /**
     * 用当前世界的势力→军队重建军队下拉框，并保留仍然存在的选择。
     */
    private refreshArmyOptions(): void {
        const select = this.armySelect;
        if (select === null) {
            return;
        }
        select.replaceChildren();
        const world = this.options.getWorld();
        for (const faction of world.getFactions()) {
            this.appendFactionArmies(select, faction, world);
        }
        const wanted =
            this.selectedArmyId === undefined
                ? NO_OPTION_VALUE
                : String(this.selectedArmyId);
        select.value = wanted;
        if (select.value !== wanted) {
            this.selectedArmyId = undefined;
        }
    }

    /**
     * 用当前世界的势力→城池重建城池下拉框。
     */
    private refreshCityOptions(): void {
        const select = this.citySelect;
        if (select === null) {
            return;
        }
        select.replaceChildren();
        const world = this.options.getWorld();
        for (const faction of world.getFactions()) {
            for (const cityId of faction.getCityIds()) {
                const city = world.getCity(cityId);
                if (city !== null) {
                    this.appendCityOption(select, city, world);
                }
            }
        }
    }

    /**
     * 追加一个势力下的全部军队选项。
     * @param select 军队下拉框。
     * @param faction 势力。
     * @param world 当前世界。
     */
    private appendFactionArmies(
        select: HTMLSelectElement,
        faction: IFaction,
        world: IWorld
    ): void {
        for (const armyId of faction.getArmyIds()) {
            const army = world.getArmy(armyId);
            if (army !== null) {
                this.appendArmyOption(select, army, world);
            }
        }
    }

    /**
     * 追加一个军队选项：文本是军队 id + 势力名。
     * @param select 军队下拉框。
     * @param army 军队。
     * @param world 当前世界。
     */
    private appendArmyOption(
        select: HTMLSelectElement,
        army: IArmy,
        world: IWorld
    ): void {
        const faction = world.getFaction(army.getFactionId());
        const name = faction === null ? NO_OPTION_VALUE : faction.getName();
        select.append(
            createOption(army.getId(), `${army.getId()} ${name}`.trim())
        );
    }

    /**
     * 追加一个城池选项：文本是城池 id + 归属势力名（无主城池标注为“无主”）。
     * @param select 城池下拉框。
     * @param city 城池。
     * @param world 当前世界。
     */
    private appendCityOption(
        select: HTMLSelectElement,
        city: ICity,
        world: IWorld
    ): void {
        const factionId = city.getFactionId();
        const name =
            factionId === undefined
                ? '无主'
                : (world.getFaction(factionId)?.getName() ?? NO_OPTION_VALUE);
        select.append(
            createOption(city.getId(), `${city.getId()} ${name}`.trim())
        );
    }

    /**
     * 把 runner 的当前延时同步到滑杆与文本（复位后仍保持一致）。
     */
    private refreshSpeedLabel(): void {
        const delay = this.options.runner.getFrameDelay();
        if (
            this.speedInput !== null &&
            this.speedInput.valueAsNumber !== delay
        ) {
            this.speedInput.value = String(delay);
        }
        if (this.speedLabel !== null) {
            this.speedLabel.textContent = `${delay} ms`;
        }
    }

    /**
     * 刷新比例尺读数（REND-01）：把镜头的「每米后备像素」按 CSS/后备宽度比换算成
     * 「每米 CSS 像素」，再给出 100 m 网格的等效像素宽度。canvas 未挂载（显示宽度为 0）、
     * 后备宽度为 0 或缩放非有限值时只显示占位文案，绝不写入 `NaN`。
     */
    private refreshScale(): void {
        const element = this.scaleText;
        if (element === null) {
            return;
        }
        const canvas = this.options.canvas;
        const backingWidth = canvas.width;
        const cssWidth = canvas.getBoundingClientRect().width;
        const scale = this.options.camera.getTransform().scale;
        if (
            !Number.isFinite(backingWidth) ||
            backingWidth <= 0 ||
            !Number.isFinite(cssWidth) ||
            cssWidth <= 0 ||
            !Number.isFinite(scale) ||
            scale <= 0
        ) {
            element.textContent = SCALE_UNAVAILABLE;
            return;
        }
        const cssRatio = cssWidth / backingWidth;
        const pxPerMeter = scale * cssRatio;
        if (!Number.isFinite(pxPerMeter) || pxPerMeter <= 0) {
            element.textContent = SCALE_UNAVAILABLE;
            return;
        }
        element.textContent = `比例尺 ${MAP_GRID_METERS} m ≈ ${Math.round(pxPerMeter * MAP_GRID_METERS)} px · 网格 ${MAP_GRID_METERS} m · 1 m = ${pxPerMeter.toFixed(2)} px`;
    }

    /**
     * 同步暂停按钮文案；面板只在操作者动作后调用，不去探测 `main` 的启动时机。
     */
    private refreshPauseLabel(): void {
        if (this.pauseButton !== null) {
            this.pauseButton.textContent = this.paused
                ? LABEL_RESUME
                : LABEL_PAUSE;
        }
    }

    /**
     * 刷新状态行：运行/暂停、帧数、每帧延时与镜头模式。
     */
    private refreshStatus(): void {
        if (this.statusText === null) {
            return;
        }
        const runner = this.options.runner;
        const state = this.paused ? STATUS_PAUSED : STATUS_RUNNING;
        const camera = runner.isAutoFollow()
            ? STATUS_AUTO_FOLLOW_ON
            : STATUS_AUTO_FOLLOW_OFF;
        const picking = this.picking ? ' · 选点中' : NO_OPTION_VALUE;
        this.statusText.textContent = `${state} · 帧 ${runner.getFrameCount()} · 延时 ${runner.getFrameDelay()} ms · ${camera}${picking}`;
    }
}
