import { Prisma } from '@prisma/client';
import prisma from 'lib/prisma-client';
import moment from 'moment-timezone';
import { MYSQL, POSTGRESQL, SQLITE, getDatabaseType } from 'lib/db';
import { FILTER_COLUMNS, SESSION_COLUMNS, OPERATORS, DEFAULT_PAGE_SIZE } from './constants';
import { loadWebsite } from './load';
import { maxDate } from './date';
import { QueryFilters, QueryOptions, SearchFilter } from './types';

const MYSQL_DATE_FORMATS = {
  minute: '%Y-%m-%d %H:%i:00',
  hour: '%Y-%m-%d %H:00:00',
  day: '%Y-%m-%d',
  month: '%Y-%m-01',
  year: '%Y-01-01',
};

const POSTGRESQL_DATE_FORMATS = {
  minute: 'YYYY-MM-DD HH24:MI:00',
  hour: 'YYYY-MM-DD HH24:00:00',
  day: 'YYYY-MM-DD',
  month: 'YYYY-MM-01',
  year: 'YYYY-01-01',
};

function getAddIntervalQuery(field: string, interval: string): string {
  const db = getDatabaseType(process.env.DATABASE_URL);

  if (db === POSTGRESQL) {
    return `${field} + interval '${interval}'`;
  }

  if (db === SQLITE) {
    const [num, unit] = interval.split(' ');
    return `datetime(${field}, '+${num} ${unit}')`;
  }

  if (db === MYSQL) {
    return `DATE_ADD(${field}, interval ${interval})`;
  }
}

function getDayDiffQuery(field1: string, field2: string): string {
  const db = getDatabaseType(process.env.DATABASE_URL);

  if (db === POSTGRESQL) {
    return `${field1}::date - ${field2}::date`;
  }

  if (db === SQLITE) {
    return `julianday(${field1}) - julianday(${field2})`;
  }

  if (db === MYSQL) {
    return `DATEDIFF(${field1}, ${field2})`;
  }
}

function getCastColumnQuery(field: string, type: string): string {
  const db = getDatabaseType(process.env.DATABASE_URL);

  if (db === POSTGRESQL) {
    return `${field}::${type}`;
  }

  if (db === SQLITE) {
    return `CAST(${field} AS ${type})`;
  }

  if (db === MYSQL) {
    return `CAST(${field} AS ${type})`;
    // return `${field}`;
  }
}

function getDateQuery(field: string, unit: string, timezone?: string): string {
  const db = getDatabaseType();

  if (db === POSTGRESQL) {
    if (timezone) {
      return `to_char(date_trunc('${unit}', ${field} at time zone '${timezone}'), '${POSTGRESQL_DATE_FORMATS[unit]}')`;
    }
    return `to_char(date_trunc('${unit}', ${field}), '${POSTGRESQL_DATE_FORMATS[unit]}')`;
  }

  if (db === SQLITE) {
    let sqliteFormat;
    switch (unit) {
      case 'year':
        sqliteFormat = '%Y';
        break;
      case 'month':
        sqliteFormat = '%Y-%m';
        break;
      case 'day':
        sqliteFormat = '%Y-%m-%d';
        break;
      case 'hour':
        sqliteFormat = '%Y-%m-%d %H';
        break;
      default:
        sqliteFormat = '%Y-%m-%d';
    }
    return `strftime('${sqliteFormat}', ${field})`;
  }

  if (db === MYSQL) {
    if (timezone) {
      const tz = moment.tz(timezone).format('Z');

      return `date_format(convert_tz(${field},'+00:00','${tz}'), '${MYSQL_DATE_FORMATS[unit]}')`;
    }

    return `date_format(${field}, '${MYSQL_DATE_FORMATS[unit]}')`;
  }
}

function getTimestampDiffQuery(field1: string, field2: string): string {
  const db = getDatabaseType();

  if (db === POSTGRESQL) {
    return `EXTRACT(EPOCH FROM (${field2} - ${field1}))`;
  }

  if (db === SQLITE) {
    return `strftime('%s', ${field2}) - strftime('%s', ${field1})`;
  }

  if (db === MYSQL) {
    return `TIMESTAMPDIFF(SECOND, ${field1}, ${field2})`;
  }
}

function mapFilter(column, operator, name, type = 'varchar') {
  switch (operator) {
    case OPERATORS.equals:
      return `${column} = {{${name}::${type}}}`;
    case OPERATORS.notEquals:
      return `${column} != {{${name}::${type}}}`;
    default:
      return '';
  }
}

function getFilterQuery(filters: QueryFilters = {}, options: QueryOptions = {}): string {
  const query = Object.keys(filters).reduce((arr, name) => {
    const value = filters[name];
    const operator = value?.filter ?? OPERATORS.equals;
    const column = FILTER_COLUMNS[name] ?? options?.columns?.[name];

    if (value !== undefined && column) {
      arr.push(`and ${mapFilter(column, operator, name)}`);

      if (name === 'referrer') {
        arr.push(
          'and (website_event.referrer_domain != {{websiteDomain}} or website_event.referrer_domain is null)',
        );
      }
    }

    return arr;
  }, []);

  return query.join('\n');
}

function normalizeFilters(filters = {}) {
  return Object.keys(filters).reduce((obj, key) => {
    const value = filters[key];

    obj[key] = value?.value ?? value;

    return obj;
  }, {});
}

async function parseFilters(
  websiteId: string,
  filters: QueryFilters = {},
  options: QueryOptions = {},
) {
  const website = await loadWebsite(websiteId);

  return {
    joinSession:
      options?.joinSession || Object.keys(filters).find(key => SESSION_COLUMNS.includes(key))
        ? `inner join session on website_event.session_id = session.session_id`
        : '',
    filterQuery: getFilterQuery(filters, options),
    params: {
      ...normalizeFilters(filters),
      websiteId,
      startDate: maxDate(filters.startDate, website.resetAt),
      websiteDomain: website.domain,
    },
  };
}

async function rawQuery(sql: string, data: object): Promise<any> {
  const db = getDatabaseType();
  const params = [];

  if (db !== POSTGRESQL && db !== MYSQL && db !== SQLITE) {
    return Promise.reject(new Error('Unknown database.'));
  }

  const query = sql?.replaceAll(/\{\{\s*(\w+)(::\w+)?\s*}}/g, (...args) => {
    const [, name, type] = args;
    params.push(data[name]);

    return db === MYSQL || db === SQLITE ? '?' : `$${params.length}${type ?? ''}`;
  });

  return prisma.rawQuery(query, params);
}

function getPageFilters(filters: SearchFilter): [
  {
    orderBy: {
      [x: string]: string;
    }[];
    take: number;
    skip: number;
  },
  {
    pageSize: number;
    page: number;
    orderBy: string;
  },
] {
  const { page = 1, pageSize = DEFAULT_PAGE_SIZE, orderBy, sortDescending = false } = filters || {};

  return [
    {
      ...(pageSize > 0 && { take: +pageSize, skip: +pageSize * (page - 1) }),
      ...(orderBy && {
        orderBy: [
          {
            [orderBy]: sortDescending ? 'desc' : 'asc',
          },
        ],
      }),
    },
    { page: +page, pageSize, orderBy },
  ];
}

function getSearchMode(): { mode?: Prisma.QueryMode } {
  const db = getDatabaseType();

  if (db === POSTGRESQL) {
    return {
      mode: 'insensitive',
    };
  }

  return {};
}

export default {
  ...prisma,
  getAddIntervalQuery,
  getDayDiffQuery,
  getCastColumnQuery,
  getDateQuery,
  getTimestampDiffQuery,
  getFilterQuery,
  parseFilters,
  getPageFilters,
  getSearchMode,
  rawQuery,
};
