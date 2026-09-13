import fs from 'fs';
import path from 'path';
import log4js from 'log4js';
import * as allure from 'allure-js-commons';
import { getConfig } from './config.js';

const config = getConfig();
const logDir = path.resolve(config.logDir);
const logFile = path.join(logDir, 'run.log');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const buffer = [];
let currentLevel = config.logLevel || 'info';

log4js.configure({
  appenders: {
    console: { type: 'console' },
    file: { type: 'file', filename: logFile },
  },
  categories: {
    default: { appenders: ['console', 'file'], level: currentLevel },
  },
});

const log4 = log4js.getLogger('orangehrm');

function formatMessage(level, message, meta) {
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${ts}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

function log(level, message, meta) {
  const line = formatMessage(level, message, meta);
  buffer.push(line);
  log4[level](meta ? `${message} ${JSON.stringify(meta)}` : message);
}

export const logger = {
  debug: (msg, meta) => log('debug', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  setLevel: (level) => {
    currentLevel = level;
    log4.level = level;
  },
  getBuffer: () => [...buffer],
  clearBuffer: () => {
    buffer.length = 0;
  },
  getLogFile: () => logFile,
};

export async function attachLogsToAllure(testInfo, label = 'execution-log') {
  const lines = buffer.slice(-50);
  if (testInfo) {
    await testInfo.attach(label, {
      body: lines.join('\n') || 'No log entries captured.',
      contentType: 'text/plain',
    });
  }
  if (lines.length) {
    await allure.attachment(label, lines.join('\n'), {
      contentType: 'text/plain',
      fileExtension: 'txt',
    });
  }
}

export function shutdownLogger() {
  return new Promise((resolve) => {
    log4js.shutdown((err) => {
      if (err) console.warn('[logger] log4js shutdown error:', err.message);
      resolve();
    });
  });
}

export default logger;
