import { CancelAblePromise, latestLatent, execQueue, ResablePromise, SettledPromise } from "../../app/src/moreProms"
import { timoi } from "timoi"
import delay from "tiny-delay"
import { describe, expect, jest, mocks, test } from "./mock"
// //const testElem = document.querySelector("#test")







test("nested latestLatent calls - conditional execution", async () => {
    const executions: string[] = []
    const debugProm = new ResablePromise()
    
    const onTrue = latestLatent(async () => {
      executions.push("ON TRUE")
      await delay(100)
      await debugProm
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
    debugProm.res()
    call(false)
    await delay(300)
    
    expect(executions).toEqual(["ON TRUE", "ON FALSE", "SECOND FALSE", "DONE"])
  })



// const debugProm = new ResablePromise()

// const onTrue = latestLatent(async () => {
//   console.log("ON TRUE")
//   await delay(1000)
//   await debugProm
// }).then(async () => {
//   console.log("SECOND TRUE")
//   await delay(1000)
// })

// const onFalse = latestLatent(async () => {
//   console.log("ON FALSE")
//   await delay(1000)
// }).then(async () => {
//   console.log("SECOND FALSE")
//   await delay(1000)
// })

// const call = latestLatent((trueOrFalse) => {
//   if (trueOrFalse) return onTrue()
//   else return onFalse()
// }).then(() => {
//   console.log("DONE")
// });



// (async () => {
//   call(true)
//   await delay(500)
//   call(false)
//   debugProm.res()
// })()



// const showPopup = latestLatent(async () => {
//   await delay(100)
//   return "popup result"
// }).then((result) => {
//   // element.css({display: "none"})
//   return result + " processed"
// })


// ;(async () => {
//   console.log("start")
//   const value = await showPopup()
//   console.log(value)
// })();
