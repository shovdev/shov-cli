const fs = require('fs-extra')
const path = require('path')
const os = require('os')

class ShovConfig {
  constructor() {
    this.globalConfigDir = path.join(os.homedir(), '.shov')
    this.globalConfigFile = path.join(this.globalConfigDir, 'config.json')
    this.localConfigFile = '.shov'
  }

  // Load global configuration
  async loadGlobalConfig() {
    try {
      if (await fs.pathExists(this.globalConfigFile)) {
        return await fs.readJSON(this.globalConfigFile)
      }
    } catch (error) {
      // Config file doesn't exist or is invalid
    }
    return {}
  }

  // Save global configuration
  async saveGlobalConfig(config) {
    await fs.ensureDir(this.globalConfigDir)
    await fs.writeJSON(this.globalConfigFile, config, { spaces: 2 })
  }

  // Load local project configuration
  async loadLocalConfig() {
    try {
      const configPath = path.join(process.cwd(), this.localConfigFile)
      if (await fs.pathExists(configPath)) {
        return await fs.readJSON(configPath)
      }
    } catch (error) {
      // Config file doesn't exist or is invalid
    }
    return {}
  }

  // Save local project configuration
  async saveLocalConfig(config) {
    const configPath = path.join(process.cwd(), this.localConfigFile)
    await fs.writeJSON(configPath, config, { spaces: 2 })
  }

  // Get merged configuration (local overrides global)
  async getConfig() {
    const globalConfig = await this.loadGlobalConfig()
    const localConfig = await this.loadLocalConfig()
    
    return {
      ...globalConfig,
      ...localConfig
    }
  }

  // Set global default email
  async setGlobalEmail(email) {
    const config = await this.loadGlobalConfig()
    config.email = email
    await this.saveGlobalConfig(config)
  }

  // Get default email
  async getDefaultEmail() {
    const config = await this.getConfig()
    return config.email
  }

  // Add project to global config
  async addProject(projectName, apiKey, email) {
    const config = await this.loadGlobalConfig()
    
    if (!config.projects) {
      config.projects = {}
    }
    
    config.projects[projectName] = {
      apiKey,
      email,
      createdAt: new Date().toISOString()
    }
    
    await this.saveGlobalConfig(config)
  }

  // Get project from global config
  async getProject(projectName) {
    const config = await this.loadGlobalConfig()
    return config.projects?.[projectName] || null
  }

  // List all projects
  async listProjects() {
    const config = await this.loadGlobalConfig()
    return config.projects || {}
  }

  // Remove project from global config
  async removeProject(projectName) {
    const config = await this.loadGlobalConfig()
    
    if (config.projects && config.projects[projectName]) {
      delete config.projects[projectName]
      await this.saveGlobalConfig(config)
      return true
    }
    
    return false
  }

  // Check if we're in a Shov project directory
  async isInProject() {
    const configPath = path.join(process.cwd(), this.localConfigFile)
    return await fs.pathExists(configPath)
  }

  // Auto-detect project configuration
  async detectProject() {
    // First try local config
    const localConfig = await this.loadLocalConfig()
    if (localConfig.project && localConfig.apiKey) {
      return {
        projectName: localConfig.project,
        apiKey: localConfig.apiKey,
        source: 'local'
      }
    }

    // Try environment variables
    if (process.env.SHOV_PROJECT && process.env.SHOV_API_KEY) {
      return {
        projectName: process.env.SHOV_PROJECT,
        apiKey: process.env.SHOV_API_KEY,
        source: 'env'
      }
    }

    // Try to infer from directory name and global config
    const currentDir = path.basename(process.cwd())
    const globalConfig = await this.loadGlobalConfig()
    
    if (globalConfig.projects && globalConfig.projects[currentDir]) {
      return {
        projectName: currentDir,
        apiKey: globalConfig.projects[currentDir].apiKey,
        source: 'global'
      }
    }

    return null
  }
}

module.exports = { ShovConfig }
