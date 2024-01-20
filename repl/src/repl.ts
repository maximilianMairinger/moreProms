import { CancelAblePromise, latestLatent, execQueue, ResablePromise } from "../../app/src/moreProms"
import { timoi } from "timoi"
import delay from "tiny-delay"
// //const testElem = document.querySelector("#test")







const time = timoi()
const q = execQueue()


q(() => delay(1000).then(() => console.log("1qwe", time.str())))
const e = q(() => (delay(1000) as any as CancelAblePromise).then(() => console.log("2qwe")))
e.then(() => {
  console.log("2done")
})

q(() => delay(1000).then(() => console.log("3qwe", time.str())))
