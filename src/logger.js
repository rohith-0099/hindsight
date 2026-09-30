// Minimal levelled logger. LOG_LEVEL=debug|info|warn|error|silent (default info).
import { config } from './config.js';

export const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 50 };

// sink needs log/warn/error methods; console by default, a fake in tests.
export function createLogger({ level = 'info', sink = console } = {}) {
  const min = LEVELS[level] ?? LEVELS.info;
  const at = (name, method) => (...args) => {
    if (LEVELS[name] >= min) sink[method](...args);
  };
  return {
    debug: at('debug', 'log'),
    info: at('info', 'log'),
    warn: at('warn', 'warn'),
    error: at('error', 'error'),
  };
}

export const log = createLogger({ level: config.logLevel });
