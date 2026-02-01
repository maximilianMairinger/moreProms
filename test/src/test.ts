import { SettledPromise, ResablePromise, CancelAblePromise, latestLatent } from "../../app/src/moreProms"

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe("SettledPromise", () => {
  
  test("settled property starts false and becomes true", async () => {
    const promise = new SettledPromise((resolve) => {
      setTimeout(() => {
        resolve("Hello, world!")
      }, 100)
    })

    expect((promise as any).settled).toBe(false)
    
    await (promise as any).onSettled
    
    expect((promise as any).settled).toBe(true)
  })

  test("settled becomes true on rejection", async () => {
    const promise = new SettledPromise((resolve, reject) => {
      setTimeout(() => {
        reject("Error abc!")
      }, 100)
    })

    expect(promise.settled).toBe(false)

    await promise.onSettled

    expect(promise.settled).toBe(true)
  })
  
})

describe("ResablePromise", () => {
  
  test("can be resolved externally", async () => {
    const prom = new ResablePromise<string>()
    
    setTimeout(() => {
      prom.res("test value")
    }, 50)
    
    const result = await prom
    expect(result).toBe("test value")
  })

  test("can be rejected externally", async () => {
    const prom = new ResablePromise<string>()
    
    setTimeout(() => {
      prom.rej("error value")
    }, 50)
    
    await expect(prom).rejects.toBe("error value")
  })
  
})

describe("CancelAblePromise", () => {
  
  test("cancel callback is called when cancelled", async () => {
    const cancelMock = jest.fn()
    let timeout: NodeJS.Timeout
    
    const p = new CancelAblePromise<string>((resolve) => {
      timeout = setTimeout(() => {
        resolve("Hello, world!")
      }, 1000)
    }, () => {
      cancelMock()
      clearTimeout(timeout)
    })

    await delay(50)
    p.cancel()
    
    expect(cancelMock).toHaveBeenCalledTimes(1)
  })

  test("cancelled promise never resolves", async () => {
    const resolveMock = jest.fn()
    let timeout: NodeJS.Timeout
    
    const p = new CancelAblePromise<string>((resolve) => {
      timeout = setTimeout(() => {
        resolve("Hello, world!")
      }, 100)
    }, () => {
      clearTimeout(timeout)
    })

    p.then(resolveMock)
    
    await delay(50)
    p.cancel()
    await delay(100)
    
    expect(resolveMock).not.toHaveBeenCalled()
  })

  test("nested cancellation - parent cancel cancels children", async () => {
    const log: number[] = []
    
    const p1 = new CancelAblePromise<string>((resolve) => {
      setTimeout(() => {
        resolve("Hello, world")
      }, 100)
    })

    const p2 = p1.then(async (q) => {
      log.push(1)
      await delay(100)
      return q + "!"
    })

    p2.then(() => {
      log.push(2)
    })

    await delay(150)
    ;(p1 as any).cancel()
    await delay(200)
    
    expect(log).toEqual([1]) // Only 1 logged, not 2
  })
  
})

describe("latestLatent", () => {
  
  test("cancels previous execution when called again", async () => {
    const executions: string[] = []
    
    const fn = latestLatent(async (id: string) => {
      executions.push(`start-${id}`)
      await delay(100)
      return id
    }).then(async (id) => {
      executions.push(`end-${id}`)
    })

    fn("first")
    await delay(50)
    fn("second")
    await delay(200)
    
    expect(executions).toEqual(["start-first", "start-second", "end-second"])
  })

  test("chained then modifies return value", async () => {
    const hello = latestLatent(async () => {
      await delay(100)
      return "hello"
    })

    const helloWorld = hello.then(async (w) => {
      await delay(100)
      return w + " world"
    })

    const result1 = await hello()
    expect(result1).toBe("hello")
    
    await delay(150)
    
    const result2 = await helloWorld()
    expect(result2).toBe("hello world")
  })

  test("both hello and helloWorld execute when delay is large enough", async () => {
    const executions: string[] = []
    
    const hello = latestLatent(async () => {
      executions.push("hello-start")
      await delay(100)
      executions.push("hello-end")
      return "hello"
    })

    const helloWorld = hello.then(async (w) => {
      executions.push("world-start")
      await delay(100)
      executions.push("world-end")
      return w + " world"
    })

    hello().then(() => executions.push("hello-resolved"))
    
    await delay(150)
    
    helloWorld().then(() => executions.push("helloWorld-resolved"))
    
    await delay(250)
    
    expect(executions).toContain("hello-resolved")
    expect(executions).toContain("helloWorld-resolved")
  })

  test("calling hello after helloWorld cancels helloWorld chain", async () => {
    const executions: string[] = []
    
    const hello = latestLatent(async () => {
      executions.push("hello-start")
      await delay(100)
      executions.push("hello-end")
      return "hello"
    })

    const helloWorld = hello.then(async (w) => {
      executions.push("world-start")
      await delay(100)
      executions.push("world-end")
      return w + " world"
    })

    const p1 = helloWorld().then(() => executions.push("helloWorld-resolved"))
    
    await delay(50)
    
    const p2 = hello().then(() => executions.push("hello-resolved"))
    
    await delay(200)
    
    expect(executions).toContain("hello-resolved")
    expect(executions).not.toContain("helloWorld-resolved")
  })

  test("nested latestLatent calls - conditional execution", async () => {
    const executions: string[] = []
    
    const onTrue = latestLatent(async () => {
      executions.push("ON TRUE")
      await delay(100)
    }).then(async () => {
      executions.push("SECOND TRUE")
      await delay(100)
    })

    const onFalse = latestLatent(async () => {
      executions.push("ON FALSE")
      await delay(100)
    }).then(async () => {
      executions.push("SECOND FALSE")
      await delay(100)
    })

    const call = latestLatent((trueOrFalse: boolean) => {
      if (trueOrFalse) return onTrue()
      else return onFalse()
    }).then(() => {
      executions.push("DONE")
    })

    call(true)
    await delay(50)
    call(false)
    await delay(300)
    
    expect(executions).toEqual(["ON TRUE", "ON FALSE", "SECOND FALSE", "DONE"])
  })

  test("abort cancels execution without triggering new one", async () => {
    const executions: string[] = []
    
    const hello = latestLatent(async () => {
      executions.push("start")
      await delay(100)
      executions.push("end")
      return "hello"
    }).then((w) => {
      executions.push("then")
      return w + " world"
    })

    hello()
    await delay(50)
    hello.abort()
    await delay(100)
    
    expect(executions).toEqual(["start", "end"])
  })

  test("chaining returns is scoped to function call", async () => {
    const executions: string[] = []
    
    const hello = latestLatent(async () => {
      executions.push("start")
      await delay(100)
      return "hello"
    })

    const helloWorld = hello.then(async (w) => {
      await delay(50)
      executions.push("then")
      return w + " world"
    })

    expect(await hello()).toBe("hello")
    expect(await helloWorld()).toBe("hello world")
    
    expect(executions).toEqual(["start", "start", "then", "then"])
  })

  test("chained then calls execute in sequence", async () => {
    const executions: string[] = []
    
    const fn = latestLatent(async () => {
      executions.push("base")
      await delay(50)
      return "value"
    })
    .then((v) => {
      executions.push("then1")
      return v + "1"
    })
    .then((v) => {
      executions.push("then2")
      return v + "2"
    })

    const result = await fn()
    
    expect(executions).toEqual(["base", "then1", "then2"])
    expect(result).toBe("value12")
  })

  test("catch handles errors", async () => {
    const executions: string[] = []
    
    const fn = latestLatent(async () => {
      executions.push("base")
      await delay(50)
      throw new Error("test error")
    })
    .catch((e) => {
      executions.push("catch")
      return "recovered"
    })

    const result = await fn()
    
    expect(executions).toEqual(["base", "catch"])
    expect(result).toBe("recovered")
  })

  test("multiple concurrent calls - only latest completes", async () => {
    const executions: string[] = []
    
    const fn = latestLatent(async (id: number) => {
      executions.push(`start-${id}`)
      await delay(100)
      return id
    }).then(async (id) => {
      executions.push(`end-${id}`)
    })


    const p1 = fn(1)
    await delay(30)
    const p2 = fn(2)
    await delay(30)
    const p3 = fn(3)
    
    await delay(150)
    
    // Only the last one completes
    expect(executions).toEqual(["start-1", "start-2", "start-3", "end-3"])
  })

  test("cancelable func gets cancelled", async () => {
    const executions: string[] = []

    const fn = latestLatent((id: number) => {
      return new CancelAblePromise<number>(async (res) => {
        executions.push(`start-${id}`)
        await delay(100)
        executions.push(`s-end-${id}`)
        res(id)
      }, () => {
        executions.push(`cancelled-${id}`)
      })
    }).then(async (id) => {
      executions.push(`mid-${id}`)
      return id
    }).then((id) => {
      const q = new CancelAblePromise<number>(async (res) => {
        executions.push(`final-start-${id}`)
        await delay(100)
        res(id)
      }, () => {
        executions.push(`final-cancelled-${id}`)
      })
      return q
    })

    fn(1)
    await delay(30)
    fn(2)
    await delay(100)
    await fn(3)
    

    expect(executions).toEqual(["start-1", "cancelled-1", "start-2", "s-end-1", "s-end-2", "mid-2", "final-start-2", "final-cancelled-2", "start-3", "s-end-3", "mid-3", "final-start-3"])
  })
  
})