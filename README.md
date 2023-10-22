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

Nested cancellation are also supported. More specific: where nested promises created by `then` or `catch` methods are cancelled when the parent promise is cancelled.

```ts
import { CancelAblePromise } from "more-proms"

const p = new CancelAblePromise<string>((resolve, reject) => {
  setTimeout(() => {
    resolve("Hello, world!")
  }, 1000)
})

p.cancel()
```

A nested example: Note how `p1` is cancelled before `p2` resolve, hence only the `p1` will resolve, the `p2` will never resolve.

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
  await waitForCloseInput()
  await element.animate({opacity: 0})
})

showPopup().then(() => {
  element.css({display: "none"})
})
```

This way you can be sure that the popup doesnt get `display: none`, when the user opens it again before it has been fully closed (the animation finishes).


## Contribute

All feedback is appreciated. Create a pull request or write an issue.