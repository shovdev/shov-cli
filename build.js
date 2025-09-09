const fs = require('fs-extra')
const path = require('path')

async function build() {
  console.log('Building Shov CLI...')
  
  // Ensure dist directory exists
  await fs.ensureDir('dist')
  
  // Copy source files to dist
  await fs.copy('src', 'dist')
  
  console.log('✅ Build complete!')
}

build().catch(console.error)
