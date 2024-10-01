/* global jest */
jest.autoMockOff()
const defineTest = require('jscodeshift/dist/testUtils').defineTest
const { readdirSync } = require('fs')
const { join } = require('path')

const testFileRegex = /\.input\.(j|t)sx?$/

const fixtureDir = 'next-async-request-api-dynamic-apis'
const transformName = 'next-async-request-api'
const fixtureDirPath = join(__dirname, '..', '__testfixtures__', fixtureDir)
const fixtures = readdirSync(fixtureDirPath)
  .filter(file => testFileRegex.test(file))
  

for (const file of fixtures) {
  const isTsx = file.endsWith('.tsx')
  const fixture = file.replace(testFileRegex, '')

  const prefix = `${fixtureDir}/${fixture}`;
  defineTest(__dirname, transformName, null, prefix, {
    parser: isTsx ? 'tsx' : 'babel',
  });
}
