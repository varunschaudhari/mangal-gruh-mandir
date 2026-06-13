const IS_PROD = process.env.NODE_ENV === 'production';

const C = {
  reset:  '\x1b[0m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  gray:   '\x1b[90m',
  bold:   '\x1b[1m',
};

const LEVEL_COLOR = {
  info:  C.cyan,
  warn:  C.yellow,
  error: C.red,
  http:  C.gray,
};

function devLine(level, message, meta) {
  const color  = LEVEL_COLOR[level] || C.reset;
  const tag    = `${color}${C.bold}[${level.toUpperCase().padEnd(5)}]${C.reset}`;
  const metaStr = meta && Object.keys(meta).length
    ? ' ' + C.gray + JSON.stringify(meta) + C.reset
    : '';
  return `${tag} ${message}${metaStr}`;
}

function prodLine(level, message, meta = {}) {
  return JSON.stringify({ ts: new Date().toISOString(), level, message, ...meta });
}

function write(level, message, meta) {
  const line = IS_PROD ? prodLine(level, message, meta) : devLine(level, message, meta);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  info:  (msg, meta) => write('info',  msg, meta),
  warn:  (msg, meta) => write('warn',  msg, meta),
  error: (msg, meta) => write('error', msg, meta),
  http:  (msg, meta) => write('http',  msg, meta),
};
