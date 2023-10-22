import { merge } from "webpack-merge"
import commonMod from "./rollup.node.common.config.mjs"


export default merge(commonMod, {
  input: 'app/src/moreProms.ts',
  output: {
    file: 'app/dist/cjs/moreProms.js',
    format: 'cjs'
  },
})