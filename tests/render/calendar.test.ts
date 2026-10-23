import { describe, expect, it } from 'vitest';

import {
    DAYS_PER_MONTH,
    DAYS_PER_YEAR,
    formatCalendar,
    formatGameTime,
    formatSpeed,
    MINUTES_PER_DAY,
    MONTHS_PER_YEAR
} from '@/render/calendar';

describe('render/calendar — calendar definitions', () => {
    it('pins the 360-day simplified calendar (D-11)', () => {
        expect(MINUTES_PER_DAY).toBe(1440);
        expect(DAYS_PER_MONTH).toBe(30);
        expect(MONTHS_PER_YEAR).toBe(12);
        expect(DAYS_PER_YEAR).toBe(360);
    });
});

describe('render/calendar — formatCalendar boundary table', () => {
    it('renders the exact string at each calendar boundary', () => {
        const cases: readonly (readonly [number, string])[] = [
            [0, '第 1 年 1 月 1 日 00:00'],
            [1, '第 1 年 1 月 1 日 00:01'],
            [59, '第 1 年 1 月 1 日 00:59'],
            [60, '第 1 年 1 月 1 日 01:00'],
            [1439, '第 1 年 1 月 1 日 23:59'],
            [1440, '第 1 年 1 月 2 日 00:00'],
            [43200, '第 1 年 2 月 1 日 00:00'],
            [44640, '第 1 年 2 月 2 日 00:00'],
            [518400, '第 2 年 1 月 1 日 00:00']
        ];
        for (const [minutes, expected] of cases) {
            expect(formatCalendar(minutes), `minute ${minutes}`).toBe(expected);
        }
    });

    it('keeps minute 1439 on day 1 and minute 1440 on day 2', () => {
        expect(formatCalendar(1439)).toBe('第 1 年 1 月 1 日 23:59');
        expect(formatCalendar(1440)).toBe('第 1 年 1 月 2 日 00:00');
    });

    it('zero-pads the hour and minute fields', () => {
        expect(formatCalendar(9 * 60 + 5)).toBe('第 1 年 1 月 1 日 09:05');
        expect(formatCalendar(9 * 60 + 50)).toBe('第 1 年 1 月 1 日 09:50');
    });

    it('guards negative and non-finite minutes to the year-1 start', () => {
        const guarded: readonly number[] = [
            -1,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY
        ];
        for (const minutes of guarded) {
            const text = formatCalendar(minutes);
            expect(text, `minutes ${String(minutes)}`).toBe(
                '第 1 年 1 月 1 日 00:00'
            );
            expect(text).not.toContain('NaN');
            expect(text).not.toContain('Infinity');
        }
    });
});

describe('render/calendar — formatSpeed', () => {
    it('renders a rounded multiplier for finite positive rates', () => {
        expect(formatSpeed(1)).toBe('1×');
        expect(formatSpeed(24)).toBe('24×');
        expect(formatSpeed(24.4)).toBe('24×');
        expect(formatSpeed(24.6)).toBe('25×');
    });

    it('renders a dash for non-positive or non-finite rates', () => {
        expect(formatSpeed(0)).toBe('—');
        expect(formatSpeed(-24)).toBe('—');
        expect(formatSpeed(Number.NaN)).toBe('—');
        expect(formatSpeed(Number.POSITIVE_INFINITY)).toBe('—');
    });
});

describe('render/calendar — formatGameTime', () => {
    it('joins the calendar and the speed with the exact separator', () => {
        expect(formatGameTime(0, 24)).toBe('第 1 年 1 月 1 日 00:00 / 24×');
    });

    it('renders the same string for the same game minute (D-17)', () => {
        const first = formatGameTime(1439, 1);
        const second = formatGameTime(1439, 1);
        expect(second).toBe(first);
        expect(first).toBe('第 1 年 1 月 1 日 23:59 / 1×');
    });

    it('never leaks NaN or Infinity into the composed string', () => {
        const text = formatGameTime(Number.NaN, Number.NaN);
        expect(text).toBe('第 1 年 1 月 1 日 00:00 / —');
        expect(text).not.toContain('NaN');
        expect(text).not.toContain('Infinity');
    });
});
