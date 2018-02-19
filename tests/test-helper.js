const fs = require('fs')
const path = require('path')
const _ = require('lodash')

const fetchCase = (name) => {
    const json = require(path.join(__dirname, 'cases', name + '.json'))
    const crystal = fs.readFileSync(path.join(__dirname, 'cases', name + '.cr'), 'utf8')
    return { json: json, crystal: crystal }
}

module.exports = {
    fetchCase
}