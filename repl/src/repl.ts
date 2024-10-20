import { CancelAblePromise, latestLatent, execQueue, ResablePromise } from "../../app/src/moreProms"
import { timoi } from "timoi"
import delay from "tiny-delay"
// //const testElem = document.querySelector("#test")







const time = timoi()
const q = execQueue()


const p = new CancelAblePromise<void>((res) => {
  
  res(delay(1000).then(() => {
    console.log("res")
  }))
  

  return () => {
    console.log("cancel1")
  }
}).then(() => {
  console.log("then")
})

// p.then(() => {
//   console.log("then")
// })

// const p2 = p.then(async () => {
//   await delay(1000)
// }, undefined, () => {
//   p.cancel()
// })



// p2.cancel()


// const p = new Promise<void>((res) => {
//   delay(1000).then(() => {
//     console.log("res")
//     res()
//   })
// })
// p.catch(() => {
//   console.log("catch")
// })


// const p2 = p.then(async () => {

//   throw new Error("test")
//   await delay(1000)
// })





