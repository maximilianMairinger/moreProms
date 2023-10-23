import { CancelAblePromise, latestLatent } from "../../app/src/moreProms"
import delay from "tiny-delay"
// //const testElem = document.querySelector("#test")



const f = latestLatent(async () => {
  console.log("0")
  await delay(1000)
  return "hi"
})

const f2 = f.then(async () => {
  console.log("a1")
  await delay(500)
  return "1lel"
})

const f3 = f2.then(async (lel) => {
  console.log("a2")
  await delay(500)
  return "2lel" + lel
})


const p = f2()
const p2 = f3()

p.then(console.log)
p2.then(console.log)






delay(1600, () => {
  console.log("cancel")
  f2().then(console.log)
  // p.cancel()
})