import { DateTime, Interval } from 'luxon';
import { config } from '../config/index.js';

export interface TemporalResolution {
  isTemporal: boolean;
  term?: string;
  startDate?: string; // ISO 8601
  endDate?: string;   // ISO 8601
  description?: string;
}

export class TemporalResolver {
  private timezone: string;

  constructor(timezone?: string) {
    this.timezone = timezone || config.appTimezone || 'Asia/Kolkata';
  }

  getNow(referenceDate?: string): DateTime {
    if (referenceDate) {
      return DateTime.fromISO(referenceDate, { zone: this.timezone });
    }
    return DateTime.now().setZone(this.timezone);
  }

  resolve(queryText: string, referenceDate?: string): TemporalResolution {
    const text = queryText.toLowerCase();
    const now = this.getNow(referenceDate);

    // 1. "yesterday"
    if (/\byesterday\b/.test(text)) {
      const yesterday = now.minus({ days: 1 });
      return {
        isTemporal: true,
        term: 'yesterday',
        startDate: yesterday.startOf('day').toISO() || undefined,
        endDate: yesterday.endOf('day').toISO() || undefined,
        description: `Yesterday (${yesterday.toFormat('yyyy-MM-dd')}) in ${this.timezone}`,
      };
    }

    // 2. "last week"
    if (/\blast\s+week\b/.test(text)) {
      const startOfLastWeek = now.minus({ weeks: 1 }).startOf('week');
      const endOfLastWeek = now.minus({ weeks: 1 }).endOf('week');
      return {
        isTemporal: true,
        term: 'last week',
        startDate: startOfLastWeek.toISO() || undefined,
        endDate: endOfLastWeek.toISO() || undefined,
        description: `Last week (${startOfLastWeek.toFormat('yyyy-MM-dd')} to ${endOfLastWeek.toFormat('yyyy-MM-dd')})`,
      };
    }

    // 3. "last month"
    if (/\blast\s+month\b/.test(text)) {
      const lastMonth = now.minus({ months: 1 });
      return {
        isTemporal: true,
        term: 'last month',
        startDate: lastMonth.startOf('month').toISO() || undefined,
        endDate: lastMonth.endOf('month').toISO() || undefined,
        description: `Last month (${lastMonth.toFormat('MMMM yyyy')})`,
      };
    }

    // 4. "last year"
    if (/\blast\s+year\b/.test(text)) {
      const lastYear = now.minus({ years: 1 });
      return {
        isTemporal: true,
        term: 'last year',
        startDate: lastYear.startOf('year').toISO() || undefined,
        endDate: lastYear.endOf('year').toISO() || undefined,
        description: `Last year (${lastYear.toFormat('yyyy')})`,
      };
    }

    // 5. "previously" / "earlier" / "before" / "past" / "last time"
    if (/\b(previously|earlier|before|past|last\s+time|we\s+discussed)\b/.test(text)) {
      return {
        isTemporal: true,
        term: 'previously',
        startDate: now.minus({ years: 5 }).startOf('day').toISO() || undefined,
        endDate: now.toISO() || undefined,
        description: `Prior to ${now.toFormat('yyyy-MM-dd HH:mm')}`,
      };
    }

    // 6. "currently" / "now" / "present" / "today"
    if (/\b(currently|now|at\s+present|today)\b/.test(text)) {
      return {
        isTemporal: true,
        term: 'currently',
        startDate: now.startOf('day').toISO() || undefined,
        endDate: now.endOf('day').toISO() || undefined,
        description: `Current / Today (${now.toFormat('yyyy-MM-dd')})`,
      };
    }

    // 7. Explicit months (e.g., "in January", "in March 2026")
    const monthRegex = /\b(in\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)(\s+(\d{4}))?\b/;
    const monthMatch = text.match(monthRegex);
    if (monthMatch) {
      const monthName = monthMatch[2];
      const year = monthMatch[4] ? parseInt(monthMatch[4], 10) : now.year;
      const parsedMonth = DateTime.fromFormat(`${monthName} ${year}`, 'MMMM yyyy', { zone: this.timezone });
      if (parsedMonth.isValid) {
        return {
          isTemporal: true,
          term: monthMatch[0],
          startDate: parsedMonth.startOf('month').toISO() || undefined,
          endDate: parsedMonth.endOf('month').toISO() || undefined,
          description: `${parsedMonth.toFormat('MMMM yyyy')}`,
        };
      }
    }

    return {
      isTemporal: false,
    };
  }

  formatContextAnchor(referenceDate?: string): string {
    const now = this.getNow(referenceDate);
    return `Current Reference Time: ${now.toFormat('yyyy-MM-dd HH:mm:ss ZZZZ')} (${this.timezone})`;
  }
}

export const defaultTemporalResolver = new TemporalResolver();
