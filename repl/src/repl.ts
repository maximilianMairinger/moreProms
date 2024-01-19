import { CancelAblePromise, latestLatent, execQueue, ResablePromise } from "../../app/src/moreProms"
import delay from "tiny-delay"
// //const testElem = document.querySelector("#test")



const q = execQueue()


const pp = new CancelAblePromise(() => {

}, async () => {
  console.log("canc0start")
  await delay(500)
  console.log("canc0done")
})
pp.onCancel.then(() => console.log("canc0prom"))

q(() => pp)

q(async () => {
  console.log("start1")
  await delay(1000)
  console.log("end1")
}, false)

q(async () => {
  await delay(1000)
  console.log("2")
}, true)




q(() => {
  console.log("start3")
  const cp = delay(1000)
  cp.then(() => console.log("end3"))
  cp.onCancel.then(() => console.log("canc3"))
  return cp
}, false)


q(async () => {
  console.log("4")
}, false, true)




// delay(1600, () => {
//   console.log("cancel")
//   f2().then(console.log)
//   // p.cancel()
// })