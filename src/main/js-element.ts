import { h as createElement, text, patch } from './lib/patched-superfine'

// === exports =======================================================

// public API
export { attr, define, event, h, hook, ref } // methods
export { Ctrl, Component, EventHandler, MethodsOf } // types
export { Ref, UIEvent, VElement, VNode } // types

// === local data =====================================================

const EMPTY_ARR: any[] = []
const EMPTY_OBJ = {}
const attrInfoMapByPropsClass = new Map<PropsClass, AttrInfoMap>()
let currentCtrl: Ctrl | null = null
let ignoreAttributeChange = false

// === types ==========================================================

type Class<T extends Object = any> = { new (...args: any[]): T }
type Props = Record<string, any> // TODO
type VElement<T extends Props = Props> = Record<any, any> // TODO
type Ref<T> = { current: T | null }
type EventHandler<T> = (ev: T) => void
type UIEvent<T extends string, D = null> = CustomEvent<D> & { type: T }
type VNode = null | boolean | number | string | VElement | Iterable<VNode>
type Task = () => void
type PropsClass = { new (): object }

type Component<P> = {
  (props?: P, ...children: VNode[]): VElement<P>
  tagName: string
}

type AttrInfo = {
  propName: string
  hasAttr: true
  attrName: string
  reflect: boolean
  mapPropToAttr: (value: unknown) => string
  mapAttrToProp: (value: string) => unknown
}

type PropInfo = { propName: string; hasAttr: false } | AttrInfo
type AttrInfoMap = Map<string, AttrInfo>
type PropInfoMap = Map<string, PropInfo>

type MethodsOf<C> = C extends Component<infer P>
  ? P extends { ref?: Ref<infer M> }
    ? M extends Record<string, (...args: any[]) => any>
      ? M
      : never
    : never
  : never

type Ctrl = {
  getName(): string
  getHost(): HTMLElement
  isInitialized(): boolean
  isMounted(): boolean
  hasUpdated(): boolean
  refresh(): void
  afterMount(task: Task): void
  onceBeforeUpdate(task: Task): void
  beforeUpdate(task: Task): void
  afterUpdate(task: Task): void
  beforeUnmount(task: Task): void
}

type AttrKind =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | PropConverter

type PropConverter<T = any> = {
  mapPropToAttr(value: T): string
  mapAttrToProp(value: string): T
}

// === public decorators =============================================

function attr(kind: AttrKind, reflect: boolean = false) {
  return (proto: object, propName: string) => {
    const propsClass = proto.constructor as Class
    let attrInfoMap = attrInfoMapByPropsClass.get(propsClass)

    if (!attrInfoMap) {
      attrInfoMap = new Map()
      attrInfoMapByPropsClass.set(propsClass, attrInfoMap)
    }

    const attrName = propNameToAttrName(propName)
    const { mapPropToAttr, mapAttrToProp } = getPropConv(kind)

    attrInfoMap.set(attrName, {
      propName,
      hasAttr: true,
      attrName,
      reflect,
      mapPropToAttr,
      mapAttrToProp
    })
  }
}

// === public functions ==============================================

function ref<T>(value: T | null = null): Ref<T> {
  return { current: value }
}

function hook<A extends any[], R extends any>(
  name: string,
  fn: (...args: A) => R
): (...args: A) => R
function hook<A extends any[], R extends any>(config: {
  name: string
  fn: (c: Ctrl, ...args: A) => R
}): (...args: A) => R

function hook(arg1: any, arg2?: any): Function {
  // TODO: optimize whole function body
  if (typeof arg1 === 'string') {
    return hook({ name: arg1, fn: (c, ...args: any[]) => arg2(...args) })
  }

  const { name, fn } = arg1

  const ret = (...args: any[]) => {
    if (process.env.NODE_ENV === ('development' as string) && !currentCtrl) {
      throw new Error(
        `Hook function "${name}" has been called outside of component initialization phase`
      )
    }

    return fn(currentCtrl, ...args)
  }

  Object.defineProperty(ret, 'name', { value: name })

  return ret
}

function event<T extends string, D = null>(
  type: T,
  detail?: D,
  options?: { bubbles: boolean; cancelable?: boolean }
): UIEvent<T, D> {
  const params = {
    detail: detail || null,
    bubbles: !options || !!options.bubbles,
    cancabble: !options || !!options.cancelable,
    composed: true
  }

  return new CustomEvent(type, params) as UIEvent<T, D>
}

function define(tagName: string, main: () => () => VNode): Component<{}>

function define<P extends Props>(
  tagName: string,
  propsClass: Class<P>,
  main: (props: P) => () => VNode
): Component<Partial<P>>

function define(tagName: string, arg2: any, arg3?: any): any {
  if (process.env.NODE_ENV === ('development' as string)) {
    const argc = arguments.length

    if (typeof tagName !== 'string') {
      throw new TypeError('[define] First argument must be a string')
    } else if (typeof arg2 !== 'function') {
      throw new TypeError('[define] Expected function as second argument')
    } else if (argc > 2 && typeof arg3 !== 'function') {
      throw new TypeError('[define] Expected function as third argument')
    } else if (argc > 3) {
      throw new TypeError('[define] Unexpected fourth argument')
    }
  }

  const propsClass = typeof arg3 === 'function' ? arg2 : null
  const main = propsClass ? arg3 : arg2

  const attrInfoMap =
    (propsClass && attrInfoMapByPropsClass.get(propsClass)) || null

  const customElementClass = buildCustomElementClass(
    tagName,
    propsClass,
    propsClass ? getPropInfoMap(propsClass, attrInfoMap) : null,
    attrInfoMap,
    main
  )

  const ret = h.bind(tagName)

  Object.defineProperty(ret, 'tagName', { value: tagName })

  if (customElements.get(tagName)) {
    console.clear()
    location.reload()
  } else {
    customElements.define(tagName, customElementClass)
  }

  return ret
}

// === locals ========================================================

function buildCustomElementClass<T extends object>(
  name: string,
  propsClass: { new (): T } | null,
  propInfoMap: PropInfoMap | null,
  attrInfoMap: AttrInfoMap | null,
  main: (props: T) => () => VNode
): CustomElementConstructor {
  const customElementClass = class extends BaseElement {
    constructor() {
      super()
      const data: any = propsClass ? new propsClass() : {}
      const afterMountNotifier = createNotifier()
      const beforeUpdateNotifier = createNotifier()
      const afterUpdateNotifier = createNotifier()
      const beforeUnmountNotifier = createNotifier()
      const onceBeforeUpdateActions: Task[] = []
      const ctrl = createCtrl(this)
      ;(this as any).__ctrl = ctrl
      ;(this as any).__data = data

      let isInitialized = false
      let isMounted = false
      let hasUpdated = false
      let hasRequestedRefresh = false
      let stylesElement: HTMLElement | undefined
      let contentElement: HTMLElement | undefined
      let render: (() => VNode) | undefined

      if (propInfoMap && propInfoMap.has('ref')) {
        let componentMethods: any = null
        data.ref = {}

        Object.defineProperty(data.ref, 'current', {
          enumerable: true,
          get: () => componentMethods,

          set(methods: any) {
            if (componentMethods) {
              throw new Error('Methods can only be set once')
            } else if (methods) {
              componentMethods = methods
              Object.assign(this, componentMethods)
            }
          }
        })
      }

      this.connectedCallback = () => {
        const root = this.attachShadow({ mode: 'open' })
        stylesElement = document.createElement('span')
        contentElement = document.createElement('span')
        stylesElement.setAttribute('data-role', 'styles')
        contentElement.setAttribute('data-role', 'content')
        root.append(stylesElement, contentElement)
        refresh()
      }

      this.disconnectedCallback = () => {
        beforeUnmountNotifier.notify()
        contentElement!.innerHTML = ''
      }

      function refresh() {
        if (isMounted) {
          if (onceBeforeUpdateActions && onceBeforeUpdateActions.length) {
            try {
              onceBeforeUpdateActions.forEach((action) => action())
            } finally {
              onceBeforeUpdateActions.length = 0
            }
          }

          beforeUpdateNotifier.notify()
        }

        if (!render) {
          try {
            currentCtrl = ctrl
            render = main(data)
          } finally {
            currentCtrl = ctrl
          }
        }

        const content = render()

        // TODO
        try {
          renderer(content, contentElement!)
        } catch (e) {
          console.error(`Render error in "${ctrl.getName()}"`)
          throw e
        }

        isInitialized = true

        if (!isMounted) {
          isMounted = true
          afterMountNotifier.notify()
        } else {
          hasUpdated = true
          afterUpdateNotifier.notify()
        }
      }

      function createCtrl(host: HTMLElement): Ctrl {
        return {
          getName: () => name,
          getHost: () => host,
          isInitialized: () => isInitialized,
          isMounted: () => isMounted,
          hasUpdated: () => hasUpdated,

          refresh() {
            if (!hasRequestedRefresh) {
              hasRequestedRefresh = true

              requestAnimationFrame(() => {
                hasRequestedRefresh = false
                refresh()
              })
            }
          },

          afterMount: afterMountNotifier.subscribe,
          onceBeforeUpdate: (task) => void onceBeforeUpdateActions.push(task),
          beforeUpdate: beforeUpdateNotifier.subscribe,
          afterUpdate: afterUpdateNotifier.subscribe,
          beforeUnmount: beforeUnmountNotifier.subscribe
        }
      }
    }
  }

  propInfoMap && addPropsHandling(customElementClass, propInfoMap, attrInfoMap)

  return customElementClass
}

// === BaseElement ===================================================

class BaseElement extends HTMLElement {
  connectedCallback() {
    this.connectedCallback()
  }

  disconnectedCallback() {
    this.disconnectedCallback()
  }
}

// === tools ========================================================

function propNameToAttrName(propName: string) {
  return propName.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase()
}

function getPropConv(kind: AttrKind): PropConverter {
  return kind === String
    ? stringPropConv
    : kind === Boolean
    ? booleanPropConv
    : kind === Number
    ? numberPropConv
    : (kind as PropConverter)
}

function getPropInfoMap(
  propsClass: PropsClass,
  attrInfoMap: AttrInfoMap | null
): PropInfoMap {
  const ret: PropInfoMap = new Map()

  Object.keys(new propsClass()).forEach((propName) => {
    const attrName = propNameToAttrName(propName)

    ret.set(
      propName,
      attrInfoMap && attrInfoMap.has(attrName)
        ? attrInfoMap.get(attrName)!
        : { propName, hasAttr: false }
    )
  })

  return ret
}

function addPropsHandling(
  customElementClass: { new (): BaseElement },
  propInfoMap: PropInfoMap,
  attrInfoMap: AttrInfoMap | null
) {
  const proto = customElementClass.prototype

  ;(customElementClass as any).observedAttributes = attrInfoMap
    ? Array.from(attrInfoMap.keys())
    : []

  proto.getAttribute = function (attrName: string): string | null {
    const attrInfo = attrInfoMap && attrInfoMap.get(attrName)

    return attrInfo
      ? attrInfo.mapPropToAttr(this[attrInfo.propName])
      : HTMLElement.prototype.getAttribute.call(this, attrName)
  }

  proto.attributeChangedCallback = function (
    this: any,
    attrName: string,
    oldValue: string | null,
    value: string | null
  ) {
    if (!ignoreAttributeChange) {
      const attrInfo = attrInfoMap!.get(attrName)!

      if (typeof value === 'string') {
        this[attrInfo.propName] = attrInfo.mapAttrToProp(value)
      }
    }
  }

  for (const propInfo of propInfoMap.values()) {
    const { propName } = propInfo

    if (propName === 'ref') {
      continue
    }

    Object.defineProperty(proto, propName, {
      get: () => proto.__data[propName],

      set(this: any, value: any) {
        this.__data[propName] = value

        if (propInfo.hasAttr && propInfo.reflect) {
          try {
            ignoreAttributeChange = true

            this.setAttribute(propInfo.attrName, propInfo.mapPropToAttr(value))
          } finally {
            ignoreAttributeChange = false
          }
        }

        this.__ctrl.refresh()
      }
    })
  }
}

// === createNotifier ================================================

function createNotifier() {
  const subscribers: (() => void)[] = []

  return {
    subscribe: (subscriber: () => void) => void subscribers.push(subscriber),
    notify: () => void (subscribers.length && subscribers.forEach((it) => it()))
  }
}

// === prop converters ===============================================

const stringPropConv: PropConverter<string> = {
  mapPropToAttr: (it: string) => it,
  mapAttrToProp: (it: string) => it
}

const numberPropConv: PropConverter<number> = {
  mapPropToAttr: (it: number) => String(it),
  mapAttrToProp: (it: string) => Number.parseFloat(it)
}

const booleanPropConv: PropConverter<boolean> = {
  mapPropToAttr: (it: boolean) => (it ? 'true' : 'false'),
  mapAttrToProp: (it: string) => (it === 'true' ? true : false)
}

// === h ==============================================================

function h(
  type: string,
  props?: Props | null, // TODO!!!
  ...children: VNode[]
): VElement

function h<P extends Props>(
  type: Component<P>,
  props?: Partial<P> | null,
  ...children: VNode[]
): VElement

function h(type: string | Component<any>, props?: Props | null): VElement {
  const argc = arguments.length
  const tagName = typeof type === 'function' ? (type as any).tagName : type

  if (process.env.NODE_ENV === ('development' as string)) {
    if (typeof tagName !== 'string') {
      throw new Error('[h] First argument must be a string or a component')
    }
  }

  const children = argc > 2 ? [] : EMPTY_ARR

  if (argc > 2) {
    for (let i = 2; i < argc; ++i) {
      const child = arguments[i]

      if (!Array.isArray(child)) {
        children.push(asVNode(child))
      } else {
        for (let j = 0; j < child.length; ++j) {
          children.push(asVNode(child[j]))
        }
      }
    }
  }

  const ret: any = createElement(tagName, props || EMPTY_OBJ, children)
  ret.isVElement = true
  return ret
}

// === render ========================================================

export function render(content: VElement, container: Element | string) {
  if (process.env.NODE_ENV === ('development' as string)) {
    if (content !== null && (!content || content.isVElement !== true)) {
      throw new TypeError(
        'First argument "content" of function "render" must be a' +
          ' virtual element or null'
      )
    }

    if (!container || (typeof container !== 'string' && !container.tagName)) {
      throw new TypeError(
        'Second argument "container" of function "render" must either be a DOM' +
          ' element or selector string for the DOM element'
      )
    }
  }

  const target =
    typeof container === 'string'
      ? document.querySelector(container)
      : container

  if (!target) {
    throw new TypeError(`Could not find container DOM element "${container}"`)
  }

  target.innerHTML = ''

  if (content !== null) {
    renderer(content, target)
  }
}

// === helpers =======================================================

export const renderer = (content: VNode, target: Element) => {
  if (target.hasChildNodes()) {
    patch(target.firstChild, content)
  } else {
    const newTarget = document.createElement('span')

    target.append(newTarget)
    patch(newTarget, content)
  }
}

function asVNode(x: any): any {
  return typeof x === 'number' || typeof x === 'string' ? text(x, null) : x
}
