// CommonJS on purpose, same reason as electron/main.cjs: package.json sets
// "type": "module", which would make a plain .js file load as ESM here.
const qrcodeTerminal = require('qrcode-terminal')

const url = process.argv[2]
if (!url) {
  console.error('Usage: node print-qr.cjs <url>')
  process.exit(1)
}

qrcodeTerminal.generate(url, { small: true }, (qr) => {
  console.log(qr)
})
