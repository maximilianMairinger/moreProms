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


export class SettledPromise<T = unknown> extends Promise<T> {
  public settled: boolean = false
  public onSettled: Promise<void>

  constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void) {
    super((res, rej) => {
      executor(async (a) => {
        await a
        this.settled = true
        r()
        res(a)
      }, async (a) => {
        await a
        this.settled = true
        r()
        rej(a)
      })
    })

    let r: any
    this.onSettled = new Promise((res) => {
      r = res
    }) as any

  }
}



export class ResablePromise<T = unknown> extends SettledPromise<T> {
  
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


export class CancelAblePromise<T = unknown, C = unknown> extends SettledPromise<T> {
  public cancelled: boolean = false
  public cancel: () => void
  private nestedCancels: Function[] = []
  constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void, cancel?: () => C) {
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
    this.cancel = memoize(() => {
      for (const f of this.nestedCancels) f()
      if (this.settled) return
      this.cancelled = true
      if (cancel !== undefined) return cancel()
    })
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined
  ): CancelAblePromise<TResult1 | TResult2> {
    const r = super.then(onfulfilled, onrejected) as CancelAblePromise<TResult1 | TResult2>
    this.nestedCancels.push(r.cancel)
    return r
  }
  catch<TResult = never>(
    onrejected: ((reason: any) => TResult | PromiseLike<TResult>) | null | undefined
  ): CancelAblePromise<T | TResult> {
    const r = super.catch(onrejected) as CancelAblePromise<T | TResult>
    this.nestedCancels.push(r.cancel)
    return r
  }

}

