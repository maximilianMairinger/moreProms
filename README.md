# More proms

A collection of additional promise extending classes. Including a (from the outside) ResablePromise, CancelAblePromise and a latestLatent utility function.

## Installation

```shell
 $ npm i more-proms
```

## Usage

### SettledPromise

`SettledPromise` is a subclass of `Promise` that adds a `settled` property and an `onSettled` promise. The `settled` property indicates whether the promise has settled (resolved or rejected), and the `onSettled` promise resolves when the `SettledPromise` settles.

```ts
import { SettledPromise } from "more-proms"

const promise = new SettledPromise((resolve, reject) => {
  setTimeout(() => {
    resolve("Hello, world!")
  }, 1000)
})

console.log(promise.settled) // false

promise.onSettled.then(() => {
  console.log(promise.settled) // true
})
```

### ResablePromise

`ResablePromise` is a subclass of `SettledPromise` that adds `res` and `rej` methods for resolving and rejecting the promise on the fly as consumer. This is only for convenience, as I see myself doing this (see the second example below) a lot. And this provides type safety without effort.

```ts
import { ResablePromise } from "more-proms"

const prom = new ResablePromise()
// later...
prom.res()
```

So you dont have to do this:

```ts
let promRes
const prom = new Promise(res => promRes = res)
// later ...
promRes()
```

### CancelAblePromise

`CancelAblePromise` is a subclass of `SettledPromise` that adds cancellation support. It has a `cancel` method for the consumer that can be used to cancel the promise. A canceled promise will never resolve nor will it reject.

The promise provider can provide a callback will only ever be called once, and wont be called after resolvement or rejection. This callback can be used to e.g. cancel an ongoing animation, or network request.

Note how in this example the clearance of the timeout will have no effect, as a canceled promise wont resolve nor reject even if resolve is called after the timeout finishes. But the two example use cases from above could actually do something useful in the cancel callback.


```ts
import { CancelAblePromise } from "more-proms"

let timeout
const p = new CancelAblePromise<string>((resolve, reject) => {
  timeout = setTimeout(() => {
    resolve("Hello, world!")
  }, 1000)
}, () => {
  console.log("cancelled")
  clearTimeout(timeout)
})


// later

p.cancel()
```

Nested cancellation are also supported. More specific: where nested promises created by `then` or `catch` methods are cancelled when the parent promise is cancelled. A nested example follows below. Note how `p1` is cancelled before `p2` resolve, hence only the `p1` will resolve, the `p2` will never resolve.

```ts
const p1 = new CancelAblePromise<string>((resolve, reject) => {
  setTimeout(() => {
    resolve("Hello, world")
  }, 1000)
})

const p2 = p1.then(async (q) => {
  console.log(1)
  await delay(1000)
  return q + "!"
})

p2.then(() => {
  console.log(2)
})

delay(1500, () => {
  p1.cancel()
})
```

### latestLatent

`latestLatent` is a function that takes a callback function and returns a similar function (acting as the given one) that only executes the latest callback and cancels previous callbacks. This is useful for scenarios where you have asynchronous operations that may be triggered multiple times, but you only want to process the result of the latest operation.

A common use case would be a cleanup after an animation that should only be executed when no other animation has been triggered in the meantime.

```ts
import { latestLatent } from "more-proms"

const showPopup = latestLatent(async () => {
  element.css({display: "block"})
  await element.animate({opacity: 1})
  await closeButton.waitForClick()
  await element.animate({opacity: 0})
})


// later

showButton.on("click", () => {
  showPopup().then(() => {
    element.css({display: "none"})
  })
})

```

This way you can be sure that the popup doesnt get `display: none`, when the user opens it again before it has been fully closed (the animation finishes).

You may have noticed that the location in your code where you want to `showPopup()` may have a different concern than ensuring that the popupElement is properly hidden. So, to keep the concerns where they belong, you can chain then calls directly on the showPopup provider (where it is declared).

```ts
const showPopup = latestLatent(async () => {
  element.css({display: "block"})
  await element.animate({opacity: 1})
  await closeButton.waitForClick()
  await element.animate({opacity: 0})
}).then(() => {
  element.css({display: "none"})
})


// later

showButton.on("click", () => {
  showPopup()
})
```

Note that these provider then calls change the output of the function (in this case `showPopup`), just like `then` calls on a promise change the output of the promise. So if you want to get the original functions output, you have to call the reference to the original function.

```ts
const hello = latestLatent(async () => {
  await delay(100)
  return "hello"
})

const helloWorld = hello.then(async (w) => {
  await delay(100)
  return w + " world"
})

// later

hello().then((w) => {
  console.log(w) // hello
})



await delay(1000) // lets begin another example



// here both hello and helloWorld are called, since the delay between them is large enough for hello() to settle.

hello().then((w) => {
  console.log(w) // hello
})

await delay(150)

helloWorld().then((w) => {
  console.log(w) // hello world
})


await delay(1000) // lets begin another example



// here only hello is called, since the delay between them is not large enough for helloWorld() to settle.

helloWorld().then((w) => {
  console.log(w) // wont ever get here
})

await delay(150)

hello().then((w) => {
  console.log(w) // hello
})
```


## Contribute

All feedback is appreciated. Create a pull request or write an issue.