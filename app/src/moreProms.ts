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


export class SettledPromise<T = void> extends Promise<T> {
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



export class ResablePromise<T = void> extends SettledPromise<T> {
  
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


export class CancelAblePromise<T = unknown, C = void> extends SettledPromise<T> {
  public cancelled: boolean = false
  public cancel: (reason: C) => void
  public onCancel: Promise<C> = new ResablePromise(() => {})
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