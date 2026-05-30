let isDev = false;
try {
  // @ts-expect-error - Vite injects import.meta.env at build time
  isDev = import.meta.env?.DEV === true;
} catch {
  isDev = false;
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
