import { memoize } from "key-index"

type ResolveFn<T> = (value?: T | PromiseLike<T>) => void;
type RejectFn = (reason?: any) => void;

interface Handler<T, R> {
  onFulfilled?: ((value: T) => R | PromiseLike<R>) | null;
  onRejected?: ((reason: any) => R | PromiseLike<R>) | null;
  resolve: ResolveFn<R>;
  reject: RejectFn;
}

export class SyncPromise<T = unknown> implements PromiseLike<T> {
  private state: "pending" | "fulfilled" | "rejected" = "pending";
  private value: any; // Stores the result or the error
  private handlers: Handler<T, any>[] = [];

  constructor(executor: (resolve: ResolveFn<T>, reject: RejectFn) => void) {
    try {
      executor(this._resolve.bind(this), this._reject.bind(this));
    } catch (err) {
      this._reject(err);
    }
  }

  // Internal resolve
  private _resolve(value?: T | PromiseLike<T>) {
    if (this.state !== "pending") return;

    // Handle "Thenables" (Promises or objects with a .then method)
    if (value && (typeof value === "object" || typeof value === "function")) {
      let then: any;
      try {
        then = (value as any).then;
      } catch (err) {
        this._reject(err);
        return;
      }

      if (typeof then === "function") {
        // If it's a promise, wait for it to settle
        try {
            then.call(
                value, 
                this._resolve.bind(this), 
                this._reject.bind(this)
            );
        } catch (error) {
            this._reject(error);
        }
        return;
      }
    }

    this.state = "fulfilled";
    this.value = value;
    this._executeHandlers();
  }

  // Internal reject
  private _reject(reason?: any) {
    if (this.state !== "pending") return;
    this.state = "rejected";
    this.value = reason;
    this._executeHandlers();
  }

  // Process all waiting dependent promises
  private _executeHandlers() {
    if (this.state === "pending") return;

    this.handlers.forEach((handler) => {
      const { onFulfilled, onRejected, resolve, reject } = handler;

      try {
        if (this.state === "fulfilled") {
          if (typeof onFulfilled === "function") {
            // Transform the value
            resolve(onFulfilled(this.value));
          } else {
            // Pass through the value
            resolve(this.value);
          }
        } else if (this.state === "rejected") {
          if (typeof onRejected === "function") {
            // Handle the error and recover
            resolve(onRejected(this.value));
          } else {
            // Pass through the error
            reject(this.value);
          }
        }
      } catch (err) {
        // If the handler throws, reject the dependent promise
        reject(err);
      }
    });

    // Clear handlers as they have been executed
    this.handlers = [];
  }

  public then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): SyncPromise<TResult1 | TResult2> {
    return new SyncPromise<TResult1 | TResult2>((resolve, reject) => {
      this.handlers.push({
        onFulfilled: onfulfilled,
        onRejected: onrejected,
        resolve,
        reject,
      });
      // Try to execute immediately if already settled
      this._executeHandlers();
    });
  }

  public catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): SyncPromise<T | TResult> {
    return this.then(null, onrejected);
  }

  public finally(onfinally?: (() => void) | null): SyncPromise<T> {
    return this.then(
      (value) => {
        if (onfinally) {
            try { onfinally(); } catch(e) { throw e; }
        }
        return value;
      },
      (reason) => {
        if (onfinally) {
            try { onfinally(); } catch(e) { throw e; }
        }
        throw reason;
      }
    ) as SyncPromise<T>;
  }

  // --- Static Methods ---

  public static resolve<T>(value?: T | PromiseLike<T>): SyncPromise<T> {
    return new SyncPromise<T>((res) => res(value));
  }

  public static reject(reason?: any): SyncPromise<never> {
    return new SyncPromise<never>((_, rej) => rej(reason));
  }

  public static all<T>(promises: (T | PromiseLike<T>)[]): SyncPromise<T[]> {
    return new SyncPromise((resolve, reject) => {
      // FIX: Handle empty array immediately
      if (promises.length === 0) {
        resolve([]);
        return;
      }

      const results = new Array(promises.length);
      let completedCount = 0;

      promises.forEach((val, index) => {
        // Normalize everything to a SyncPromise
        SyncPromise.resolve(val).then(
          (result) => {
            // FIX: Assign by index to preserve order
            results[index] = result;
            completedCount++;
            if (completedCount === promises.length) {
              resolve(results);
            }
          },
          (err) => {
            // FIX: Fail fast
            reject(err);
          }
        );
      });
    });
  }

  public static allSettled<T>(
    promises: (T | PromiseLike<T>)[]
  ): SyncPromise<{ status: "fulfilled" | "rejected"; value?: T; reason?: any }[]> {
    return new SyncPromise((resolve) => {
        if (promises.length === 0) {
            resolve([]);
            return;
        }

      const results = new Array(promises.length);
      let completedCount = 0;

      const checkDone = () => {
        completedCount++;
        if (completedCount === promises.length) {
          resolve(results);
        }
      };

      promises.forEach((val, index) => {
        SyncPromise.resolve(val).then(
          (value) => {
            results[index] = { status: "fulfilled", value };
            checkDone();
          },
          (reason) => {
            results[index] = { status: "rejected", reason };
            checkDone();
          }
        );
      });
    });
  }

  public static race<T>(promises: (T | PromiseLike<T>)[]): SyncPromise<T> {
    return new SyncPromise((resolve, reject) => {
      // Note: race([]) never resolves, intentionally matching spec
      promises.forEach((val) => {
        SyncPromise.resolve(val).then(resolve, reject);
      });
    });
  }
}



// type PromInterface<T> = {
//   then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): SettledPromise<TResult1 | TResult2>;
//   catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): SettledPromise<T | TResult>;
//   finally(onfinally?: (() => void) | undefined | null): SettledPromise<T>;
// }



type SettledPromProps<T> = {settled: boolean, onSettled: Promise<void>, res: (t: T) => void, rej: (err: any) => void}
type ResablePromProps<T> = {res: (t: T) => void, rej: (err: any) => void}
type CancelAblePromProps<T, C, CT> = {cancel: (reason: C) => CT, cancelled: boolean, onCancel: Promise<{reason: C, cancelResult: CT}>}


const {SettledPromise: _SettledPromise, ResablePromise: _ResablePromise, CancelAblePromise: _CancelAblePromise} = mkExt(Promise)

interface SettledPromiseConstructor {
  new<T = void>(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void): SettledPromise<T>;
  prototype: SettledPromise;
}

export const SettledPromise: SettledPromiseConstructor = _SettledPromise as any;
export type SettledPromise<T = unknown> = SettledPromProps<T> & {
  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): SettledPromise<TResult1 | TResult2>;
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): SettledPromise<T | TResult>;
  finally(onfinally?: (() => void) | undefined | null): SettledPromise<T>;
} & Promise<T>
export type ResablePromise<T = unknown> = SettledPromProps<T> & ResablePromProps<T> & {
  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): ResablePromise<TResult1 | TResult2>;
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): ResablePromise<T | TResult>;
  finally(onfinally?: (() => void) | undefined | null): ResablePromise<T>;
} & Promise<T>

interface ResablePromiseConstructor {
  new<T = void>(executor?: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void): ResablePromise<T>;
  prototype: ResablePromise;
}

export const ResablePromise: ResablePromiseConstructor = _ResablePromise as any;

export type CancelFunc<C, CT> = (reason: C) => CT

export type CancelAblePromise<T = unknown, C = void, CT = C> = SettledPromProps<T> & ResablePromProps<T> & CancelAblePromProps<T, C, CT> & {
  then<TResult1 = T, TResult2 = never, newC extends C = C, newCT extends CT = CT>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null, onCancelForward?: true): CancelAblePromise<TResult1 | TResult2, newC, newCT>;
  then<TResult1 = T, TResult2 = never, newC = void, newCT = newC>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null, onCancel?: (reason: newC) => newCT): CancelAblePromise<TResult1 | TResult2, newC, newCT>;
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): CancelAblePromise<T | TResult>;
  finally(onfinally?: (() => void) | undefined | null): CancelAblePromise<T>;
} & Promise<T>

interface CancelAblePromiseConstructor {
  new<T = void, C = void, CT = C>(executor?: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => (CancelFunc<C, CT> | any), cancel?: (reason: C) => void): CancelAblePromise<T, C, CT>;
  prototype: CancelAblePromise;
}

export const CancelAblePromise: CancelAblePromiseConstructor = _CancelAblePromise as any;

const {ResablePromise: _ResableSyncPromise, CancelAblePromise: _CancelAbleSyncPromise, SettledPromise: _SettledSyncPromise} = mkExt(SyncPromise as any)
export type SettledSyncPromise<T = unknown> = SettledPromProps<T> & {
  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): SettledSyncPromise<TResult1 | TResult2>;
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): SettledSyncPromise<T | TResult>;
  finally(onfinally?: (() => void) | undefined | null): SettledSyncPromise<T>;
} & SyncPromise<T>
interface SettledSyncPromiseConstructor {
  new<T = void>(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void): SettledSyncPromise<T>
  prototype: SettledSyncPromise;
}

export const SettledSyncPromise: SettledSyncPromiseConstructor = _SettledSyncPromise as any;

export type ResableSyncPromise<T = unknown> = SettledPromProps<T> & ResablePromProps<T> & {
  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): ResableSyncPromise<TResult1 | TResult2>;
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): ResableSyncPromise<T | TResult>;
  finally(onfinally?: (() => void) | undefined | null): ResableSyncPromise<T>;
} & SyncPromise<T>
interface ResableSyncPromiseConstructor {
  new<T = void>(executor?: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void): ResableSyncPromise<T>
  prototype: ResableSyncPromise;
}

export const ResableSyncPromise: ResableSyncPromiseConstructor = _ResableSyncPromise as any;


export type CancelAbleSyncPromise<T = unknown, C = void, CT = C> = SettledPromProps<T> & ResablePromProps<T> & CancelAblePromProps<T, C, CT> & {
  then<TResult1 = T, TResult2 = never, newC extends C = C, newCT extends CT = CT>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null, onCancelForward?: true): CancelAblePromise<TResult1 | TResult2, newC, newCT>;
  then<TResult1 = T, TResult2 = never, newC = void, newCT = newC>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null, onCancel?: (reason: newC) => newCT): CancelAbleSyncPromise<TResult1 | TResult2, newC, newCT>;
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): CancelAbleSyncPromise<T | TResult>;
  finally(onfinally?: (() => void) | undefined | null): CancelAbleSyncPromise<T>;
} & SyncPromise<T>

interface CancelAbleSyncPromiseConstructor {
  new<T = unknown, C = void, CT = C>(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => (CancelFunc<C, CT> | any), cancel?: (reason: C) => void): CancelAbleSyncPromise<T, C, CT>
  prototype: CancelAbleSyncPromise;
}

export const CancelAbleSyncPromise: CancelAbleSyncPromiseConstructor = _CancelAbleSyncPromise as any;



function isPromiseDuckType(p: any): p is PromiseLike<unknown> {
  return p && (typeof p === 'object' || typeof p === 'function') && typeof p.then === 'function';
}

function isCancelAblePromiseDuckType(p: any): p is CancelAblePromise<any, any, any> {
  return isPromiseDuckType(p) && typeof (p as any).cancel === 'function'
}

const cancelableAwaitWarned = new WeakSet<object>()
function shouldWarnCancelableAwait(onfulfilled: any, onrejected: any, onCancel: any) {
  if (onCancel !== undefined) return false
  if (typeof onfulfilled !== "function" || typeof onrejected !== "function") return false
  const isNative = (fn: Function) => Function.prototype.toString.call(fn).includes("[native code]")
  const nameLike = (fn: Function, name: string) => fn.name === name || fn.name === ""
  return isNative(onfulfilled) && isNative(onrejected) && (nameLike(onfulfilled, "resolve") || nameLike(onrejected, "reject"))
}
function warnIfCancelableAwait(prom: object, onfulfilled: any, onrejected: any, onCancel: any) {
  if (cancelableAwaitWarned.has(prom)) return
  if (!shouldWarnCancelableAwait(onfulfilled, onrejected, onCancel)) return
  cancelableAwaitWarned.add(prom)
  // eslint-disable-next-line no-console
  console.warn(
    "CancelAblePromise was wrapped by a native Promise (likely via async/await), which drops cancellation. " +
      "Return the CancelAblePromise directly or avoid async/await when you need cancellation."
  )
}


function mkExt(Prom: typeof Promise) {
  let finallyInit = false
  class SettledPromise<T = void> extends Prom<T> {
    public settled: boolean = false

    public res: (t: T | PromiseLike<T>) => void
    public rej: (err: any) => void
  
    constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void) {


      let res: any
      let rej: any
      
      super((r, rj) => {
        res = (a) => {
          this.settled = true
          r(a)
        }
        rej = (a) => {
          this.settled = true
          rj(a)
        }
  
        if (executor) executor(res, rej)
      })
  
      this.res = (arg) => {
        res(arg)
        return Prom.all(this.thenChildProms)
      }
      this.rej = rej
    }

    get onSettled(): Promise<any> {
      return new Promise((res) => {
        this.finally().then(res, res)
      })
    }
    private thenChildProms = []
    private catchChildProms = []
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2> {
      const r = super.then(onfulfilled, onrejected) as any
      if (this.settled) return r
      this.thenChildProms.push(r)
      return r
    }
  }
  
  
  
  class ResablePromise<T = void> extends SettledPromise<T> {
    public readonly res: (t: T | PromiseLike<T>) => void
    public readonly rej: (err: any) => void

    constructor(a) {
      super(a)
      // todo: deprecate
    }
  }
  type CancelFunc<C, CT> = (reason: C) => CT
  
  class CancelAblePromise<T = unknown, C = void, CT = C> extends SettledPromise<T> {
    public cancelled: boolean = false
    public cancel: (reason: C) => CT
    public onCancel: ResablePromise<{reason: C, cancelResult: CT | undefined}> = new ResablePromise(() => {})
    public readonly cancelReason: C
    private cancelFunc: CancelFunc<C, CT>

    private nestedCancels: Function[] = []

    constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => (void | CancelFunc<C, CT>))
    constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void, cancelFunc?: CancelFunc<C, CT>)
    constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => (void | CancelFunc<C, CT>), cancelFunc?: CancelFunc<C, CT>) {
      let isCancelled = false
      
      super((res, rej) => {
        // Wrap the callbacks to check cancellation status
        const wrappedRes = (value: T | PromiseLike<T>) => {
          // If value is a thenable (promise), wait for it to resolve and then check cancellation. Duck typing here, see promise spec
          if (isPromiseDuckType(value)) {
            (value as PromiseLike<T>).then(
              (resolved) => {
                if (!isCancelled) res(resolved as any)
              },
              (rejected) => {
                if (!isCancelled) rej(rejected)
              }
            )
          } else {
            // Synchronous value - check immediately
            if (!isCancelled) res(value)
          }
        }
        const wrappedRej = (reason: any) => {
          if (!isCancelled) rej(reason)
        }
        
        const r = executor(wrappedRes, wrappedRej)
        if (cancelFunc === undefined && r instanceof Function) cancelFunc = r as any
      })

      this.cancelFunc = cancelFunc

      
      this.cancel = memoize((reason: C) => {
        if (this.settled) return
        this.cancelled = isCancelled = true
        ;(this as any).cancelReason = reason
        this.res = () => {}
        this.rej = () => {}
        const cancelResult = this.cancelFunc !== undefined ? this.cancelFunc(reason) : undefined
        this.onCancel.res({reason, cancelResult})
        return cancelResult
      }, ([reason]: [C]) => {
        for (const f of this.nestedCancels) f(reason)
      })
    }

    // only add something here if you know what you are doing. By default this promise handles downwards cancellation flow (so 
    // everything chained to this promise will be cancelled with it). NOT upwards (so cancelling a child promise will NOT cancel 
    // this parent promise).
    protected addNestedCancel(f: Function) {
      this.nestedCancels.push(f)
    }

  
  
    then<TResult1 = T, TResult2 = never, newC extends C = C, newCT extends CT = CT>(
      onfulfilled: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined,
      onCancel?: true
    ): CancelAblePromise<TResult1 | TResult2, newC, newC>
    then<TResult1 = T, TResult2 = never, newC = void, newCT = newC>(
      onfulfilled: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined,
      onCancel?: ((reason: newC) => newCT)
    ): CancelAblePromise<TResult1 | TResult2, newC, newC>
    then<TResult1 = T, TResult2 = never, newC = void, newCT = newC>(
      onfulfilled: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined,
      onCancel?: ((reason: newC) => newCT) | true
    ): CancelAblePromise<TResult1 | TResult2, newC, newC> {
      warnIfCancelableAwait(this, onfulfilled, onrejected, onCancel)
      const r = super.then((a) => {
        const ret = onfulfilled(a)
        if (isCancelAblePromiseDuckType(ret)) this.nestedCancels.push(ret.cancel)
        return ret
      }, onrejected ? (reason) => {
        const ret = onrejected(reason)
        if (isCancelAblePromiseDuckType(ret)) this.nestedCancels.push(ret.cancel)
        return ret
      } : undefined) as any as CancelAblePromise<TResult1 | TResult2, newC, newC>
      r.cancelFunc = onCancel === true ? (reason) => {
        this.nestedCancels.splice(this.nestedCancels.indexOf(r.cancel), 1)
        this.cancel(reason as any)
      } : onCancel as any
      if (this.nestedCancels) this.nestedCancels.push(r.cancel)
      return r
    }
    catch<TResult = never>(
      onrejected: ((reason: any) => TResult | PromiseLike<TResult>) | null | undefined
    ): CancelAblePromise<T | TResult> {
      const r = super.catch(onrejected) as any as CancelAblePromise<T | TResult>
      this.nestedCancels.push(r.cancel)
      return r
    }
    static all(proms: CancelAblePromise[], ifOneChildCancels: "ignore" | "cancelThis" | "cancelAll" = "ignore") {
      return allOrRace("all", proms, ifOneChildCancels)
    }
    static race(proms: CancelAblePromise[], ifOneChildCancels: "ignore" | "cancelThis" | "cancelAll" = "ignore") {
      return allOrRace("race", proms, ifOneChildCancels)
    }
  }
  
  function allOrRace<T, C, CT>(allOrRace: "all" | "race", proms: CancelAblePromise<T, C, CT>[], ifOneChildCancels: "ignore" | "cancelThis" | "cancelAll" = "ignore") {
    const newP = new CancelAblePromise<T[], C, {reason: C, cancelResult: CT}[]>((res, rej) => {
      Promise[allOrRace as "all"](proms).then(res, rej)
    }, (reason) => {
      if (cancOriginIndex !== undefined) {
        if (ifOneChildCancels === "cancelAll" || ifOneChildCancels === "ignore") {
          return proms.map((p) => {
            return {reason, cancelResult: p.cancel(reason)}
          })
        }
        else /*if (ifOneChildCancels === "cancelThis")*/ {
          return [{reason, cancelResult: proms[cancOriginIndex].cancel(reason)}]
        }
      }
      else proms.map((p) => ({reason, cancelResult: p.cancel(reason)}))
      
    })

    let cancOriginIndex: number
  
    if (ifOneChildCancels === "ignore") Promise.all(proms.map((p) => p.onCancel)).then((r) => {
      cancOriginIndex = -1
      newP.cancel(r[0].reason)
    })
    else if (ifOneChildCancels === "cancelThis" || ifOneChildCancels === "cancelAll") Promise.race(proms.map((p, i) => p.onCancel.then(({reason}) => ({reason, i})))).then(({reason, i}) => {
      cancOriginIndex = i
      newP.cancel(reason)
    })
    return newP as CancelAblePromise<T[], C, {reason: C, cancelResult: CT}[]>
  }

  return { CancelAblePromise, SettledPromise, ResablePromise }
}

