import { CancelAblePromise, latestLatent } from "../../app/src/moreProms"
import delay from "tiny-delay"
// //const testElem = document.querySelector("#test")



const f = latestLatent(async () => {
  console.log("0")
  await delay(1000)
  return "hi"
})

f.then(async () => {
  console.log("a1")
  await delay(500)
}).then(() => {
  console.log("a2")
})




const p = f()

const p2 = p.then(async (h) => {
  console.log("1")
  await delay(200)
  
  return h + " there"
})


p2.then(console.log)




delay(1100, () => {
  console.log("cancel")
  f()
  // p.cancel()
})