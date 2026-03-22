type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function timestamp(): string {
  return new Date().toISOString();
}

function format(level: LogLevel, prefix: string, message: string, ...args: unknown[]): string {
  return `[${timestamp()}] [${level.toUpperCase()}] [${prefix}] ${message}`;
}

export function createLogger(prefix: string) {
  return {
    debug(message: string, ...args: unknown[]) {
      console.debug(format('debug', prefix, message), ...args);
    },
    info(message: string, ...args: unknown[]) {
      console.info(format('info', prefix, message), ...args);
    },
    warn(message: string, ...args: unknown[]) {
      console.warn(format('warn', prefix, message), ...args);
    },
    error(message: string, ...args: unknown[]) {
      console.error(format('error', prefix, message), ...args);
    },
  };
}

export const logger = createLogger('server');
