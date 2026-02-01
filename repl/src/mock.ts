// Mocking Framework for REPL

function deepEqual(x: any, y: any): boolean {
  if (x === y) return true;
  if (typeof x !== "object" || x === null || typeof y !== "object" || y === null) return false;
  if (Array.isArray(x) !== Array.isArray(y)) return false;
  
  const keysX = Object.keys(x), keysY = Object.keys(y);
  if (keysX.length !== keysY.length) return false;
  
  for (const key of keysX) {
    if (!keysY.includes(key) || !deepEqual(x[key], y[key])) return false;
  }
  return true;
}

export const jest = {
  fn: (impl?: (...args: any[]) => any) => {
    const mock = { calls: [] as any[][] };
    const fn = (...args: any[]) => {
      mock.calls.push(args);
      return impl ? impl(...args) : undefined;
    };
    (fn as any).mock = mock;
    return fn;
  }
};

export function describe(name: string, fn: () => void) {
  console.log(`%c 📂 DESCRIBE: ${name} `, "background: #333; color: #fff; font-weight: bold; padding: 2px 5px; border-radius: 3px;");
  fn();
}

export async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`%c ✅ PASS: ${name}`, "color: #4caf50; font-weight: bold;");
  } catch (e: any) {
    console.error(`%c ❌ FAIL: ${name}`, "color: #f44336; font-weight: bold;");
    console.error(e.message || e);
    throw e;
  }
}

export const expect = (received: any) => {
  const matchers = (isNot: boolean) => ({
    toBe: (expected: any) => {
      const pass = received === expected;
      if (pass === isNot) throw new Error(`Expected ${received} ${isNot ? "not " : ""}to be ${expected}`);
    },
    toEqual: (expected: any) => {
      const pass = deepEqual(received, expected);
      if (pass === isNot) throw new Error(`Expected ${JSON.stringify(received)} ${isNot ? "not " : ""}to equal ${JSON.stringify(expected)}`);
    },
    toContain: (item: any) => {
      const pass = Array.isArray(received) && received.includes(item);
      if (pass === isNot) throw new Error(`Expected ${JSON.stringify(received)} ${isNot ? "not " : ""}to contain ${JSON.stringify(item)}`);
    },
    toBeDefined: () => {
      const pass = received !== undefined;
      if (pass === isNot) throw new Error(`Expected ${received} ${isNot ? "not " : ""}to be defined`);
    },
    toHaveBeenCalled: () => {
      if (!received || !received.mock) throw new Error("Received value is not a mock function");
      const pass = received.mock.calls.length > 0;
      if (pass === isNot) throw new Error(`Expected mock ${isNot ? "not " : ""}to have been called`);
    },
    toHaveBeenCalledTimes: (n: number) => {
      if (!received || !received.mock) throw new Error("Received value is not a mock function");
      const pass = received.mock.calls.length === n;
      // @ts-ignore
      if (pass === isNot) throw new Error(`Expected mock ${isNot ? "not " : ""}to have been called ${n} times, but was called ${received.mock.calls.length} times`);
    },
    not: undefined as any // Placeholder
  });

  const base = matchers(false);
  // @ts-ignore
  base.not = matchers(true);
  
  // @ts-ignore
  base.rejects = {
    toBe: async (expected: any) => {
      try {
        await received;
        throw new Error("Expected promise to reject, but it resolved");
      } catch (e) {
        if (e !== expected) throw new Error(`Expected promise to reject with ${expected}, but rejected with ${e}`);
      }
    },
    toEqual: async (expected: any) => {
       try {
        await received;
        throw new Error("Expected promise to reject, but it resolved");
      } catch (e) {
        if (!deepEqual(e, expected)) throw new Error(`Expected promise to reject with ${JSON.stringify(expected)}, but rejected with ${JSON.stringify(e)}`);
      } 
    }
  };
  
  // @ts-ignore
  base.resolves = {
      toBe: async (expected: any) => {
          const res = await received;
          if (res !== expected) throw new Error(`Expected promise to resolve to ${expected}, but got ${res}`);
      },
      toEqual: async (expected: any) => {
          const res = await received;
          if (!deepEqual(res, expected)) throw new Error(`Expected promise to resolve to ${JSON.stringify(expected)}, but got ${JSON.stringify(res)}`);
      }
  }

  return base;
};

// Expose simply as a quick way to use in REPL if needed
export const mocks = { describe, test, expect, jest };
