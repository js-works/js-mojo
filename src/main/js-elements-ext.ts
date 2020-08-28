// === constants =====================================================

const STORE_KEY = 'js-elements::ext::store'

// === types =========================================================

type Task = () => void
type State = Record<string, any>

type StateUpdater<T extends Record<string, any>> = {
  (newState: Partial<T>): void
  (stateUpdate: (oldState: T) => Partial<T>): void
  (key: keyof T, newValue: T[typeof key]): void
  (key: keyof T, valueUpdate: (oldValue: T[typeof key]) => T[typeof key]): void
}

type Message = { type: string } & Record<string, any>

type MessageCreators = {
  [key: string]: (...args: any[]) => Message
}

type Selectors<S extends State> = {
  [key: string]: (state: S) => any
}

type SelectorsOf<S extends State, U extends Selectors<S>> = {
  [K in keyof U]: U[K] extends (state: S) => infer R ? R : never
}

export interface Ctrl {
  getName(): string
  isInitialized(): boolean
  isMounted(): boolean
  afterMount(action: () => void): void
  // afterCommit(action: () => void): void
  onceBeforeUpdate(action: () => void): void
  beforeUpdate(action: () => void): void
  afterUpdate(action: () => void): void
  beforeUnmount(action: () => void): void
  refresh(): void
  addStyles(styles: string | string[]): void
  send(message: Message): void
  receive(type: string, handler: (message: Message) => void): () => void
}

type Store<S extends State> = {
  getState(): State
  subscribe(listener: () => void): () => void
  dispatch(msg: Message): void
}

// === createExtension ===============================================

export function createExtension<T extends Ctrl, A extends [T, ...any[]], R>(
  name: string,
  func: (...args: A) => R
): (...args: A) => R {
  function ret() {
    if (process.env.NODE_ENV === ('development' as any)) {
      let c = arguments[0]

      if (
        !c ||
        typeof c !== 'object' ||
        typeof c.onceBeforeUpdate !== 'function'
      ) {
        throw new TypeError(
          `First argument of extension "${name}" must be a component controller or an object that has a method "getCtrl"`
        )
      } else if (c.isInitialized()) {
        throw new Error(
          `Extension "${name}" has been called after initialization phase of component "${c.getDisplayName()}"`
        )
      }
    }

    return func.apply(null, arguments as any)
  }

  Object.defineProperty(ret, 'name', {
    value: name
  })

  return ret
}

// === useValue ======================================================--

export const useValue = createExtension('useValue', function <T>(
  c: Ctrl,
  initialValue: T
): [() => T, (updater: T | ((value: T) => T)) => void] {
  let nextValue = initialValue

  let value = initialValue
  const setValue = (updater: any) => {
    // TODO
    nextValue = typeof updater === 'function' ? updater(nextValue) : updater

    c.onceBeforeUpdate(() => {
      value = nextValue
    })

    c.refresh()
  }

  return [() => value, setValue as any] // TODO
})

// === useState ======================================================--

export const useState = createExtension('useState', function <
  T extends Record<string, any>
>(c: Ctrl, initialState: T): [T, StateUpdater<T>] {
  let nextState: any, // TODO
    mergeNecessary = false

  const state = { ...initialState },
    setState = (arg1: any, arg2: any) => {
      mergeNecessary = true

      if (typeof arg1 === 'string') {
        nextState[arg1] =
          typeof arg2 === 'function' ? arg2(nextState[arg1]) : arg2
      } else if (typeof arg1 === 'function') {
        Object.assign(nextState, arg1(nextState))
      } else {
        Object.assign(nextState, arg1)
      }

      c.onceBeforeUpdate(() => {
        if (mergeNecessary) {
          Object.assign(state, nextState)
          mergeNecessary = false
        }
      })

      c.refresh()
    }

  nextState = { ...state }

  return [state, setState as any] // TODO
})

// === useMemo =========================================================

// TODO - this is not really optimized, is it?

export const useMemo = createExtension('useMemo', function <
  T,
  A extends any[],
  G extends () => A
>(c: Ctrl, getValue: (...args: ReturnType<G>) => T, getDeps: G) {
  let oldDeps: any[], value: T

  const memo = {
    get value() {
      const newDeps = getDeps()

      if (!oldDeps || !isEqualArray(oldDeps, newDeps)) {
        value = getValue.apply(null, newDeps as any) // TODO
      }

      oldDeps = newDeps
      return value
    }
  }

  return memo
})

// === useEffect ======================================================-

export const useEffect = createExtension('useEffect', function (
  c,
  action: () => void | undefined | null | (() => void),
  getDeps?: null | (() => any[])
): void {
  let oldDeps: any[] | null = null,
    cleanup: Task | null | undefined | void

  if (getDeps === null) {
    c.afterMount(() => {
      cleanup = action()
    })

    c.beforeUnmount(() => {
      cleanup && cleanup()
    })
  } else if (getDeps === undefined || typeof getDeps === 'function') {
    const callback = () => {
      let needsAction = getDeps === undefined

      if (!needsAction) {
        const newDeps = getDeps!()

        needsAction =
          oldDeps === null ||
          newDeps === null ||
          !isEqualArray(oldDeps, newDeps)
        oldDeps = newDeps
      }

      if (needsAction) {
        cleanup && cleanup()
        cleanup = action()
      }
    }

    c.afterMount(callback)
    c.afterUpdate(callback)

    c.beforeUnmount(() => cleanup && cleanup())
  } else {
    throw new TypeError(
      '[effect] Third argument must either be undefined, null or a function'
    )
  }
})

// === useCtx ========================================================

type CtxConfig<C extends Ctrl> = Record<string, (c: C) => any> // TODO

type CtxOf<CC extends CtxConfig<any>> = {
  [K in keyof CC]: ReturnType<CC[K]>
}

export const useCtx = createExtension('useCtx', function <
  CC extends CtxConfig<any>
>(c: Ctrl, config: CC): CtxOf<CC> {
  const ctx: any = {}
  const ctxKeys = Object.keys(config)

  const updateCtx = () => {
    for (let key of ctxKeys!) {
      ctx[key] = config[key](c)
    }
  }

  updateCtx()
  c.beforeUpdate(updateCtx)
  return ctx
})

// === useInterval ======================================================

export const useInterval = createExtension(
  'useInterval',
  (c, task: Task, delay: number | (() => number)) => {
    const getDelay = typeof delay === 'function' ? delay : () => delay

    useEffect(
      c,
      () => {
        const id = setInterval(task, getDelay())

        return () => clearInterval(id)
      },
      () => [getDelay()]
    )
  }
)

// === useTime =========================================================

export const useTime = createExtension('useTime', timeFn)

function timeFn(c: Ctrl, delay: number | (() => number)): () => Date

function timeFn<T>(
  c: Ctrl,
  delay: number | (() => number),
  getter: () => T
): () => T

function timeFn(
  c: Ctrl,
  delay: number | (() => number),
  getter: Function = getDate
): () => any {
  const getDelay = typeof delay === 'function' ? delay : () => delay

  const [getValue, setValue] = useValue(c, getter())

  useInterval(
    c,
    () => {
      setValue(getter())
    },
    getDelay
  )

  return getValue
}

function getDate() {
  return new Date()
}

// === usePromise ===================================================

type PromiseRes<T> =
  | {
      result: undefined
      error: undefined
      state: 'pending'
    }
  | {
      result: T
      error: undefined
      state: 'resolved'
    }
  | {
      result: undefined
      error: Error
      state: 'rejected'
    }

const initialState: PromiseRes<any> = {
  result: undefined,
  error: undefined,
  state: 'pending'
}

export const usePromise = createExtension('usePromise', function <T>(
  c: Ctrl,
  getPromise: () => Promise<T>,
  getDeps?: () => any[]
): PromiseRes<T> {
  const [state, setState] = useState<PromiseRes<T>>(c, initialState)

  let promiseIdx = -1

  useEffect(
    c,
    () => {
      ++promiseIdx

      if (state.state !== 'pending') {
        setState(initialState)
      }

      const myPromiseIdx = promiseIdx

      getPromise()
        .then((result) => {
          if (promiseIdx === myPromiseIdx) {
            setState({
              result,
              state: 'resolved'
            })
          }
        })
        .catch((error) => {
          if (promiseIdx === myPromiseIdx) {
            setState({
              error: error instanceof Error ? error : new Error(String(error)),
              state: 'rejected'
            })
          }
        })
    },
    typeof getDeps === 'function' ? getDeps : null
  )

  return state
})

// === useMousePosition ===============================================

export const useMousePosition = createExtension(
  'useMousePosition',
  (c: Ctrl) => {
    const [mousePos, setMousePos] = useState(c, { x: -1, y: -1 })

    useEffect(
      c,
      () => {
        const listener = (ev: any) => {
          // TODO
          setMousePos({ x: ev.pageX, y: ev.pageY })
        }

        window.addEventListener('mousemove', listener)

        return () => {
          window.removeEventListener('mousemove', listener)
        }
      },
      null
    )

    return mousePos
  }
)

// === useStore ======================================================

export const useStore = createExtension(
  'useStore',
  (c, store: Store<any>): void => {
    c.receive(STORE_KEY, (msg: any /* TODO */) => {
      msg.payload.setStore(store)
    })
  }
)

// === useActions ======================================================

type ActionsOf<C extends MessageCreators> = {
  [K in keyof C]: C[K] extends (...args: infer A) => any
    ? (...args: A) => void
    : never
}

export const useActions = createExtension('useActions', function <
  C extends MessageCreators
>(c: Ctrl, msgCreators: C): ActionsOf<C> {
  let store: Store<any> | null = null

  const ret: any = {}

  c.send({
    type: STORE_KEY,

    payload: {
      setStore(st: Store<any>) {
        store = st
      }
    }
  })

  if (!store) {
    throw new Error(`Store for actions not available (-> ${c.getName()})`)
  }

  for (const key of Object.keys(msgCreators)) {
    ret[key] = (...args: any[]) => {
      store!.dispatch(msgCreators[key](...args))
    }
  }

  return ret
})

// === useSelect =======================================================

export const useSelectors = createExtension('useSelectors', function <
  U extends Selectors<any>
>(c: Ctrl, selectors: U): SelectorsOf<any, U> {
  let store: Store<any> | null = null

  const ret: any = {}

  c.send({
    type: STORE_KEY,

    payload: {
      setStore(st: Store<any>) {
        store = st
      }
    }
  })

  if (!store) {
    throw new Error(`Store for selectors not available (-> ${c.getName()})`)
  }

  const unsubscribe = store!.subscribe(() => {
    c.refresh()
  })

  c.beforeUnmount(unsubscribe)

  for (const key of Object.keys(selectors)) {
    Object.defineProperty(ret, key, {
      get: () => {
        return selectors[key](store!.getState())
      }
    })
  }

  return ret
})

// === locals ========================================================

function isEqualArray(arr1: any[], arr2: any[]) {
  let ret =
    Array.isArray(arr1) && Array.isArray(arr2) && arr1.length === arr2.length

  if (ret) {
    for (let i = 0; i < arr1.length; ++i) {
      if (arr1[i] !== arr2[i]) {
        ret = false
        break
      }
    }
  }

  return ret
}
