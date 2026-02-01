import { CancelAblePromise } from "./proms";

export * from "./proms";


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
    prom = r instanceof CancelAblePromise ? r as CancelAblePromise<Ret> : new CancelAblePromise<Ret>((res, rej) => { (r as Promise<any>).then(res, rej) }, () => {})
    lastPromHasUpdated(futures, prom)
    // console.log("callingVesselProm", callingPromUID)
    if (callingPromUID === undefined) return prom
    // we need to get the deepest prom here so that the return type is correct (if you return something in the last then call it should be returned here, scoped to the invokation func, look at the hello world example from the readme)
    const deepestProm = uidToProm.get(callingPromUID);
    // but we also need the .cancel call on the returned function to cancel the base prom, so that we stop the execution flow for nested latestLatents (look at the conditional example in the readme)
    // @ts-ignore
    (deepestProm as CancelAblePromise).addNestedCancel(() => {
      prom.cancel()
    })
    return deepestProm
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

  function propagateFuture(vessel: any, future: Future, func: "then" | "catch", lastProm: CancelAblePromise<any>) {
    vessel[func] = (...args: any[]) => {
      const deeper = []
      const prom = (lastProm[func] as any)(...args) as CancelAblePromise<any>
      
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


