let less = require('less')
function loader(source) {
  let cssStr = ''
  // console.log(JSON.stringify(source))
  less.render(source, function (err, css) {
    cssStr = css.css
  })
  cssStr = cssStr.replace(/\n/g, '\\n')
  return cssStr
}
module.exports = loader
