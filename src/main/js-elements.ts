import {
  createAdaption,
  prop,
  provision,
  FunctionDefineElement,
  Methods
} from './core/core'

import { h as createElement, text, patch } from './libs/superfine'

const EMPTY_OBJ = {}
/*
function h(type: any, props: any) {
  // TODO
  for (var vnode, rest = [], children = [], i = arguments.length; i-- > 2; ) {
    rest.push(arguments[i])
  }

  while (rest.length > 0) {
    if (Array.isArray((vnode = rest.pop()))) {
      let i: any // TODO
      for (i = vnode.length; i-- > 0; ) {
        // TODO
        rest.push(vnode[i])
      }
    } else if (vnode === false || vnode === true || vnode == null) {
    } else {
      children.push(typeof vnode === 'object' ? vnode : createTextVNode(vnode))
    }
  }

  props = props || {}

  return typeof name === 'function'
    ? type(props, children)
    : createVNode(name, props, children, null, props.key)
}
*/

function h(
  type: string | Component,
  props?: Props | null | undefined,
  ...children: VNode[]
): VNode

function h(t: string | Component, p?: null | Props | VNode): VNode {
  const args = arguments
  const argc = args.length
  const type = typeof t === 'function' ? (t as any)['js-elements:type'] : t
  const props = p && typeof p === 'object' && !p.isVElement ? p : EMPTY_OBJ

  const firstChildIdx =
    p === undefined || p === null || props !== EMPTY_OBJ ? 2 : 1

  let children = null

  if (firstChildIdx === argc - 1) {
    children = args[firstChildIdx]
  } else if (firstChildIdx < argc - 1) {
    children = []

    for (let i = firstChildIdx; i < argc; ++i) {
      const child = args[i]

      if (child !== undefined && child !== null && typeof child !== 'boolean') {
        if (typeof child !== 'object') {
          children.push(text(child))
        } else {
          children.push(child)
        }
      }
    }
  }

  const ret: any = createElement(type, props, children)
  ret.isVElement = true
  return ret
}

// === exports =======================================================

export { component, provision, prop, h, Html, Svg, VElement, VNode }

// ===================================================================

type Key = string | number
type Props = Record<string, any> & { key?: never; children?: VNode }
type VElement<T extends Props = Props> = any // TODO !!!!!!!!

type VNode =
  | undefined
  | null
  | boolean
  | number
  | string
  | VElement
  | Iterable<VNode>

type Component<P extends Props = {}, M extends Methods = {}> = (
  props?: P & { key?: Key }
) => VNode // TODO

// === defineElement =================================================

const defineElement = createAdaption(superfineRenderer)

// === render ========================================================

function render(content: VElement, container: Element | string) {
  if (content !== null && (!content || content.kind !== 'virtual-element')) {
    throw new TypeError(
      'First argument "content" of function "render" must be a virtual element or null'
    )
  }

  if (!container || (typeof container !== 'string' && !container.tagName)) {
    throw new TypeError(
      'Second argument "container" of funtion "render" must either be a DOM element or selector string for the DOM element'
    )
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
    patch(content, target)
  }
}

// === component ======================================================

function superfineRenderer(content: VElement, target: Element) {
  if (target.hasChildNodes()) {
    patch(target.firstChild, content)
  } else {
    const newTarget = document.createElement('span')

    target.appendChild(newTarget)
    patch(newTarget, content)
  }
}

const component: FunctionDefineElement<VNode, Component<any>> = (
  name: string,
  config: any
) => {
  defineElement(name, config)

  const ret = h.bind(null, name)

  Object.defineProperty(ret, 'js-elements:type', {
    value: name
  })

  return ret
}

// === Html + Svg ====================================================

const Html = createDomFactoryObject()
const Svg = createDomFactoryObject()

function createDomFactoryObject() {
  const handler = {
    get(target: object, propName: string) {
      const factory = h.bind(null, propName)
      ret[propName] = factory
      return factory
    }

    // TODO: other handler methods?
  }

  const ret: any = new Proxy({}, handler)
  return ret
}
