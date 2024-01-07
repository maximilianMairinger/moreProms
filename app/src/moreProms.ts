import { memoize } from "key-index"


type P<Args extends unknown[], Ret> = {
  then<TResult1 = Ret, TResult2 = never>(onfulfilled?: ((value: Ret) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): P<Args, TResult1 | TResult2>
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): P<Args, Ret | TResult>;
} & ((...a: Args) => (CancelAblePromise<Ret> | Promise<Ret> | undefined))

export function latestLatent<Args extends unknown[], Ret>(cb: (...args: Args) => (CancelAblePromise<Ret> | Promise<Ret> | undefined)): P<Args, Ret> {
  let prom = new CancelAblePromise<Ret>(() => {}, () => {})
  
  function request(...args: Args) {
    prom.cancel()
    const r = cb(...args) 
    prom = r instanceof CancelAblePromise ? r : new CancelAblePromise<Ret>((res, rej) => { r.then(res, rej) }, () => {})
    lastPromHasUpdated(futures, prom)
    // console.log("callingVesselProm", callingPromUID)
    return callingPromUID === undefined ? prom : uidToProm.get(callingPromUID)
  }

  function lastPromHasUpdated(futures: Future, prom: any) {
    for (const {func, args, deeper, uid} of futures) {
      const nxtProm = prom[func](...args) as Promise<any>
      uidToProm.set(uid, nxtProm)
      lastPromHasUpdated(deeper, nxtProm)
    }
  }

  type Future = {func: string, args: any[], deeper: Future, uid: any}[]

  const uidToProm = new Map<any, Promise<any>>()

  let futures = [] as Future
  let callingPromUID: any = undefined

  function propagateFuture(vessel: any, future: Future, func: "then" | "catch", lastProm: Promise<any>) {
    vessel[func] = (...args: any[]) => {
      const deeper = []
      const prom = (lastProm[func] as any)(...args) as Promise<any>
      
      const nxtVessel = (...a: any[]) => {
        callingPromUID = nxtVessel
        const r = (request as any)(...a)
        callingPromUID = undefined
        return r
      }
      uidToProm.set(nxtVessel, prom)
      future.push({func, args, deeper, uid: nxtVessel})

      propagateFuture(nxtVessel, deeper, "then", prom)
      propagateFuture(nxtVessel, deeper, "catch", prom)
      return nxtVessel
    }
    
  }
  
  propagateFuture(request, futures, "then", prom)
  propagateFuture(request, futures, "catch", prom)


  

  return request as P<Args, Ret>
}




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
      
      return this.constructor((res, rej) => {
        if (onCatch) this.catchListener.push({res, f: onCatch})
        this.thenListener.push({res, rej, f: to})
      })

    }
    else return this as any
  }
  catch<R = never>(to: ((err: any) => R | PromiseLike<R>) | null | undefined): PromiseLike<R | T> {
    if (!to) return this
    if (this.status === "pending") {
      return this.constructor((res) => {
        this.catchListener.push({res, f: to})
      })
    }
    return this
  }
  finally(to: (() => void) | undefined | null): SyncPromise<T> {
    if (!to) return this
    if (this.status === "pending") {
      return this.constructor((res) => {
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



export const {ResablePromise, CancelAblePromise, SettledPromise} = mkExt(Promise)
export type SettledPromise<T = void> = Promise<T> & {settled: boolean, onSettled: Promise<void>}
export type ResablePromise<T = void> = SettledPromise<T> & {res: (t: T) => void, rej: (err: any) => void}
export type CancelAblePromise<T = unknown, C = void> = SettledPromise<T> & {cancel: (reason: C) => void, cancelled: boolean, onCancel: ResablePromise<C>}

export const {ResablePromise: ResableSyncPromise, CancelAblePromise: CancelAbleSyncPromise, SettledPromise: SettledSyncPromise} = mkExt(SyncPromise as any)
export type SettledSyncPromise<T = void> = SyncPromise<T> & {settled: boolean, onSettled: Promise<void>}
export type ResableSyncPromise<T = void> = SettledSyncPromise<T> & {res: (t: T) => void, rej: (err: any) => void}
export type CancelAbleSyncPromise<T = unknown, C = void> = SettledSyncPromise<T> & {cancel: (reason: C) => void, cancelled: boolean, onCancel: ResableSyncPromise<C>}



function mkExt(Prom: typeof Promise) {
  class SettledPromise<T = void> extends Prom<T> {
    public settled: boolean = false
    public onSettled: Promise<void>
  
    constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void) {
      super((res, rej) => {
        executor(async (a) => {
          await a
          this.settled = true
          r()
          res(a as SyncPromise<T>)
        }, async (a) => {
          await a
          this.settled = true
          r()
          rej(a)
        })
      })
  
      let r: any
      this.onSettled = new Prom((res) => {
        r = res
      }) as any
  
    }
  }
  
  
  
  class ResablePromise<T = void> extends SettledPromise<T> {
    
    public readonly res: (t: T) => void
    public readonly rej: (err: any) => void
    
    constructor(executor?: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void) {
      let res: any
      let rej: any
      super((r, rj) => {
        res = r
        rej = rj
  
        if (executor) executor(r, rj)
      })
  
      this.res = res
      this.rej = rej
    }
  }
  
  
  class CancelAblePromise<T = unknown, C = void> extends SettledPromise<T> {
    public cancelled: boolean = false
    public cancel: (reason: C) => void
    public onCancel: ResablePromise<C> = new ResablePromise(() => {})
    private nestedCancels: Function[] = []
    constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void, cancel?: (reason: C) => void) {
      super((res, rej) => {
        const r = async (a) => {
          await a
          if (this.cancelled) return
          res(a)
        }
        const rj = async (a) => {
          await a
          if (this.cancelled) return
          rej(a)
        }
        executor(r, rj)
      })
      this.cancel = memoize((reason: C) => {
        for (const f of this.nestedCancels) f()
        if (this.settled) return
        this.cancelled = true;
        (this.onCancel as ResablePromise<C>).res(reason)
        if (cancel !== undefined) cancel(reason)
      })
    }
  
  
    then<TResult1 = T, TResult2 = never>(
      onfulfilled: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined
    ): CancelAblePromise<TResult1 | TResult2> {
      const r = super.then(onfulfilled, onrejected) as any as CancelAblePromise<TResult1 | TResult2>
      this.nestedCancels.push(r.cancel)
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
  
  function allOrRace<T, C>(allOrRace: "all" | "race", proms: CancelAblePromise<T, C>[], ifOneChildCancels: "ignore" | "cancelThis" | "cancelAll" = "ignore") {
    const newP = new CancelAblePromise<T[], C>((res, rej) => {
      Promise[allOrRace as "all"](proms).then(res, rej)
    }, (reason) => {
      return proms.map((p) => p.cancel(reason))
    })
  
    if (ifOneChildCancels === "ignore") Promise.all(proms.map((p) => p.onCancel)).then((r) => {newP.cancel(r[0])})
    else if (ifOneChildCancels === "cancelThis") Promise.race(proms.map((p) => p.onCancel)).then(newP.cancel)
    else if (ifOneChildCancels === "cancelAll") Promise.race(proms.map((p) => p.onCancel)).then((e) => {
      for (const prom of proms) prom.cancel(e)
      newP.cancel(e)
    })
    return newP
  }

  return { CancelAblePromise, SettledPromise, ResablePromise }
}


