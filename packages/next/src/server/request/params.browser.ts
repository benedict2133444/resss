import type { Params } from './params'

import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'
import { InvariantError } from '../../shared/lib/invariant-error'
import { describeStringPropertyAccess } from './utils'

export function createRenderParamsFromClient(underlyingParams: Params) {
  if (process.env.NODE_ENV === 'development') {
    return makeDynamicallyTrackedExoticParamsWithDevWarnings(underlyingParams)
  } else {
    return makeUntrackedExoticParams(underlyingParams)
  }
}

interface CacheLifetime {}
const CachedParams = new WeakMap<CacheLifetime, Promise<Params>>()

function makeUntrackedExoticParams(underlyingParams: Params): Promise<Params> {
  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  const promise = Promise.resolve(underlyingParams)
  CachedParams.set(underlyingParams, promise)

  Object.defineProperties(promise, {
    status: {
      value: 'fulfilled',
      writable: true,
    },
    value: {
      value: underlyingParams,
      writable: true,
    },
  })

  Object.keys(underlyingParams).forEach((prop) => {
    switch (prop) {
      case 'then':
      case 'value':
      case 'status': {
        // These properties cannot be shadowed with a search param because they
        // are necessary for ReactPromise's to work correctly with `use`
        break
      }
      default: {
        ;(promise as any)[prop] = underlyingParams[prop]
      }
    }
  })

  return promise
}

function makeDynamicallyTrackedExoticParamsWithDevWarnings(
  underlyingParams: Params
): Promise<Params> {
  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  const promise = Promise.resolve(underlyingParams)

  Object.defineProperties(promise, {
    status: {
      value: 'fulfilled',
      writable: true,
    },
    value: {
      value: underlyingParams,
      writable: true,
    },
  })

  const proxiedProperties = new Set<string>()
  const unproxiedProperties: Array<string> = []

  Object.keys(underlyingParams).forEach((prop) => {
    switch (prop) {
      case 'then':
      case 'value':
      case 'status': {
        // These properties cannot be shadowed with a search param because they
        // are necessary for ReactPromise's to work correctly with `use`
        unproxiedProperties.push(prop)
        break
      }
      default: {
        proxiedProperties.add(prop)
        ;(promise as any)[prop] = underlyingParams[prop]
      }
    }
  })

  const proxiedPromise = new Proxy(promise, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        if (
          // We are accessing a property that was proxied to the promise instance
          proxiedProperties.has(prop) ||
          // We are accessing a property that doesn't exist on the promise nor the underlying
          Reflect.has(target, prop) === false
        ) {
          const expression = describeStringPropertyAccess('params', prop)
          warnForSyncAccess(expression)
        }
      }
      return ReflectAdapter.get(target, prop, receiver)
    },
    ownKeys(target) {
      warnForEnumeration(unproxiedProperties)
      return Reflect.ownKeys(target)
    },
  })

  CachedParams.set(underlyingParams, proxiedPromise)
  return proxiedPromise
}

function warnForSyncAccess(expression: string) {
  console.error(
    `A param property was accessed directly with ${expression}. \`params\` is now a Promise and should be awaited before accessing properties of the underlying params object. In this version of Next.js direct access to param properties is still supported to facilitate migration but in a future version you will be required to await \`params\`. If this use is inside an async function await it. If this use is inside a synchronous function then convert the function to async or await it from outside this function and pass the result in.`
  )
}

function warnForEnumeration(missingProperties: Array<string>) {
  if (missingProperties.length) {
    const describedMissingProperties =
      describeListOfPropertyNames(missingProperties)
    console.error(
      `params are being enumerated incompletely with \`{...params}\`, \`Object.keys(params)\`, or similar. The following properties were not copied: ${describedMissingProperties}. \`params\` is now a Promise, however in the current version of Next.js direct access to the underlying params object is still supported to facilitate migration to the new type. param names that conflict with Promise properties cannot be accessed directly and must be accessed by first awaiting the \`params\` promise.`
    )
  } else {
    console.error(
      `params are being enumerated with \`{...params}\`, \`Object.keys(params)\`, or similar. \`params\` is now a Promise, however in the current version of Next.js direct access to the underlying params object is still supported to facilitate migration to the new type. You should update your code to await \`params\` before accessing its properties.`
    )
  }
}

function describeListOfPropertyNames(properties: Array<string>) {
  switch (properties.length) {
    case 0:
      throw new InvariantError(
        'Expected describeListOfPropertyNames to be called with a non-empty list of strings.'
      )
    case 1:
      return `\`${properties[0]}\``
    case 2:
      return `\`${properties[0]}\` and \`${properties[1]}\``
    default: {
      let description = ''
      for (let i = 0; i < properties.length - 1; i++) {
        description += `\`${properties[i]}\`, `
      }
      description += `, and \`${properties[properties.length - 1]}\``
      return description
    }
  }
}
