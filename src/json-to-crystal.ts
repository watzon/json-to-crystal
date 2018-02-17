/*
    JSON to Crystal
    Copyright © 2018 Christopher Watson

    This script converts a JSON input into a series of Crystal classes with
    JSON mappings defined.
*/

import _ from 'lodash'
import './string'

interface String {
  repeat: (str: string) => string;
  startsWith: (str: string) => string;
  endsWith: (str: string) => string;
  includes: (str: string) => string;
}

class JsonParseError extends Error {
  constructor() {
    super('Failed to parse JSON')
  }
}

class JsonToCrystal {

  public baseClass: string
  public allNilable: boolean

  constructor({
    baseClass  = 'AutoGenerated',
    allNilable = false
  } = {}) {
    this.baseClass = baseClass
    this.allNilable = allNilable
  }

  public parse(scope: string) {
    const data = JSON.parse(scope.replace(/\.0/g, '.1'))
    return this.parseScope(data)
  }

  public parseScope (scope: Object): string {
    let crystal = ''

    if (_.isObjectLike(scope) && !_.isNull(scope)) {
      if (_.isArray(scope)) {
        // Array
        crystal += this.arrayType(scope)
      } else {
        // Class, NamedTuple, or Hash
        crystal += this.parseClass(this.baseClass, scope)
      }
    } else {
      // Non-key/value type
      crystal += this.crystalType(scope)
    }

    return crystal
  }

  public parseClass(name: string, scope: Object, indentLevel: number = 0): string {
    if (name.charAt(0).match(/[a-z]/))
      name = _.upperFirst(_.camelCase(name))

    let subclasses = {}
    let str = ''
    
    str = this.indent(indentLevel)
    str += `class ${name}\n\n`

    str += this.indent(++indentLevel)
    str += 'JSON.mapping({\n'

    ++indentLevel

    let keys = Object.keys(scope)
    for (let key of keys) {
      let formattedKey = this.format(key)
      str += this.indent(indentLevel)
      str += formattedKey + ": { "

      if (key !== formattedKey) {
        // Key was changed
        str += `key: "${key}", `
      }

      if (this.allNilable) {
        str += 'nilable: true, '
      }
      
      let kind = this.crystalType(scope[key])
      if (kind === 'class') {
        subclasses[key] = scope[key]
        str += `type: ${key} },\n`
      } else {
        str += `type: ${this.parseScope(scope[key])} },\n`
      }
    }
    
    str += this.indent(--indentLevel)
    str += '})\n\n'

    str += Object.keys(subclasses)
      .map(sc => this.parseClass(sc, subclasses[sc], indentLevel))
      .join("\n\n")

    str += this.indent(--indentLevel)
    str += "end\n"

    return str
  }

  private indent (tabs: number): string {
    if (tabs <= 0)
      return ''
    return '  '.repeat(tabs)
  }

  private format (str?: string): string {
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

  private crystalType (val: any): string {
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
          return this.arrayType(val)
        return 'class'
      default:
        return 'JSON::Any'
    }
  }

  public arrayType (arr: Array<any>): string {
    let types: Array<string> = arr.map(v => this.parseScope(v))
    let unique: Array<string> = _.uniq(types)
    if (unique.length === 0)
      unique.push("JSON::Any")
    let union: string = unique.join(" | ")
    return `Array(${union})`
  }

}

export default JsonToCrystal