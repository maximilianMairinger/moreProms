import { memoize } from "key-index"
Promise.resolve().then

export function latestLatent<Args extends unknown[], Ret>(cb: (...args: Args) => (CancelAblePromise<Ret> | Promise<Ret>)) {
  let lastProm = new CancelAblePromise<Ret>(() => {}, () => {})
  
  function request(...args: Args) {
    lastProm.cancel()
    const r = cb(...args) 
    lastProm = r instanceof CancelAblePromise ? r : new CancelAblePromise<Ret>((res, rej) => { r.then(res, rej) }, () => {})
    lastPromHasUpdated(futures, lastProm)
    return lastProm
  }

  function lastPromHasUpdated(futures: Future, vessel: any) {
    for (const {func, args, deeper} of futures) {
      const nxtVessel = vessel[func](...args)
      lastPromHasUpdated(deeper, nxtVessel)
    }
  }

  type Future = {func: string, args: any[], deeper: Future}[]

  let futures = [] as Future

  function propergateFuture(vessel: any, future: Future, func: "then" | "catch", lastVessel: {then: any, catch: any}) {
    vessel[func] = (...args: any[]) => {
      const deeper = []
      future.push({func, args, deeper})
      // @ts-ignore
      const lastVesselProm = lastVessel[func](...args)

      const nxtVessel = {}
      propergateFuture(nxtVessel, deeper, "then", lastVesselProm)
      propergateFuture(nxtVessel, deeper, "catch", lastVesselProm)
      return nxtVessel
    }
    
  }
  
  propergateFuture(request, futures, "then", lastProm)
  propergateFuture(request, futures, "catch", lastProm)


  type P<Ret> = {
    then<TResult1 = Ret, TResult2 = never>(onfulfilled?: ((value: Ret) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): P<TResult1 | TResult2>
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): P<Ret | TResult>;
  }

  return request as typeof request & P<Ret>
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

