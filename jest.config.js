module.exports = {
  testEnvironment: "node",
  verbose: true,
  rootDir: "test/dist",
  resolver: undefined,
  moduleNameMapper: {
    '^key-index$': '<rootDir>/../../node_modules/.pnpm/key-index@1.7.0/node_modules/key-index/app/dist/cjs/keyIndex.js',
    '^get-class-function-names$': '<rootDir>/../../node_modules/.pnpm/get-class-function-names@1.2.0/node_modules/get-class-function-names/app/dist/cjs/getClassFunctionNames.js'
  }
} 
