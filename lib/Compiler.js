let path = require('path')
let fs = require('fs')
let babylon = require('babylon')
let traverse = require('@babel/traverse').default
let t = require('@babel/types')
let generator = require('@babel/generator').default
let ejs = require('ejs')
let { SyncHook } = require('tapable')
// babylon 将源码转换成AST
// @babel/traverse 遍历节点
// @babel/types 替换节点
// @babel/generator 替换好后生成节点

class Compiler {
  constructor(config) {
    this.config = config
    // 保存入口文件的路径
    this.entryId // ./src/index.js
    // 保存所有模块依赖
    this.modules = {}
    this.entry = config.entry // 入口
    // 工作路径
    this.root = process.cwd() // 被执行js文件所在的文件夹目录

    this.hooks = {
      entryOption: new SyncHook(),
      compile: new SyncHook(),
      afterCompile: new SyncHook(),
      afterPlugins: new SyncHook(),
      run: new SyncHook(),
      emit: new SyncHook(),
      done: new SyncHook(),
    }
    // 如果传递了plugins参数
    let plugins = this.config.plugins
    if (Array.isArray(plugins)) {
      plugins.forEach((plugin) => {
        plugin.apply(this)
      })
    }
    this.hooks.afterPlugins.call()
  }
  getSource(modulePath) {
    // ./index.less
    let rules = this.config.module.rules
    let content = fs.readFileSync(modulePath, 'utf-8')
    for (let i = 0; i < rules.length; i++) {
      // 拿到每个规则来处理
      let rule = rules[i]
      let { test, use } = rule
      let len = use.length - 1 // 取use最后一项
      if (test.test(modulePath)) {
        function normalLoader() {
          // 这个模块需要通过Loader来转换
          let loaderPath = use[len--]
          // 获取对应的loadre函数
          let loader = require(loaderPath)
          content = loader(content)
          if (len >= 0) {
            normalLoader()
          }
        }
        normalLoader()
      }
    }

    return content
  }
  // 解析源码
  parse(source, parentPath) {
    // AST解析语法树
    let ast = babylon.parse(source)
    let dependencies = [] // 依赖数组
    traverse(ast, {
      CallExpression(node) {
        // a() require()
        // 调用表达式
        let n = node.node
        if (n.callee.name === 'require') {
          n.callee.name = '__webpack_require__'
          let moduleName = n.arguments[0].value // 取到模块应用名字
          moduleName = moduleName + (path.extname(moduleName) ? '' : '.js') // 拼接全路径和后缀
          moduleName = './' + path.join(parentPath, moduleName) // "./src/a.js"
          dependencies.push(moduleName)
          n.arguments = [t.stringLiteral(moduleName)]
        }
      },
    })
    let sourceCode = generator(ast).code
    return { sourceCode, dependencies }
  }
  // 构建模块
  buildMoudle(modulePath, isEntry) {
    // 模块内容
    let source = this.getSource(modulePath)
    // 模块ID（相对路径作为模块ID） modulePath = modulePath - this.root
    let moduleName = './' + path.relative(this.root, modulePath)

    if (isEntry) {
      this.entryId = moduleName // 保存入口的名字
    }

    // 解析需要把source源码进行改造 返回一个依赖列表
    let { sourceCode, dependencies } = this.parse(
      source,
      path.dirname(moduleName)
    ) // ./src
    // console.log(sourceCode, dependencies)

    // 把相对路径和模块中的内容 对应起来
    this.modules[moduleName] = sourceCode

    // 递归依赖项
    dependencies.forEach((dep) => {
      // 辅模块递归加载
      this.buildMoudle(path.join(this.root, dep), false)
    })
  }
  emitFile() {
    // 发射文件
    // AST => JS
    // 拿到输出的路径
    let output = path.join(this.config.output.path, this.config.output.filename)
    let templateStr = this.getSource(path.join(__dirname, 'main.ejs'))
    let code = ejs.render(templateStr, {
      entryId: this.entryId,
      modules: this.modules,
    })
    this.assets = {}
    // 资源中 路径对应的代码
    this.assets[output] = code
    fs.writeFileSync(output, this.assets[output])
  }
  run() {
    this.hooks.run.call()
    this.hooks.compile.call()
    // 解析依赖
    // 创建模块的依赖关系
    this.buildMoudle(path.resolve(this.root, this.entry), true)
    this.hooks.afterCompile.call()
    // 发射文件 打包后的文件
    this.emitFile()
    this.hooks.emit.call()
    this.hooks.done.call()
  }
}
module.exports = Compiler
