#!/usr/bin/env node

const chalk = require('chalk')

// Only show message for global installations
const isGlobalInstall = process.env.npm_config_global === 'true'

if (isGlobalInstall) {
  console.log('')
  console.log(chalk.green('🎉 Shov CLI installed successfully!'))
  console.log('')
  console.log(chalk.bold('Get started:'))
  console.log(`  ${chalk.cyan('shov new')}          Create your first project`)
  console.log(`  ${chalk.cyan('shov set hello world')} Store some data`)
  console.log(`  ${chalk.cyan('shov get hello')}     Retrieve data`)
  console.log('')
  console.log(chalk.gray('Documentation: https://shov.com/docs'))
  console.log('')
} else {
  // Local install - show npx instructions
  console.log('')
  console.log(chalk.blue('📦 Shov CLI installed locally.'))
  console.log(`Run ${chalk.cyan('npx shov new')} to create your first project!`)
  console.log('')
}
