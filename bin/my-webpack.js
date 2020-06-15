#! /usr/bin/env node

console.log('start')
// 1） 找到当前执行名的路径 拿到webpack.config.js
let path = require('path')

// config配置文件
let config = require(path.resolve('webpack.config.js'))

let Compiler = require('../lib/Compiler.js')
let compiler = new Compiler(config)

// 标识运行编译
compiler.run()
// console.log(__dirname, process.cwd())
