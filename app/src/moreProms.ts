import { memoize } from "key-index"


type P<Args extends unknown[], Ret> = {
  then<TResult1 = Ret, TResult2 = never>(onfulfilled?: ((value: Ret) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): P<Args, TResult1 | TResult2>
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): P<Args, Ret | TResult>;
  abort(reason?: any): void
} & ((...a: Args) => (CancelAblePromise<Ret> | Promise<Ret> | undefined))

export function latestLatent<Args extends unknown[], Ret>(cb: (...args: Args) => (CancelAblePromise<Ret> | Promise<Ret> | undefined)): P<Args, Ret> {
  let prom = new CancelAblePromise<Ret>(() => {}, () => {})
  function request(...args: Args) {
    prom.cancel()
    const r = cb(...args) 
    prom = r instanceof CancelAblePromise ? r as CancelAblePromise<Ret> : new CancelAblePromise<Ret>((res, rej) => { (r as Promise<any>).then(res, rej) }, () => {
      
    })
    lastPromHasUpdated(futures, prom)
    // console.log("callingVesselProm", callingPromUID)
    return callingPromUID === undefined ? prom : uidToProm.get(callingPromUID)
  }

  (request as any).abort = (reason?: any) => {
    prom.cancel(reason)
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
      ;(nxtVessel as any).abort = (reason?: any) => {
        (request as any).abort(reason)
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




export function execQueue(defaultOptions: {
  skipAble?: boolean | (() => void),
  cancelVal?: any,
  continueOnError?: boolean
} = {
  skipAble: false,
  cancelVal: "cancelled by execQueue",
  continueOnError: true
}) {
  type AnyPromOrCancProm = Promise<any> | CancelAblePromise<any, string, string | void | undefined | null | Promise<any>>
  const queue = [] as {skipAble: boolean | (() => void), p: CancelAblePromise<any>, f: () => AnyPromOrCancProm, cancelVal: any}[]
  let curFP: AnyPromOrCancProm
  let curCancelVal: any
  let running = false
  let wantToCancelUntil: typeof queue[number] | undefined
  let curOb: any
  let cancelDataStore: {cancelResult: any} | undefined

  async function makeSureQueueIsStarted(options: typeof defaultOptions) {
    if (running) return
    running = true


    while(queue.length !== 0) {
      const ob = curOb = queue.shift()!
      const { p, f, skipAble, cancelVal } = ob
      if (wantToCancelUntil === ob) wantToCancelUntil = undefined
      const wantToCancelThis = wantToCancelUntil !== undefined


      if (wantToCancelThis && skipAble) {
        if (skipAble instanceof Function) skipAble()
      }
      else {
        const prom = curFP = f()
        curCancelVal = cancelVal

        const localPromsToContinue = [] as AnyPromOrCancProm[]
        if ("cancel" in prom) {
          localPromsToContinue.push(prom.onCancel.then(({reason, cancelResult}) => cancelResult))
          prom.onCancel.then((r) => {
            cancelDataStore = r
            p.cancel(r.reason as any)
            cancelDataStore = undefined
          })
          if (wantToCancelThis) prom.cancel(cancelVal)
        }

        p.res(prom)


        const promSettled = !options.continueOnError ? prom  : "onSettled" in prom ? prom.onSettled : prom.finally()

        localPromsToContinue.push(promSettled)

        await Promise.race(localPromsToContinue)
      }
      

      
    }


    running = false
  }

  

  return <T, FR extends Promise<T> | CancelAblePromise<T, string, string | void | undefined | null | Promise<any>>>(f: () => FR, options: typeof defaultOptions | boolean | (() => void) = defaultOptions, cancelPrevIfPossible = false): FR  => {
    options = typeof options !== "object" ? {...defaultOptions, ...{skipAble: options}} : {...defaultOptions, ...options}
    const p = new CancelAblePromise<any, any, any>(() => {}, (cVal) => {
      // on cancel

      if (cancelDataStore !== undefined) return cancelDataStore.cancelResult
      // if ("cancel" in curFP):  we can assume this as the types restrict it.
      if (curOb === ob) return (curFP as CancelAblePromise<unknown, unknown>).cancel(cVal)
      // we can assume that it is still in the list, as it has to be non-resolved to be cancelled (as ensured by CancelAblePromise)
      queue.splice(queue.indexOf(ob), 1)
    })
    const ob = { f, p, skipAble: options.skipAble, cancelVal: options.cancelVal }
    queue.push(ob)
    if (cancelPrevIfPossible && running) {
      // todo is this max even needed? Is ob not always the latests here?...
      wantToCancelUntil = wantToCancelUntil === undefined ? ob : queue[Math.max(queue.indexOf(wantToCancelUntil), queue.indexOf(ob))]
      if ("cancel" in curFP) curFP.cancel(curCancelVal)
    }
      
    makeSureQueueIsStarted(options)
    return p as any as FR
  }
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
export const SettledPromise = _SettledPromise as any as PromiseConstructor & { new<T = void>(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void): SettledPromise<T> }
export type SettledPromise<T = unknown> = SettledPromProps<T> & {
  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): SettledPromise<TResult1 | TResult2>;
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): SettledPromise<T | TResult>;
  finally(onfinally?: (() => void) | undefined | null): SettledPromise<T>;
} & Promise<T>
export const ResablePromise = _ResablePromise as any as PromiseConstructor & { new<T = void>(executor?: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void): ResablePromise<T> }
export type ResablePromise<T = unknown> = SettledPromProps<T> & ResablePromProps<T> & {
  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): ResablePromise<TResult1 | TResult2>;
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): ResablePromise<T | TResult>;
  finally(onfinally?: (() => void) | undefined | null): ResablePromise<T>;
} & Promise<T>

export type CancelFunc<C, CT> = (reason: C) => CT

export const CancelAblePromise = _CancelAblePromise as any as PromiseConstructor & { new<T = void, C = void, CT = C>(executor?: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => (CancelFunc<C, CT> | void), cancel?: (reason: C) => void): CancelAblePromise<T, C, CT> }
export type CancelAblePromise<T = unknown, C = void, CT = C> = SettledPromProps<T> & ResablePromProps<T> & CancelAblePromProps<T, C, CT> & {
  then<TResult1 = T, TResult2 = never, newC extends C = C, newCT extends CT = CT>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null, onCancelForward?: true): CancelAblePromise<TResult1 | TResult2, newC, newCT>;
  then<TResult1 = T, TResult2 = never, newC = void, newCT = newC>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null, onCancel?: (reason: newC) => newCT): CancelAblePromise<TResult1 | TResult2, newC, newCT>;
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): CancelAblePromise<T | TResult>;
  finally(onfinally?: (() => void) | undefined | null): CancelAblePromise<T>;
} & Promise<T>

const {ResablePromise: _ResableSyncPromise, CancelAblePromise: _CancelAbleSyncPromise, SettledPromise: _SettledSyncPromise} = mkExt(SyncPromise as any)
export const SettledSyncPromise = _SettledSyncPromise as any as typeof SyncPromise & { new<T = void>(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void): SettledSyncPromise<T> }
export type SettledSyncPromise<T = unknown> = SettledPromProps<T> & {
  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): SettledSyncPromise<TResult1 | TResult2>;
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): SettledSyncPromise<T | TResult>;
  finally(onfinally?: (() => void) | undefined | null): SettledSyncPromise<T>;
} & SyncPromise<T>

export const ResableSyncPromise = _ResableSyncPromise as any as typeof SyncPromise & { new<T = void>(executor?: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void): ResableSyncPromise<T> }
export type ResableSyncPromise<T = unknown> = SettledPromProps<T> & ResablePromProps<T> & {
  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): ResableSyncPromise<TResult1 | TResult2>;
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): ResableSyncPromise<T | TResult>;
  finally(onfinally?: (() => void) | undefined | null): ResableSyncPromise<T>;
} & SyncPromise<T>
export const CancelAbleSyncPromise = _CancelAbleSyncPromise as any as typeof SyncPromise & { new<T = unknown, C = void, CT = C>(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void, cancel?: (reason: C) => void): CancelAbleSyncPromise<T, C, CT> }
export type CancelAbleSyncPromise<T = unknown, C = void, CT = C> = SettledPromProps<T> & ResablePromProps<T> & CancelAblePromProps<T, C, CT> & {
  then<TResult1 = T, TResult2 = never, newC extends C = C, newCT extends CT = CT>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null, onCancelForward?: true): CancelAblePromise<TResult1 | TResult2, newC, newCT>;
  then<TResult1 = T, TResult2 = never, newC = void, newCT = newC>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null, onCancel?: (reason: newC) => newCT): CancelAbleSyncPromise<TResult1 | TResult2, newC, newCT>;
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): CancelAbleSyncPromise<T | TResult>;
  finally(onfinally?: (() => void) | undefined | null): CancelAbleSyncPromise<T>;
} & SyncPromise<T>




function mkExt(Prom: typeof Promise) {
  let finallyInit = false
  class SettledPromise<T = void> extends Prom<T> {
    public settled: boolean = false
    

    public res: (t: T | PromiseLike<T>) => void
    public rej: (err: any) => void
  
    constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void) {


      let res: any
      let rej: any
      
      super(!finallyInit ? (r, rj) => {
        res = r
        rej = rj
  
        if (executor) executor(r, rj)
      } : executor)
  
      this.res = res
      this.rej = rej
    }

    get onSettled(): Promise<any> {
      return this.finally()
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
          if (value != null && typeof (value as any).then === 'function') {
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
      }, (reason) => {
        for (const f of this.nestedCancels) f(reason)
      })
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
      const r = super.then(onfulfilled, onrejected) as any as CancelAblePromise<TResult1 | TResult2, newC, newC>
      r.cancelFunc = onCancel === true ? (reason) => {
        this.nestedCancels.splice(this.nestedCancels.indexOf(r.cancel), 1)
        this.cancel(reason as any)
      } : onCancel as any
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

