function isFunction(func) {
  return (func && typeof func === 'function')
}

function hasProp(obj, key) {
  if (Object.prototype.hasOwnProperty.call(obj, key)) return true // Some properties with '.' could fail, so we do a quick check
  const keyParts = key.split('.')
  return !!obj && (
    keyParts.length > 1
      ? hasProp(obj[key.split('.')[0]], keyParts.slice(1).join('.'))
      : Object.prototype.hasOwnProperty.call(obj, key)
  )
}

function getProp(obj, key) {
  if (!!obj && Object.prototype.hasOwnProperty.call(obj, key)) return obj[key] // Some properties with '.' could fail, so we do a quick check
  if (key.includes('.')) {
    const keyParts = key.split('.')
    return getProp(obj[keyParts[0]], keyParts.slice(1).join('.'))
  }
}

function setProp(obj, key, value) {
  if (!key.includes('.')) {
    obj[key] = value
    return obj;
  }

  const keyParts = key.split('.')
  if (!obj[keyParts[0]]) obj[keyParts[0]] = {}
  setProp(obj[keyParts[0]], keyParts.slice(1).join('.'), value)
}

module.exports = {
  isFunction,
  hasProp,
  getProp,
  setProp
}
