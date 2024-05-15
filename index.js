const data = { foo: 1, bar: 33 }

let activeEffect
let effectStack = []
function effect(fn, options = {}) {
  const effectFn = () => {
    cleanup(effectFn)
    activeEffect = effectFn
    effectStack.push(effectFn)
    const res = fn()
    effectStack.pop()
    activeEffect = effectStack[effectStack.length - 1]
    return res
  }
  effectFn.options = options
  effectFn.deps = []

  if (!options.lazy) {
    effectFn()
  }
  return effectFn
}

const bucket = new WeakMap()
const obj = new Proxy(data, {
  get(target, key) {
    track(target, key)
    return target[key]
  },
  set(target, key, newVal) {
    target[key] = newVal
    trigger(target, key)
    return true
  },
})

function track(target, key) {
  if (!activeEffect) return target[key]

  let depsMap = bucket.get(target)
  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()))
  }
  let deps = depsMap.get(key)
  if (!deps) {
    depsMap.set(key, (deps = new Set()))
  }
  deps.add(activeEffect)
  activeEffect.deps.push(deps)
}

function trigger(target, key) {
  const depsMap = bucket.get(target)
  if (!depsMap) return

  const effects = depsMap.get(key)
  const effectsToRun = new Set()
  effects && effects.forEach(effect => {
    if (effect !== activeEffect) {
      effectsToRun.add(effect)
    }
  })
  effectsToRun.forEach(effectFn => {
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn)
    } else {
      effectFn()
    }
  })
}

function cleanup(effectFn) {
  for (let i = 0; i < effectFn.deps.length; i++) {
    const deps = effectFn.deps[i]
    deps.delete(effectFn)
  }
  effectFn.deps.length = 0
}

const jobQueue = new Set()
const p = Promise.resolve()

let isFlushing = false
function flushJob() {
  if (isFlushing) return

  isFlushing = true
  p.then(() => {
    jobQueue.forEach(job => job())
  }).finally(() => {
    isFlushing = false
  })
}

function computed(getter) {
  let value
  let dirty = true

  const effectFn = effect(getter, {
    lazy: true,
    scheduler() {
      dirty = true
      trigger(obj, 'value')
    },
  })

  const obj = {
    get value() {
      if (dirty) {
        value = effectFn()
        dirty = false
      }
      track(obj, 'value')
      return value
    },
  }

  return obj
}

function watch(source, cb) {
  let getter
  if (typeof source === 'function') {
    getter = source
  } else {
    getter = () => traverse(source)
  }

  effect(getter, {
    scheduler() {
      cb()
    },
  })
}

function traverse(value, seen = new Set()) {
  if (typeof value !== 'object' || value === null || seen.has(value)) return
  seen.add(value)

  for (const k in value) {
    traverse(value[k], seen)
  }

  return value
}

watch(() => obj.foo, () => console.log('obj.foo changed'))

// const sumRes = computed(() => obj.foo + obj.bar)
// effect(() => console.log(sumRes.value))
// console.log(sumRes.value)
// obj.foo++
// console.log(sumRes.value)
// effect(() => {
//   console.log(obj.foo)
// }, {
//   scheduler(fn) {
//     jobQueue.add(fn)
//     flushJob()
//   }
// })
obj.foo++
obj.bar++

// effect(() => {
//   obj.foo = obj.foo + 1
// })
// effect(() => {
//   console.log('effect1执行')
//   effect(() => {
//     console.log('effect2执行')
//     const temp = obj.bar
//   })
//   const temp = obj.foo
// })
// effect(() => console.log('foo', obj.foo), {
//   scheduler(fn) {
//     setTimeout(fn)
// }})
// obj.foo++
// console.log('end')
