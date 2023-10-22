import { CancelAblePromise } from "../../app/src/moreProms"
import delay from "tiny-delay"
// //const testElem = document.querySelector("#test")



const p = new CancelAblePromise<string>(async (res, rej) => {
  await delay(1000)
  res("hi")
}, () => {
  console.log("cancelled")
})

console.log(p.then((r) => {
  console.log(r)
}))


delay(1500, () => {
  p.cancel()
})