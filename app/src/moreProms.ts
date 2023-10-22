import { memoize } from "key-index"


// export function latestLatentRequest<Args extends unknown[], Ret>(cb: (...args: Args) => Promise<Ret>, ...thens: ((ret: Ret, ...args: Args) => void)[]) {
//   let globalRecent = Symbol()
//   async function request(...args: Args) {
//     const recent = globalRecent = Symbol()
//     let ret = await cb(...args)
//     for (const then of thens) {
//       if (globalRecent === recent) {
//         then(ret, ...args)
        
//       }
//       else break
//     }
    
//     return ret
//   }

//   return request
// }


export class SettledPromise<T = unknown> extends Promise<T> {
  public settled: boolean = false
  public onSettled: Promise<void>

  constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void) {
    super((res, rej) => {
      executor((a) => {
        this.settled = true
        r()
        res(a)
      }, (a) => {
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
  
  constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void) {
    let res: any
    let rej: any
    super((r, rj) => {
      res = r
      rej = rj

      executor(r, rj)
    })

    this.res = res
    this.rej = rej
  }
}


export class CancelAblePromise<T = unknown, C = unknown> extends SettledPromise<T> {
  public cancelled: boolean = false
  public cancel: () => void
  constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void, cancel: () => C) {
    super((res, rej) => {
      const r = (a) => {
        if (this.cancelled) return
        res(a)
      }
      const rj = (a) => {
        if (this.cancelled) return
        rej(a)
      }
      executor(r, rj)
    })
    this.cancel = memoize(() => {
      if (this.settled) return
      this.cancelled = true
      return cancel()
    })
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined
  ): CancelAblePromise<TResult1 | TResult2> {
    const r = super.then(onfulfilled, onrejected) as CancelAblePromise<TResult1 | TResult2>
    r.cancel = this.cancel
    return r
  }
  catch<TResult = never>(
    onrejected: ((reason: any) => TResult | PromiseLike<TResult>) | null | undefined
  ): CancelAblePromise<T | TResult> {
    const r = super.catch(onrejected) as CancelAblePromise<T | TResult>
    r.cancel = this.cancel
    return r
  }

}

