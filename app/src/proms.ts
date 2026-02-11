import { memoize } from "key-index"


export class SyncPromise<T = unknown> {
  private thenListener: {f: (res: T) => unknown, res: Function, rej: Function}[] = []
  private catchListener: {f: (res: T) => unknown, res: Function}[] = []

  private status = "pending" as "pending" | "resolved" | "rejected"
  private resVal: T



  private duringConstructor: boolean
  constructor(cb: (res: (res?: T | PromiseLike<T>) => void, rej: (reason: any) => void) => void) {
    this.duringConstructor = true
    cb(this._res.bind(this), this._rej.bind(this))
    this.duringConstructor = false
  }

  private _res(val: T | SyncPromise<T>) {
    if (this.status !== "pending") return
    if (val instanceof SyncPromise) {
      val.then(this._res.bind(this), this._rej.bind(this))
      return
    }
    for (const {f, res} of this.thenListener) {
      const resVal = f(val)
      res(resVal !== undefined ? resVal : val)
    }
    for (const {res} of this.catchListener) res(val)
    this.status = "resolved"
    this.resVal = val;
  }
  private _rej(val: any) {
    if (this.status !== "pending") return
    for (const {f, res} of this.catchListener) {
      const resVal = f(val)
      res(resVal !== undefined ? resVal : val)
    }
    for (const {rej} of this.thenListener) rej(val)
    if (this.duringConstructor && this.catchListener.length === 0) throw new Error("Unhandled promise rejection: " + val)
    this.status = "rejected"
  }

  // then<TResult1 = T, TResult2 = never>(
  //   onfulfilled: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
  //   onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined
  // )

  then<R = T, R2 = never>(to: ((res: T) => R | PromiseLike<R>) | null | undefined, onCatch?: ((err: any) => R2 | PromiseLike<R2>) | undefined | null): PromiseLike<R | R2> {
    
    if (to === undefined || to === null) return this as any
    if (this.status === "resolved") return SyncPromise.resolve(to(this.resVal))
    else if (this.status === "pending") {
      
      return new (this as any).constructor((res, rej) => {
        if (onCatch) this.catchListener.push({res, f: onCatch})
        this.thenListener.push({res, rej, f: to})
      })

    }
    else return this as any
  }
  catch<R = never>(to: ((err: any) => R | PromiseLike<R>) | null | undefined): PromiseLike<R | T> {
    if (!to) return this
    if (this.status === "pending") {
      return new (this as any).constructor((res) => {
        this.catchListener.push({res, f: to})
      })
    }
    return this
  }
  finally(to: (() => void) | undefined | null): SyncPromise<T> {
    if (!to) return this
    if (this.status === "pending") {
      return new (this as any).constructor((res) => {
        this.catchListener.push({res, f: to})
        this.thenListener.push({res, rej: res, f: to})
      })
    }
    return this
  }




  public static resolve<T>(res?: T | PromiseLike<T>) {
    return new SyncPromise<T>((r) => {r(res)})
  }
  public static reject(val) {
    return new SyncPromise((r, n) => {n(val)})
  }
  public static all(proms: SyncPromise[]) {
    return new SyncPromise((res, rej) => {
      const resArr = []
      for (const prom of proms) {
        prom.then((r) => {
          resArr.push(r)
          if (resArr.length === proms.length) res(resArr)
        }, rej)
      }
    })
  }
  public static race(proms: SyncPromise[]) {
    return new SyncPromise((res, rej) => {
      for (const prom of proms) {
        prom.then(res, rej)
      }
    })
  }
  public static allSettled(proms: SyncPromise[]) {
    return new SyncPromise((res, rej) => {
      const resArr = []
      for (const prom of proms) {
        prom.then((r) => {
          resArr.push({status: "resolved", value: r})
          if (resArr.length === proms.length) res(resArr)
        }, (e) => {
          resArr.push({status: "rejected", reason: e})
          if (resArr.length === proms.length) res(resArr)
        })
      }
    })
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



function isPromiseDuckType(p: any): p is PromiseLike<any> {
  return p != null && typeof p.then === 'function'
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
        return Promise.all(this.thenChildProms)
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

