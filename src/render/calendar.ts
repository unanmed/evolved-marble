/**
 * 简化历与视频信息条格式化（D-11）：纯函数、无状态、无类，
 * 只把累计游戏分钟换算成虚构历法（1 年 = 12 月 × 30 天，1 天 = 24 小时）。
 * 绝不读取 wall-clock、`Date`、locale 或时区，因此同一游戏分钟永远渲染同一字符串；
 * 本模块不引用 Pixi/Rapier，也不做任何 I/O。
 */

/** 每天的分钟数（历法定义，不是可调视觉参数）。 */
export const MINUTES_PER_DAY = 1440;

/** 每月的天数（D-11：固定 30 天）。 */
export const DAYS_PER_MONTH = 30;

/** 每年的月数（D-11：固定 12 月）。 */
export const MONTHS_PER_YEAR = 12;

/** 每年的天数：`DAYS_PER_MONTH × MONTHS_PER_YEAR`，即 360 天。 */
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;

/**
 * 两位补零，不依赖 `Intl`/`toLocaleString`（避免 locale 与运行时差异）。
 * @param value 待补零的整数。
 * @returns 至少两位的十进制字符串。
 */
function pad2(value: number): string {
    return String(value).padStart(2, '0');
}

/**
 * 把累计游戏分钟换算为 D-11 的日历字符串 `第 Y 年 M 月 D 日 HH:MM`。
 * 非有限或负值先归零；全部运算为整数运算，不累积浮点误差。
 * @param gameMinutes 累计游戏分钟。
 * @returns 形如 `第 1 年 1 月 1 日 00:00` 的字符串。
 */
export function formatCalendar(gameMinutes: number): string {
    const total = Math.max(
        0,
        Math.floor(Number.isFinite(gameMinutes) ? gameMinutes : 0)
    );
    const dayIndex = Math.floor(total / MINUTES_PER_DAY);
    const year = Math.floor(dayIndex / DAYS_PER_YEAR) + 1;
    const dayOfYear = dayIndex % DAYS_PER_YEAR;
    const month = Math.floor(dayOfYear / DAYS_PER_MONTH) + 1;
    const day = (dayOfYear % DAYS_PER_MONTH) + 1;
    const hour = Math.floor((total % MINUTES_PER_DAY) / 60);
    const minute = total % 60;
    return `第 ${year} 年 ${month} 月 ${day} 日 ${pad2(hour)}:${pad2(minute)}`;
}

/**
 * 把每 tick 的游戏分钟数格式化为速度后缀（D-11）。
 * 非有限、非正数返回破折号，避免信息条出现 `NaN×` 或 `0×`。
 * @param minutesPerTick 每 tick 游戏分钟数。
 * @returns 形如 `24×` 的字符串，无效时返回 `—`。
 */
export function formatSpeed(minutesPerTick: number): string {
    return Number.isFinite(minutesPerTick) && minutesPerTick > 0
        ? `${Math.round(minutesPerTick)}×`
        : '—';
}

/**
 * 组合视频左上角信息条的完整字符串：`第 Y 年 M 月 D 日 HH:MM / N×`。
 * @param gameMinutes 累计游戏分钟。
 * @param minutesPerTick 每 tick 游戏分钟数。
 * @returns 信息条文本。
 */
export function formatGameTime(
    gameMinutes: number,
    minutesPerTick: number
): string {
    return `${formatCalendar(gameMinutes)} / ${formatSpeed(minutesPerTick)}`;
}
