/*
    JSON to Crystal
    Copyright © 2018 Christopher Watson

    This script converts a JSON input into a series of Crystal classes with
    JSON mappings defined.
*/

const _ = require('lodash')
require('./string')
require('./array')

const noop = () => {}

class JsonParseError extends Error {
  constructor() {
    super('Failed to parse JSON')
  }
}

class Util {

  static crystalType (val) {
    if (val === null)
      return 'JSON::Any'

    switch (typeof val) {
      case 'string':
        return 'String'
      case 'number':
        if (val % 1 === 0) {
          // Regular integer
          if (val > -2147483648 && val < 2147483647)
            return 'Int32'
          else
            return 'Int64'
        } else {
          // Float
          return 'Float64'
        }
      case 'boolean':
        return 'Bool'
      case 'object':
        if (_.isArray(val))
          return 'array'
        return 'class'
      default:
        return 'JSON::Any'
    }
  }

  static formatKey (str) {
    if (!str) {
      return ''
    } else if (str.match(/^\d+$/)) {
      // Identifier is a number
      str = 'num' + str
    } else if (str.charAt(0).match(/\d/)) {
      // First character is a number
      let numbers = {
        '0': 'zero_', '1': 'one_', '2': 'two_', '3': 'three_',
        '4': 'four_', '5': 'five_', '6': 'six_', '7': 'seven_',
        '8': 'eight_', '9': 'nine_'
      }
      str = numbers[str.charAt(0)] + str.substr(1)
    }
    return _.snakeCase(str)
  }

}

class CrystalNamedTuple {

  constructor (properties = {}, options = {}) {
    this.properties = properties
    this.options = _.defaultsDeep(options, this._defaultOptions)
  }

  toString () {
    let pairs = Object.keys(this.properties)
      .map(k => [this.options.transformKeys(k), Util.crystalType(this.properties[k])])
    let props = pairs.reduce((prev, cur, idx, arr) => {
      let str = cur.join(': ')
      if (idx < pairs.length - 1)
        str += ', '
      return prev + str
    }, '')
    return `NamedTuple(${props})`
  }

  get _defaultOptions () {
    return { transformKeys: Util.formatKey }
  }
}

class CrystalArray {

  constructor (arr = [], options = {}) {
    this.rawArr = arr
    this.options = _.defaultsDeep(options, this._defaultOptions)
  }

  toString () {
    let types = this.rawArr
      .map(v => Util.crystalType(v))
      .map((v, i) => {
        if (v === 'class') {
          const nt = new CrystalNamedTuple(this.rawArr[i], this.options)
          return nt.toString()
        } else if (v === 'array') {
          const ary = new CrystalArray(this.rawArr[i], this.options)
          return ary.toString()
        }
        return v
      })

    let unique = _.uniq(types)
    if (unique.length === 0)
      unique.push("JSON::Any")
    let union = unique.join(" | ")
    return `Array(${union})`
  }

  get _defaultOptions () {
    return {}
  }

}

class CrystalClass {

  constructor (
    properties = {},
    name = 'AutoGenerated',
    options = {}) {
    this.name = this._formatClassName(name)
    this.properties = properties
    this.subclasses = []
    this.options = _.defaultsDeep(options, this._defaultOptions)
    this.classString = ''
  }

  parse () {
    let indentLevel = this.options.baseIndent
    let arr = []

    // Class definition start
    arr.push(this._indent(`class ${this.name}`, indentLevel))

    this._spacing(arr)

    const keys = Object.keys(this.properties)
    if (keys.length > 0) {

      // JSON mapping start
      arr.push(this._indent('JSON.mapping({', ++indentLevel))

      // Increase the indent level for items
      indentLevel++

      // Loop over the keys and add each one to our mapping
      let items = keys
        .filter(_.negate(this.options.ignoreKeys))
        .map((x, i) => {
          let key = this.options.transformKeys.call(this, x)
          let type = Util.crystalType(this.properties[x])

          if (type === 'class') {
            const klass = new CrystalClass(this.properties[x], key, { baseIndent: indentLevel - 1 })
            this.subclasses.push(klass)
            type = klass.name
          } else if (type === 'array') {
            const ary = new CrystalArray(this.properties[x], this.options)
            type = ary.toString()
          }

          let str = `${key}: { `
          if (key !== x)
            str += `key: "${x}", `
          if (this.options.allNilable || this.options.nilable(x, key))
            str += `nilable: true, `
          str += `type: ${type} }`
          if (i < keys.length - 1)
            str += ','
          return this._indent(str, indentLevel)
        })
      arr = arr.concat(items)

      // JSON mapping end
      arr.push(this._indent('})', --indentLevel))

      this._spacing(arr)

      // Add subclasses into the mix
      arr = arr.concat(this.subclasses.map(sub => sub.toString()))

      // Class definition end
      arr.push(this._indent('end', --indentLevel))

      this._spacing(arr)

      return arr.join('\n')
    }
  }

  toString () {
    if (this.classString)
      return this.classString
    return this.classString = this.parse()
  }

  _indent (str, level = this.options.baseIndent) {
    if (level <= 0)
      return str
    return '  '.repeat(level) + str
  }

  _formatClassName (name) {
    return _.upperFirst(_.camelCase(name))
  }

  _spacing (arr) {
    if (this.options.compact)
      return
    arr.push('')
  }

  get _defaultOptions () {
    return {
      baseIndent: 0,
      ignoreKeys: noop,
      ignoreValues: noop,
      transformKeys: Util.formatKey,
      allNilable: false,
      nilable: noop,
      compact: false
    }
  }
}

class JsonToCrystal {

  constructor(options = {}) {
    this.options = _.defaultsDeep(options, this._defaultOptions)
  }

  parse(scope) {
    if (_.isString(scope)) {
      const data = JSON.parse(scope.replace(/\.0/g, '.1'))
      return this.parse(data)
    } else if (_.isArray(scope)) {
      const arr = new CrystalArray(scope)
      return `alias AutoGenerated = ${arr.toString()}`
    } else if (_.isPlainObject(scope)) {
      const cls = new CrystalClass(scope, this.options.baseClassName, this.options)
      return cls.toString()
    }
    throw new Error(`Unsupported data type ${typeof scope}.`)
  }

  get _defaultOptions () {
    return {
      baseClassName: 'AutoGenerated',
      baseIndent: 0,
      ignoreKeys: noop,
      ignoreValues: noop,
      transformKeys: Util.formatKey,
      allNilable: false,
      nilable: noop,
      compact: false
    }
  }
}

module.exports = JsonToCrystal

const j2c = new JsonToCrystal()
console.log(j2c.parse(`
{
  "login": "octocat",
  "id": 1,
  "avatar_url": "https://github.com/images/error/octocat_happy.gif",
  "gravatar_id": "",
  "url": "https://api.github.com/users/octocat",
  "html_url": "https://github.com/octocat",
  "followers_url": "https://api.github.com/users/octocat/followers",
  "following_url": "https://api.github.com/users/octocat/following{/other_user}",
  "gists_url": "https://api.github.com/users/octocat/gists{/gist_id}",
  "starred_url": "https://api.github.com/users/octocat/starred{/owner}{/repo}",
  "subscriptions_url": "https://api.github.com/users/octocat/subscriptions",
  "organizations_url": "https://api.github.com/users/octocat/orgs",
  "repos_url": "https://api.github.com/users/octocat/repos",
  "events_url": "https://api.github.com/users/octocat/events{/privacy}",
  "received_events_url": "https://api.github.com/users/octocat/received_events",
  "type": "User",
  "site_admin": false,
  "name": "monalisa octocat",
  "company": "GitHub",
  "blog": "https://github.com/blog",
  "location": "San Francisco",
  "email": "octocat@github.com",
  "hireable": false,
  "bio": "There once was...",
  "public_repos": 2,
  "public_gists": 1,
  "followers": 20,
  "following": 0,
  "created_at": "2008-01-14T04:33:35Z",
  "updated_at": "2008-01-14T04:33:35Z",
  "total_private_repos": 100,
  "owned_private_repos": 100,
  "private_gists": 81,
  "disk_usage": 10000,
  "collaborators": 8,
  "two_factor_authentication": true,
  "plan": {
    "name": "Medium",
    "space": 400,
    "private_repos": 20,
    "collaborators": 0
  },
  "node_id": "MDQ6VXNlcjU4MzIzMQ=="
}`))