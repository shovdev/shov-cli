const fs = require('fs')
const path = require('path')
const chalk = require('chalk')
const { ShovConfig } = require('./config')

// Dynamic import for node-fetch
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args))

class ShovCLI {
  constructor(options = {}) {
    // Public CLI only uses production
    this.apiUrl = 'https://shov.com'
    this.config = new ShovConfig()
  }

  // Helper method to handle API errors with better messaging
  handleApiError(response, data, spinner, operation = 'Operation') {
    if (response.status === 429) {
      // Rate limiting
      const retryAfter = response.headers.get('Retry-After') || data.retryAfter
      const waitTime = retryAfter ? Math.ceil(retryAfter / 60) : 60 // Convert to minutes
      
      spinner.fail(`Rate limit exceeded: ${data.error || 'Too many requests'}`)
      console.log(chalk.yellow(`⏱️  Please wait ${waitTime} minute${waitTime > 1 ? 's' : ''} before trying again.`))
      
      if (data.error && data.error.includes('email')) {
        console.log(chalk.blue('💡 Tip: You can try using a different email address or wait for the limit to reset.'))
      }
      return
    }
    
    if (response.status === 400 && data.error) {
      // Validation errors (like email format, aliases, etc.)
      spinner.fail(`${operation} failed: ${data.error}`)
      
      if (data.error.includes('alias') || data.error.includes('+')) {
        console.log(chalk.blue('💡 Tip: Use your main email address without any aliases (no + symbols).'))
      } else if (data.error.includes('disposable')) {
        console.log(chalk.blue('💡 Tip: Please use a permanent email address instead of a temporary one.'))
      } else if (data.error.includes('Invalid email format')) {
        console.log(chalk.blue('💡 Tip: Please enter a valid email address (e.g., user@example.com).'))
      }
      return
    }
    
    // Generic error handling
    spinner.fail(`${operation} failed: ${data.error || response.statusText}`)
  }

  async apiCall(path, body, apiKey, options = {}, method = 'POST') {
    const { verbose } = options;
    const url = `${this.apiUrl}/api${path}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };

    if (verbose) {
      console.log(chalk.gray(`> POST ${url}`));
      console.log(chalk.gray(`> Payload: ${JSON.stringify(body, null, 2)}`));
    }

    const response = await fetch(url, {
      method: method,
      headers,
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.error || `API request failed with status ${response.status}`);
      error.response = data; // Attach full response to error object
      throw error;
    }

    return data;
  }

  // Get project configuration (from options, local config, env, or global config)
  async getProjectConfig(options = {}) {
    // Check command line options first
    if (options.project && options.key) {
      return {
        projectName: options.project,
        apiKey: options.key
      }
    }

    // Try to auto-detect project
    const detected = await this.config.detectProject()
    if (detected) {
      return {
        projectName: detected.projectName,
        apiKey: detected.apiKey
      }
    }

    // If we have partial info from options, try to fill in the gaps
    if (options.project) {
      const globalProject = await this.config.getProject(options.project)
      if (globalProject) {
        return {
          projectName: options.project,
          apiKey: options.key || globalProject.apiKey
        }
      }
    }

    throw new Error('Project configuration not found. Run "shov init" to set up a project, or use --project and --key options.')
  }

  async isFirstTimeUser() {
    try {
      // Check for local config first
      const localConfig = await this.config.loadLocalConfig()
      if (localConfig.project || localConfig.apiKey) {
        // Has local project, so not first-time
        return false
      }
      
      // Check global config and projects
      const globalConfig = await this.config.loadGlobalConfig()
      const projects = await this.config.listProjects()
      
      // First-time user if no global config or no projects
      return !globalConfig.email && Object.keys(projects).length === 0
    } catch (error) {
      // If we can't load config, assume first-time user
      return true
    }
  }

  async showWelcomeExperience() {
    // Clear screen for dramatic effect
    console.clear()
    
    // ASCII Art Logo
    console.log(chalk.cyan(`
     @@@@@@@@                                                        
   @@@@@@@@@@                @@@@@                                   
 @@@@@@@@@@@                 @@@@@                                   
@@@@@@@@@@@         @@@@@@@@ @@@@@@@@@@@     @@@@@@@@  @@@@@   @@@@@ 
@@@@@@@@@@         @@@@@@@@@ @@@@@@@@@@@@  @@@@@@@@@@@@ @@@@  @@@@@  
@@@@@@@@@@         @@@@@     @@@@@   @@@@@@@@@@    @@@@@@@@@@ @@@@@  
@@@@@@@@@@         @@@@@@@@@ @@@@@   @@@@@@@@@      @@@@@@@@@@@@@@   
@@@@@@@@@@@            @@@@@@@@@@@   @@@@@@@@@@    @@@@@@ @@@@@@@    
 @@@@@@@@@@@       @@@@@@@@@@@@@@@   @@@@@@@@@@@@@@@@@@@   @@@@@     
   @@@@@@@@@@      @@@@@@@@@ @@@@@   @@@@@  @@@@@@@@@@      @@@      
     @@@@@@@@                                                        
`))

    // Main Headlines
    console.log(chalk.bold.white('\n                           Instant AI-Powered Backends\n'))
    console.log(chalk.gray('              The instant database for AI native apps.\n'))
    console.log(chalk.gray('           Zero provisioning, vector search, and millisecond responses.\n'))

    // One-sentence pitch
    console.log(chalk.white('🚀 ') + chalk.bold('Shov is the fastest way to get a backend with data, files, and search.\n'))
  }

  async runInteractiveDemo() {
    const { default: ora } = await import('ora')
    
    try {
      // Create anonymous demo project
      let spinner = ora('Creating demo project...').start()
      
      const response = await fetch(`${this.apiUrl}/api/new`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectName: null, // Anonymous
        }),
      })

      if (!response.ok) {
        spinner.fail('Demo creation failed')
        return
      }

      const data = await response.json()
      if (!data.success) {
        spinner.fail('Demo creation failed')
        return
      }

      spinner.succeed('Demo project created')
      
      // Add demo data
      spinner = ora('Adding demo data to collection "hello"...').start()
      
      const addResponse = await fetch(`${this.apiUrl}/api/add/${data.project.name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.project.apiKey}`
        },
        body: JSON.stringify({
          name: 'hello',
          value: { message: 'world', timestamp: new Date().toISOString(), demo: true }
        })
      })

      if (addResponse.ok) {
        const addData = await addResponse.json()
        spinner.succeed(`Added item with ID: ${addData.id}`)
        
        // Retrieve the data
        spinner = ora('Retrieving data...').start()
        
        const getResponse = await fetch(`${this.apiUrl}/api/where/${data.project.name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.project.apiKey}`
          },
          body: JSON.stringify({
            name: 'hello',
            limit: 1
          })
        })

        if (getResponse.ok) {
          const getData = await getResponse.json()
          spinner.succeed('Data retrieved successfully!')
          
          console.log(chalk.gray('   Data: ') + chalk.white(JSON.stringify(getData.items[0].value, null, 2)))
          console.log(chalk.gray('   View live: ') + chalk.cyan(`https://shov.com/${data.project.name}/hello`))
        } else {
          spinner.fail('Failed to retrieve data')
        }
      } else {
        spinner.fail('Failed to add demo data')
      }
      
    } catch (error) {
      console.log(chalk.yellow('\n⚠️  Demo unavailable (offline mode)'))
    }
  }

  async showFirstTimeExamples() {
    console.log(chalk.green('\n📚 Next steps:'))
    
    // Add delay helper
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))
    
    // Key-value storage (moved up)
    await delay(800)
    console.log(chalk.gray('\n   Key-value storage:'))
    console.log(chalk.gray('   ') + chalk.white('shov set') + chalk.gray(' config ') + chalk.cyan('\'{"theme": "dark", "notifications": true}\''))
    console.log(chalk.gray('   ') + chalk.white('shov get') + chalk.gray(' config'))
    
    // Store relational data
    await delay(1000)
    console.log(chalk.gray('\n   Store relational data:'))
    console.log(chalk.gray('   ') + chalk.white('shov add') + chalk.gray(' users ') + chalk.cyan('\'{"name": "Alice", "email": "alice@example.com"}\''))
    
    // Retrieve data  
    await delay(1000)
    console.log(chalk.gray('\n   Retrieve data:'))
    console.log(chalk.gray('   ') + chalk.white('shov where') + chalk.gray(' users'))
    console.log(chalk.gray('   ') + chalk.white('shov where') + chalk.gray(' users ') + chalk.cyan('\'{"name": "Alice"}\''))
    
    // Vector search with magic
    await delay(1000)
    console.log(chalk.gray('\n   ✨ Vector search (all data auto-embedded):'))
    console.log(chalk.gray('   ') + chalk.white('shov search') + chalk.gray(' ') + chalk.cyan('"find users named Alice"'))
    console.log(chalk.gray('   ') + chalk.dim('Natural language queries across collections or entire project'))
    
    // Upload files
    await delay(1000)
    console.log(chalk.gray('\n   Upload files:'))
    console.log(chalk.gray('   ') + chalk.white('shov upload') + chalk.gray(' ./document.pdf'))
    
    await delay(800)
    console.log(chalk.gray('\n   📚 Full documentation: ') + chalk.cyan('https://shov.com'))
    console.log(chalk.gray('   💬 Join our community: ') + chalk.cyan('discord.gg/GB3rDcFrGz') + chalk.gray(' • ') + chalk.cyan('reddit.com/r/shov'))
    console.log(chalk.gray('   🐦 Follow us: ') + chalk.cyan('x.com/shovdev'))
  }

  async createProject(projectName, options) {
    const { default: ora } = await import('ora')
    
    // Check if this is a first-time user
    const isFirstTimeUser = await this.isFirstTimeUser()
    
    if (isFirstTimeUser) {
      await this.showWelcomeExperience()
      console.log(chalk.gray('\n🚀 Creating your project now...\n'))
    } else {
      console.log('\n🚀 Creating your project...\n')
    }

    // If email is provided, we need OTP verification
    if (options.email) {
      return this.createProjectWithEmail(projectName, options.email)
    }

    // Anonymous project creation (no email)
    const spinner = ora(
      projectName 
        ? `Creating project '${projectName}' on Shov...`
        : 'Creating project on Shov...'
    ).start()
    const config = await this.config.getConfig()

    try {
      const response = await fetch(`${this.apiUrl}/api/new`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.token || ''}`,
        },
        body: JSON.stringify({
          projectName: projectName || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        const errorMessage = data.error || response.statusText
        spinner.fail(`Project creation failed: ${errorMessage}`)
        
        // Exit with error code so scripts can detect failure
        process.exit(1)
      }

      const data = await response.json()

      if (data.success) {
        if (isFirstTimeUser) {
          spinner.succeed(`🎉 Project '${data.project.name}' created successfully!`)
          console.log(`\n🔑 API Key: ${chalk.yellow(data.project.apiKey)}`)
          console.log('')
          
          await this.config.saveLocalConfig({
            project: data.project.name,
            apiKey: data.project.apiKey,
          })
          console.log(`💾 Project details saved to local .shov file.`)
          this.addToEnv(data.project.apiKey, data.project.name)
          
          // Deploy blocks if specified
          if (options.blocks) {
            await this.deployBlocksAfterProjectCreation(options.blocks, data.project.name, data.project.apiKey)
          }
          
          // Show next steps with examples
          await this.showFirstTimeExamples()
          
          console.log('\n🎯 Your project is ready to use!\n')
        } else {
          // Minimal output for returning users
          spinner.succeed(`🎉 Project '${data.project.name}' created successfully!`)
          console.log(`\n🔑 API Key: ${data.project.apiKey}`)
          console.log(`💾 Project details saved to local .shov file.`)
          
          await this.config.saveLocalConfig({
            project: data.project.name,
            apiKey: data.project.apiKey,
          })
          this.addToEnv(data.project.apiKey, data.project.name)
          
          // Deploy blocks if specified
          if (options.blocks) {
            await this.deployBlocksAfterProjectCreation(options.blocks, data.project.name, data.project.apiKey)
          }
        }
      } else {
        spinner.fail(`❌ Project creation failed: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      spinner.fail('Project creation failed.')
      console.error(`Error: ${error.message}`)
    }
  }

  async createProjectWithEmail(projectName, email) {
    const { default: ora } = await import('ora')
    const { default: prompts } = await import('prompts')
    
    // Check if this is a first-time user for consistent messaging
    const isFirstTimeUser = await this.isFirstTimeUser()
    
    // Don't show welcome screen here since it was already shown in createProject if needed
    let spinner = ora('Initiating project creation...').start()
    const config = await this.config.getConfig()

    try {
      // Step 1: Initiate project creation with email
      const response = await fetch(`${this.apiUrl}/api/new`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.token || ''}`,
        },
        body: JSON.stringify({
          projectName: projectName || null,
          email: email,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        this.handleApiError(response, data, spinner, 'Project creation')
        return
      }

      const data = await response.json()

      if (data.success && data.requiresVerification) {
        spinner.stop()
        
        // Step 2: Prompt for OTP
        const otpResponse = await prompts({
          type: 'text',
          name: 'otp',
          message: `🔐 To create your project enter the auth code we sent to ${email}:`,
          validate: value => value.length === 4 ? true : 'Please enter a 4-digit code'
        })

        if (!otpResponse.otp) {
          console.log('\n❌ Verification cancelled.\n')
          return
        }

        // Step 3: Verify OTP and complete project creation
        spinner = ora('🔐 Verifying code and creating project...').start()
        
        const verifyResponse = await fetch(`${this.apiUrl}/api/new/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: email,
            pin: otpResponse.otp,
            projectName: data.project.name,
          }),
        })

        if (!verifyResponse.ok) {
          const verifyData = await verifyResponse.json().catch(() => ({}))
          this.handleApiError(verifyResponse, verifyData, spinner, 'Verification')
          return
        }

        const verifyData = await verifyResponse.json()

        if (verifyData.success) {
          if (isFirstTimeUser) {
            spinner.succeed(`🎉 Project '${verifyData.project.name}' verified and created successfully!`)
            console.log(`\n🔑 API Key: ${chalk.yellow(verifyData.project.apiKey)}`)
            console.log('')
            
            await this.config.saveLocalConfig({
              project: verifyData.project.name,
              apiKey: verifyData.project.apiKey,
            })
            console.log(`💾 Project details saved to local .shov file.`)
            this.addToEnv(verifyData.project.apiKey, verifyData.project.name)
            
            // Show next steps with examples
            await this.showFirstTimeExamples()
            
            console.log('\n🎯 Your project is ready to use!\n')
          } else {
            // Minimal output for returning users
            spinner.succeed(`🎉 Project '${verifyData.project.name}' created successfully!`)
            console.log(`\n🔑 API Key: ${verifyData.project.apiKey}`)
            console.log(`💾 Project details saved to local .shov file.`)
            
            await this.config.saveLocalConfig({
              project: verifyData.project.name,
              apiKey: verifyData.project.apiKey,
            })
            this.addToEnv(verifyData.project.apiKey, verifyData.project.name)
          }
        } else {
          spinner.fail(`❌ Verification failed: ${verifyData.error || 'Unknown error'}`)
        }
      } else if (data.success) {
        // Direct creation without verification (shouldn't happen with email)
        spinner.succeed(`Project '${data.project.name}' created!`)
        console.log(`API Key: ${data.project.apiKey}`)
        await this.config.saveLocalConfig({
          project: data.project.name,
          apiKey: data.project.apiKey,
        })
        console.log('Project details saved to local .shov file.')
        this.addToEnv(data.project.apiKey, data.project.name)
      } else {
        spinner.fail(`Project creation failed: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      spinner.fail('Project creation failed.')
      console.error(`Error: ${error.message}`)
    }
  }

  addToEnv(apiKey, projectName) {
    const envVars = `\nSHOV_API_KEY=${apiKey}\nSHOV_PROJECT=${projectName}\n`
    const envLocalPath = path.resolve(process.cwd(), '.env.local')
    const envPath = path.resolve(process.cwd(), '.env')

    try {
      if (fs.existsSync(envLocalPath)) {
        const content = fs.readFileSync(envLocalPath, 'utf-8')
        if (!content.includes('SHOV_API_KEY')) {
          fs.appendFileSync(envLocalPath, envVars)
          console.log('📝 Added API key and project name to your .env.local file.')
        }
      } else if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8')
        if (!content.includes('SHOV_API_KEY')) {
          fs.appendFileSync(envPath, envVars)
          console.log('📝 Added API key and project name to your .env file.')
        }
      } else {
        fs.writeFileSync(envPath, `SHOV_API_KEY=${apiKey}\nSHOV_PROJECT=${projectName}\n`)
        console.log('📝 Created .env file with your API key and project name.')
      }
      
      // Add .shov to .gitignore
      this.addToGitignore()
    } catch (error) {
      console.warn(`\n⚠️  Could not add environment variables to .env file: ${error.message}`)
      console.warn(`\nPlease add the following to your environment file:\n`)
      console.warn(chalk.bold(`SHOV_API_KEY=${apiKey}`))
      console.warn(chalk.bold(`SHOV_PROJECT=${projectName}`))
    }
  }

  addToGitignore() {
    const gitignorePath = path.resolve(process.cwd(), '.gitignore')
    
    try {
      let gitignoreContent = ''
      let needsUpdate = false
      
      if (fs.existsSync(gitignorePath)) {
        gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8')
        if (!gitignoreContent.includes('.shov') && !gitignoreContent.includes('*.shov')) {
          needsUpdate = true
        }
      } else {
        needsUpdate = true
      }
      
      if (needsUpdate) {
        const newEntries = gitignoreContent.length > 0 ? '\n.shov\n' : '.shov\n'
        fs.appendFileSync(gitignorePath, newEntries)
        console.log('📝 Added .shov to .gitignore to protect your API keys.')
      }
    } catch (error) {
      // Silently fail - not critical
    }
  }
  
  async claimProject(projectName, email, options) {
    const { default: ora } = await import('ora');
    const { default: prompts } = await import('prompts');
    
    let finalProjectName = projectName;

    if (!finalProjectName) {
      try {
        const detected = await this.config.detectProject();
        if (detected && detected.source === 'local') {
          finalProjectName = detected.projectName;
          console.log(chalk.gray(`Project '${finalProjectName}' detected from local .shov file.`));
        } else {
          throw new Error('No project name specified and no local project found. Please provide a project name.');
        }
      } catch (error) {
        console.error(chalk.red(error.message));
        return;
      }
    }

    let spinner = ora(`Initiating claim for project '${finalProjectName}'...`).start();
    try {
      // Step 1: Initiate the claim and trigger OTP
      const initiateResponse = await fetch(`${this.apiUrl}/api/claim/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: finalProjectName, email }),
      });

      const initiateData = await initiateResponse.json();

      if (!initiateResponse.ok || !initiateData.success) {
        this.handleApiError(initiateResponse, initiateData, spinner, 'Claim initiation');
        return;
      }
      
      spinner.succeed(initiateData.message);

      // Step 2: Prompt user for the OTP
      const { pin } = await prompts({
        type: 'text',
        name: 'pin',
        message: 'Please enter the verification code sent to your email:'
      });

      if (!pin) {
        console.log(chalk.yellow('Claim process cancelled.'));
        return;
      }

      // Step 3: Verify the OTP and complete the claim
      spinner.start('Verifying code and claiming project...');
      const verifyResponse = await fetch(`${this.apiUrl}/api/claim/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: finalProjectName, email, pin }),
      });
      
      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok || !verifyData.success) {
        this.handleApiError(verifyResponse, verifyData, spinner, 'Claim verification');
        return;
      }

      spinner.succeed(verifyData.message);
      console.log(chalk.green('You can now manage this project from your account.'));

    } catch (error) {
      spinner.fail(`An error occurred during the claim process: ${error.message}`);
    }
  }

  // Initialize Shov in existing project
  async initProject(options = {}) {
    console.log(chalk.blue('🔧 Initializing Shov in current directory...'))

    let projectName = options.project
    let apiKey = options.key

    if (!projectName) {
      const response = await prompts({
        type: 'text',
        name: 'projectName',
        message: 'What is your project name?'
      })
      projectName = response.projectName
    }

    if (!apiKey) {
      const response = await prompts({
        type: 'text',
        name: 'apiKey',
        message: 'What is your API key?'
      })
      apiKey = response.apiKey
    }

    if (!projectName || !apiKey) {
      throw new Error('Project name and API key are required')
    }

    await this.config.saveLocalConfig({
      project: projectName,
      apiKey: apiKey
    })
    
    // Also save to global config if we have email
    const email = await this.config.getDefaultEmail()
    if (email) {
      await this.config.addProject(projectName, apiKey, email)
    }

    console.log(chalk.green('✅ Shov initialized successfully!'))
    console.log(`  Project: ${chalk.cyan(projectName)}`)
    console.log(`  API Key: ${chalk.yellow(apiKey.substring(0, 20) + '...')}`)
  }

  // Show current configuration
  async showConfig() {
    const detected = await this.config.detectProject()
    const globalConfig = await this.config.loadGlobalConfig()
    const localConfig = await this.config.loadLocalConfig()
    
    console.log(chalk.bold('Shov Configuration:'))
    console.log('')
    
    // Current project
    if (detected) {
      console.log(chalk.bold('Current Project:'))
      console.log(`  Name: ${chalk.cyan(detected.projectName)}`)
      console.log(`  API Key: ${chalk.yellow(detected.apiKey.substring(0, 20) + '...')}`)
      console.log(`  Source: ${chalk.gray(detected.source)}`)
      console.log('')
    } else {
      console.log(chalk.yellow('No active project found.'))
      console.log(chalk.gray('Run "shov new" to create a project or "shov init" to initialize an existing project.'))
      console.log('')
    }
    
    // Global configuration
    if (globalConfig.email) {
      console.log(chalk.bold('Global Settings:'))
      console.log(`  Default Email: ${chalk.gray(globalConfig.email)}`)
      console.log('')
    }
    
    // Available projects
    const projects = await this.config.listProjects()
    if (Object.keys(projects).length > 0) {
      console.log(chalk.bold('Available Projects:'))
      for (const [name, project] of Object.entries(projects)) {
        const isActive = detected && detected.projectName === name
        const marker = isActive ? chalk.green('●') : chalk.gray('○')
        console.log(`  ${marker} ${chalk.cyan(name)} (${chalk.gray(project.email)})`)
      }
      console.log('')
    }
    
    // Local configuration
    if (Object.keys(localConfig).length > 0) {
      console.log(chalk.bold('Local Configuration:'))
      console.log(`  File: ${chalk.gray('.shov')}`)
      if (localConfig.project) console.log(`  Project: ${chalk.cyan(localConfig.project)}`)
      if (localConfig.apiKey) console.log(`  API Key: ${chalk.yellow(localConfig.apiKey.substring(0, 20) + '...')}`)
      console.log('')
    }
    
    // Environment variables
    if (process.env.SHOV_PROJECT || process.env.SHOV_API_KEY) {
      console.log(chalk.bold('Environment Variables:'))
      if (process.env.SHOV_PROJECT) console.log(`  SHOV_PROJECT: ${chalk.cyan(process.env.SHOV_PROJECT)}`)
      if (process.env.SHOV_API_KEY) console.log(`  SHOV_API_KEY: ${chalk.yellow(process.env.SHOV_API_KEY.substring(0, 20) + '...')}`)
    }
  }

  // Get a value from the database
  async getValue(key, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)

    try {
      const response = await fetch(`${this.apiUrl}/api/get/${projectName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ name: key })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get value')
      }

      console.log(chalk.green('✅ Value retrieved:'))
      console.log(JSON.stringify(data.value, null, 2))

    } catch (error) {
      throw new Error(`Failed to get value: ${error.message}`)
    }
  }

  async set(key, value, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora('Setting value...').start();
    try {
      const project = await this.getProjectConfig(options);
      if (!project) {
        spinner.fail('No project configured. Run `shov new` or `shov link`.');
        return;
      }

      let parsedValue = value;
      try {
        parsedValue = JSON.parse(value);
      } catch (e) {
        // Not a JSON object, treat as a string.
      }

      const body = { name: key, value: parsedValue };
      if (options.noVector) {
        body.excludeFromVector = true;
      }
      const response = await this.apiCall(`/set/${project.projectName}`, body, project.apiKey, options);

      if (response.success) {
        spinner.succeed(`Successfully set "${key}".`);
      } else {
        spinner.fail(`Failed to set value: ${response.error || 'An unexpected error occurred.'}`);
      }
    } catch (error) {
      spinner.fail(`Failed to set value: ${error.message}`);
    }
  }

  async get(key, options = {}) {
    try {
      const { projectName, apiKey } = await this.getProjectConfig(options);

      const body = { name: key };

      const data = await this.apiCall(`/get/${projectName}`, body, apiKey, options);

      if (data.success) {
        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            key: key,
            value: data.value,
            project: projectName
          }, null, 2));
        } else {
          console.log(`Value for "${key}": ${JSON.stringify(data.value, null, 2)}`)
        }
      } else {
        if (options.json) {
          console.log(JSON.stringify({
            success: false,
            error: data.error || 'Unknown error'
          }, null, 2));
        } else {
          console.error(`Error: Failed to get value: ${data.error || 'Unknown error'}`)
        }
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({
          success: false,
          error: error.message
        }, null, 2));
      } else {
        console.error(`Error: Failed to get value: ${error.message}`);
        if (error.response && error.response.payload) {
          console.error(chalk.gray(`Request Payload: ${JSON.stringify(error.response.payload, null, 2)}`));
        }
      }
    }
  }

  // Add item to collection
  async addToCollection(collection, value, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)

    // Try to parse value as JSON, fallback to string
    let parsedValue
    try {
      parsedValue = JSON.parse(value)
    } catch {
      parsedValue = value
    }

    try {
      const body = {
        name: collection,
        value: parsedValue
      };
      if (options.noVector) {
        body.excludeFromVector = true;
      }
      const data = await this.apiCall(`/add/${projectName}`, body, apiKey, options);

      if (data.success) {
        if (options.json) {
          // Output JSON for scripts
          console.log(JSON.stringify({ success: true, id: data.id, collection, value: parsedValue }))
        } else {
          // Output formatted for humans
          console.log(chalk.green('✅ Item added to collection'))
          console.log(`  Collection: ${chalk.cyan(collection)}`)
          console.log(`  Item ID: ${chalk.yellow(data.id)}`)
          console.log(`  Value: ${chalk.gray(JSON.stringify(parsedValue))}`)
        }
      } else {
        throw new Error(data.error || 'Failed to add to collection')
      }

    } catch (error) {
      throw new Error(`Failed to add to collection: ${error.message}`)
    }
  }

  async addManyToCollection(collection, itemsJson, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora(`Adding items to collection "${collection}"...`).start();
    try {
      const projectConfig = await this.getProjectConfig(options);
      let items;
      try {
        items = JSON.parse(itemsJson);
        if (!Array.isArray(items)) {
          throw new Error('Input must be a JSON array of objects.');
        }
      } catch {
        throw new Error('Input must be a valid JSON array.');
      }

      const response = await fetch(`${this.apiUrl}/api/add-many/${projectConfig.projectName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${projectConfig.apiKey}`
        },
        body: JSON.stringify({ 
          name: collection, 
          items: items,
          ...(options.noVector && { excludeFromVector: true })
        })
      });

      const data = await response.json();
      if (response.ok) {
        spinner.succeed(`Successfully added ${data.ids.length} items to collection "${collection}".`);
      } else {
        spinner.fail(`Failed to add items: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      spinner.fail(`Failed to add items: ${error.message}`);
    }
  }


  // Find items in collection with filters (renamed to WHERE)
  async whereInCollection(collection, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)

    const body = {
      name: collection
    }

    if (options.filter) {
      try {
        body.filter = JSON.parse(options.filter)
      } catch {
        throw new Error('Filter must be valid JSON')
      }
    }

    if (options.limit) {
      body.limit = parseInt(options.limit, 10)
    }

    if (options.sort) {
      body.sort = options.sort
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/where/${projectName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to find in collection')
      }

      console.log(chalk.green(`✅ Found ${data.items.length} items in "${collection}":`))
      
      if (data.items.length === 0) {
        console.log(chalk.gray('  No items found matching filter'))
        return
      }

      data.items.forEach((item, index) => {
        console.log(`  ${index + 1}. ${chalk.yellow(item.id)}`)
        console.log(`     ${chalk.gray(JSON.stringify(item.value))}`)
        console.log(`     ${chalk.dim(item.createdAt)}`)
      })

    } catch (error) {
      throw new Error(`Failed to find in collection: ${error.message}`)
    }
  }

  // Count items in collection with optional filters
  async countInCollection(collection, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)

    const body = {
      name: collection
    }

    if (options.filter) {
      try {
        body.filter = JSON.parse(options.filter)
      } catch {
        throw new Error('Filter must be valid JSON')
      }
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/count/${projectName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to count items in collection')
      }

      if (options.json) {
        console.log(JSON.stringify(data, null, 2))
      } else {
        console.log(chalk.green(`✅ Found ${data.count} items in "${collection}"`))
        if (options.filter) {
          console.log(chalk.gray(`   Filter: ${options.filter}`))
        }
      }

    } catch (error) {
      throw new Error(`Failed to count items in collection: ${error.message}`)
    }
  }

  async removeItem(collection, itemId, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora(`Removing item "${itemId}" from collection "${collection}"...`).start();
    try {
      const { projectName, apiKey } = await this.getProjectConfig(options);
      const body = { collection: collection };
      
      const data = await this.apiCall(`/remove/${projectName}/${itemId}`, body, apiKey, options);
      
      if (data.success) {
        spinner.succeed(`Successfully removed item "${itemId}" from collection "${collection}".`);
      } else {
        spinner.fail(`Failed to remove item: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      spinner.fail(`Failed to remove item: ${error.message}`);
    }
  }

  async clearCollection(collectionName, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora(`Clearing all items from collection "${collectionName}"...`).start();
    try {
      const projectConfig = await this.getProjectConfig(options);
      const response = await fetch(`${this.apiUrl}/api/clear/${projectConfig.projectName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${projectConfig.apiKey}`
        },
        body: JSON.stringify({ name: collectionName })
      });
      const data = await response.json();
      if (response.ok) {
        spinner.succeed(`Successfully cleared ${data.count} items from collection "${collectionName}".`);
      } else {
        spinner.fail(`Failed to clear collection: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      spinner.fail(`Failed to clear collection: ${error.response ? error.response.data.error : error.message}`);
    }
  }

  async batch(operationsJson, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora('Executing batch operations...').start();
    try {
      const { projectName, apiKey } = await this.getProjectConfig(options);
      
      // Parse operations JSON
      let operations;
      try {
        operations = JSON.parse(operationsJson);
        if (!Array.isArray(operations)) {
          throw new Error('Operations must be a JSON array');
        }
      } catch (error) {
        spinner.fail('Invalid JSON format for operations');
        console.log(chalk.yellow('Example: \'[{"type": "set", "name": "user:123", "value": {"name": "John"}}, {"type": "add", "collection": "orders", "value": {"userId": "123", "total": 99.99}}]\''));
        return;
      }

      if (operations.length === 0) {
        spinner.fail('Operations array cannot be empty');
        return;
      }

      if (operations.length > 50) {
        spinner.fail('Maximum 50 operations allowed per batch');
        return;
      }

      spinner.text = `Executing ${operations.length} operations atomically...`;

      const response = await fetch(`${this.apiUrl}/api/batch/${projectName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ operations })
      });

      const data = await response.json();

      // Check for both HTTP errors and V3 rollback failures
      if (!response.ok || data.success === false) {
        // Handle V3 rollback failures specifically
        if (data.rollbackPerformed) {
          spinner.fail(`Batch operation failed and was rolled back: ${data.error || 'Unknown error'}`);
          console.log(chalk.yellow('🔄 All operations were rolled back to maintain data consistency.'));
          
          if (data.failedOperation !== undefined) {
            console.log(chalk.red(`Failed at operation ${data.failedOperation + 1} (${data.operationType})`));
          }
          
          if (data.results && Array.isArray(data.results) && data.results.length > 0) {
            console.log(chalk.blue('Operations completed before failure:'));
            data.results.forEach((result, index) => {
              const status = result.success ? chalk.green('✅') : chalk.red('❌');
              console.log(`  ${index + 1}. Operation ${result.operationIndex + 1} ${status}`);
            });
          }
          return;
        }
        
        // Handle other batch failures
        spinner.fail(`Batch operation failed: ${data.error || 'Unknown error'}`);
        if (data.details) {
          console.log(chalk.red('Error details:'));
          // Handle both array (validation errors) and object (execution errors) formats
          if (Array.isArray(data.details)) {
            // Validation errors - array of strings
            data.details.forEach((detail, index) => {
              console.log(`  ${index + 1}. ${detail}`);
            });
          } else if (typeof data.details === 'object') {
            // Execution errors - object with transaction info
            if (data.details.transactionId) {
              console.log(`  Transaction ID: ${chalk.yellow(data.details.transactionId)}`);
            }
            if (data.details.failedAt !== undefined) {
              console.log(`  Failed at operation: ${data.details.failedAt + 1}`);
            }
            if (data.details.results && Array.isArray(data.details.results)) {
              console.log(`  Operation results:`);
              data.details.results.forEach((result, index) => {
                const status = result.success ? chalk.green('✅') : chalk.red('❌');
                const error = result.error ? ` - ${result.error}` : '';
                console.log(`    ${index + 1}. ${result.type || 'unknown'} ${status}${error}`);
              });
            }
          }
        }
        return;
      }

      // Check if any operations failed
      const failedOperations = data.results ? data.results.filter(r => !r.success) : [];
      const hasFailures = failedOperations.length > 0;

      if (options.json) {
        spinner.stop();
        console.log(JSON.stringify(data, null, 2));
        
        // Exit with error code if any operations failed
        if (hasFailures) {
          process.exit(1);
        }
      } else {
        if (hasFailures) {
          spinner.fail(`Batch partially failed! ${failedOperations.length} of ${data.operationsExecuted} operations failed.`);
          console.log(`  Transaction ID: ${chalk.yellow(data.transactionId)}`);
          console.log(chalk.red('  ⚠️  Some operations failed - data may be in an inconsistent state!'));
        } else {
          spinner.succeed(`Batch completed successfully! Executed ${data.operationsExecuted} operations.`);
          console.log(`  Transaction ID: ${chalk.yellow(data.transactionId)}`);
        }
        
        if (data.results && data.results.length > 0) {
          const resultColor = hasFailures ? chalk.yellow : chalk.green;
          console.log(resultColor('  Results:'));
          data.results.forEach((result, index) => {
            const op = operations[index];
            if (result.success) {
              let resultText = `    ${index + 1}. ${chalk.cyan(op.type)}`;
              if (op.name) resultText += ` "${op.name}"`;
              if (op.collection) resultText += ` in "${op.collection}"`;
              if (result.result && result.result.id) resultText += ` → ${chalk.yellow(result.result.id)}`;
              console.log(resultText + ' ✅');
            } else {
              let errorText = `    ${index + 1}. ${chalk.cyan(op.type)} → ${chalk.red('Failed')}`;
              if (result.error) errorText += ` - ${result.error}`;
              console.log(errorText);
            }
          });
        }
        
        // Exit with error code if any operations failed
        if (hasFailures) {
          process.exit(1);
        }
      }
    } catch (error) {
      spinner.fail(`Batch operation failed: ${error.message}`);
    }
  }

  async forgetItem(idOrName, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora('Forgetting item...').start();
    try {
      const projectConfig = await this.getProjectConfig(options);
      const response = await fetch(`${this.apiUrl}/api/forget/${projectConfig.projectName}/${idOrName}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${projectConfig.apiKey}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        spinner.succeed(`Successfully forgot item "${idOrName}".`);
      } else {
        spinner.fail(`Failed to forget item: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      spinner.fail(`Failed to forget item: ${error.response ? error.response.data.error : error.message}`);
    }
  }

  async updateItem(collection, idOrName, value, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora(`Updating item "${idOrName}" in collection "${collection}"...`).start();
    try {
      const { projectName, apiKey } = await this.getProjectConfig(options);
      let parsedValue;
      try {
        parsedValue = JSON.parse(value);
      } catch (e) {
        parsedValue = value;
      }
      const body = { 
        collection: collection,
        value: parsedValue 
      };
      if (options.noVector) {
        body.excludeFromVector = true;
      }

      // Use POST for update, consistent with other data operations
      const data = await this.apiCall(`/update/${projectName}/${idOrName}`, body, apiKey, options);

      if (data.success) {
        spinner.succeed(`Item "${idOrName}" in collection "${collection}" updated successfully.`);
      } else {
        spinner.fail(`Failed to update item: ${data.error || 'An unexpected error occurred.'}`);
      }
    } catch (error) {
      spinner.fail(`Failed to update item: ${error.message}`);
    }
  }

  async sendOtp(identifier, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora(`Sending OTP to ${identifier}...`).start();
    try {
      const projectConfig = await this.getProjectConfig(options);
      const digits = options.digits ? parseInt(options.digits, 10) : 4;
      
      const response = await fetch(`${this.apiUrl}/api/send-otp/${projectConfig.projectName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${projectConfig.apiKey}`
        },
        body: JSON.stringify({ identifier, digits })
      });

      const data = await response.json();
      if (response.ok) {
        spinner.succeed(data.message);
      } else {
        this.handleApiError(response, data, spinner, 'OTP sending');
      }
    } catch (error) {
      spinner.fail(`Failed to send OTP: ${error.message}`);
    }
  }

  async verifyOtp(identifier, pin, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora(`Verifying OTP for ${identifier}...`).start();
    try {
      const projectConfig = await this.getProjectConfig(options);

      const response = await fetch(`${this.apiUrl}/api/verify-otp/${projectConfig.projectName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${projectConfig.apiKey}`
        },
        body: JSON.stringify({ identifier, pin })
      });
      
      const data = await response.json();
      if (response.ok && data.success) {
        spinner.succeed('OTP verified successfully!');
      } else {
        spinner.fail(`Failed to verify OTP: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      spinner.fail(`Failed to verify OTP: ${error.message}`);
    }
  }

  // Get contents of current memory (keys, collections, files)
  async getContents(options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora('Retrieving contents...').start();
    try {
      const projectConfig = await this.getProjectConfig(options);
      
      const response = await fetch(`${this.apiUrl}/api/contents/${projectConfig.projectName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${projectConfig.apiKey}`
        },
        body: JSON.stringify({})
      });

      const data = await response.json();
      if (response.ok && data.success) {
        spinner.succeed(`Found ${data.contents.length} items:`);
        
        if (data.contents.length === 0) {
          console.log(chalk.gray('  No items found'));
          return;
        }

        // Group by type
        const grouped = data.contents.reduce((acc, item) => {
          if (!acc[item.type]) acc[item.type] = [];
          acc[item.type].push(item);
          return acc;
        }, {});

        // Display each type
        Object.entries(grouped).forEach(([type, items]) => {
          console.log(`\n  ${chalk.bold(type.toUpperCase())} (${items.length}):`);
          items.forEach(item => {
            if (item.type === 'collection') {
              console.log(`    ${chalk.yellow(item.count || 'undefined')} - ${chalk.cyan(item.name)}`);
            } else {
              console.log(`    ${chalk.yellow(item.id)} - ${chalk.cyan(item.name)}`);
            }
          });
        });
      } else {
        spinner.fail(`Failed to get contents: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      spinner.fail(`Failed to get contents: ${error.message}`);
    }
  }

  // Upload a file
  async uploadFile(filePath, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora(`Uploading ${filePath}...`).start();
    try {
        const { projectName, apiKey } = await this.getProjectConfig(options);
        const absolutePath = path.resolve(filePath);

        if (!fs.existsSync(absolutePath)) {
            throw new Error(`File not found at ${absolutePath}`);
        }

        const { fileTypeFromFile } = await import('file-type');
        const type = await fileTypeFromFile(absolutePath);
        const mimeType = type ? type.mime : 'application/octet-stream';

        // Use curl as a workaround for Node.js fetch ECONNRESET issue
        const { execa } = await import('execa');
        const curlArgs = [
            '-X', 'POST',
            `${this.apiUrl}/api/upload/${projectName}`,
            '-H', `Authorization: Bearer ${apiKey}`,
            '-H', `Content-Type: ${mimeType}`,
            '-H', `x-shov-filename: ${path.basename(absolutePath)}`,
            '--data-binary', `@${absolutePath}`,
            '--max-time', '30'
        ];

        const result = await execa('curl', curlArgs);
        const data = JSON.parse(result.stdout);

        if (!data.success) {
            throw new Error(data.error || 'Failed to upload file');
        }

        spinner.succeed('File uploaded successfully!');
        console.log(`  File ID: ${chalk.yellow(data.fileId)}`);
        console.log(`  URL: ${chalk.cyan(data.url)}`);

    } catch (error) {
        spinner.fail(`File upload failed: ${error.message}`);
    }
  }

  async forgetFile(filename, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora(`Deleting file "${filename}"...`).start();
    try {
      const { projectName, apiKey } = await this.getProjectConfig(options);
      
      const data = await this.apiCall(`/forget-file/${projectName}/${filename}`, {}, apiKey, options, 'DELETE');
      
      if (data.success) {
        spinner.succeed(`Successfully deleted ${data.count} file(s) named "${filename}".`);
      } else {
        spinner.fail(`Failed to delete file: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      spinner.fail(`Failed to delete file: ${error.message}`);
    }
  }

  // Get a pre-signed upload URL
  async getUploadUrl(fileName, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora('Generating pre-signed URL...').start();
    try {
        const { projectName, apiKey } = await this.getProjectConfig(options);
        
        // Determine MIME type from file extension if not provided
        let mimeType = options.mimeType;
        if (!mimeType) {
            const ext = fileName.split('.').pop()?.toLowerCase();
            const mimeTypes = {
                'txt': 'text/plain',
                'json': 'application/json',
                'pdf': 'application/pdf',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'gif': 'image/gif',
                'mp4': 'video/mp4',
                'mp3': 'audio/mpeg'
            };
            mimeType = mimeTypes[ext] || 'application/octet-stream';
        }

        const response = await fetch(`${this.apiUrl}/api/upload-url/${projectName}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                fileName,
                mimeType
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to get upload URL');
        }

        spinner.succeed('Pre-signed URL generated successfully!');
        console.log(`  File ID: ${chalk.yellow(data.fileId)}`);
        console.log(`  Upload URL: ${chalk.cyan(data.uploadUrl)}`);
        console.log(chalk.yellow(`This URL is valid for ${data.expiresIn ? Math.floor(data.expiresIn / 60) : 15} minutes.`));

    } catch (error) {
        spinner.fail(`Failed to get upload URL: ${error.message}`);
    }
  }

  async listFiles(options = {}) {
    const { default: ora } = await import('ora');
    
    // Handle JSON output without spinner
    if (options.json) {
      try {
        const { projectName, apiKey } = await this.getProjectConfig(options);
        const data = await this.apiCall(`/files-list/${projectName}`, {}, apiKey, options);
        if (data.success) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.error(JSON.stringify({ error: data.error || 'Unknown error' }, null, 2));
          process.exit(1);
        }
      } catch (error) {
        console.error(JSON.stringify({ error: error.message }, null, 2));
        process.exit(1);
      }
      return;
    }

    // Handle regular output with spinner
    const spinner = ora('Listing files...').start();
    try {
        const { projectName, apiKey } = await this.getProjectConfig(options);
        const data = await this.apiCall(`/files-list/${projectName}`, {}, apiKey, options);
        if (data.success) {
            spinner.succeed(`Found ${data.files.length} files:`);
            console.table(data.files);
        } else {
            spinner.fail(`Failed to list files: ${data.error || 'Unknown error'}`);
        }
    } catch (error) {
        spinner.fail(`Failed to list files: ${error.message}`);
    }
  }

  async getFile(fileId, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora(`Getting file info for ${fileId}...`).start();
    try {
        const { projectName, apiKey } = await this.getProjectConfig(options);
        const data = await this.apiCall(`/files-get/${projectName}/${fileId}`, {}, apiKey, options);
        if (data.success) {
            spinner.succeed('File found:');
            console.log(data.file);
        } else {
            spinner.fail(`Failed to get file: ${data.error || 'Unknown error'}`);
        }
    } catch (error) {
        spinner.fail(`Failed to get file: ${error.message}`);
    }
  }

  async deleteFile(fileId, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora(`Deleting file ${fileId}...`).start();
    try {
        const { projectName, apiKey } = await this.getProjectConfig(options);
        const data = await this.apiCall(`/files-delete/${projectName}/${fileId}`, {}, apiKey, options, 'DELETE');
        if (data.success) {
            spinner.succeed(data.message);
        } else {
            spinner.fail(`Failed to delete file: ${data.error || 'Unknown error'}`);
        }
    } catch (error) {
        spinner.fail(`Failed to delete file: ${error.message}`);
    }
  }

  // Search a collection
  async token(typeOrSubscriptions, subscriptionsOrOptions = {}, options = {}) {
    // Handle both old and new calling patterns for backward compatibility
    let type, subscriptions, finalOptions;
    
    if (typeof typeOrSubscriptions === 'string') {
      // New pattern: token('streaming', [...], options)
      type = typeOrSubscriptions;
      subscriptions = subscriptionsOrOptions;
      finalOptions = options;
    } else {
      // Legacy pattern: streamToken([...], options) - assume streaming type
      type = 'streaming';
      subscriptions = typeOrSubscriptions;
      finalOptions = subscriptionsOrOptions;
    }
    
    const { projectName, apiKey } = await this.getProjectConfig(finalOptions);

    try {
      // Parse subscriptions JSON if it's a string
      let parsedSubscriptions;
      if (typeof subscriptions === 'string') {
        try {
          parsedSubscriptions = JSON.parse(subscriptions);
        } catch (error) {
          console.error(chalk.red('Error: Invalid JSON format for subscriptions'));
          console.log(chalk.yellow('Example: \'[{"collection": "users", "filters": {"status": "active"}}, {"channel": "chat-room-1"}]\''));
          return;
        }
      } else {
        parsedSubscriptions = subscriptions;
      }

      if (!Array.isArray(parsedSubscriptions)) {
        console.error(chalk.red('Error: Subscriptions must be an array'));
        return;
      }

      if (!finalOptions.json) {
        console.log(chalk.blue(`Creating ${type} token for ${parsedSubscriptions.length} subscription${parsedSubscriptions.length === 1 ? '' : 's'}...`));
      }

      const payload = {
        type,
        subscriptions: parsedSubscriptions,
        expires_in: finalOptions.expires ? parseInt(finalOptions.expires, 10) : 3600,
        api_key: apiKey
      };

      const response = await fetch(`${this.apiUrl}/api/token/${projectName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        this.handleApiError(response, data, { fail: (msg) => console.error(chalk.red(msg)) }, 'Token creation');
        return;
      }

      if (finalOptions.json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(chalk.green(`✅ ${type.charAt(0).toUpperCase() + type.slice(1)} token created successfully!`));
        console.log('');
        console.log(`  Token: ${chalk.yellow(data.token)}`);
        console.log(`  Expires: ${chalk.gray(data.expires_at)} (${data.expires_in}s)`);
        console.log(`  Subscriptions: ${chalk.cyan(data.subscriptions)}`);
        console.log('');
        console.log(chalk.blue('💡 Use this token with the subscribe endpoint to receive real-time updates.'));
        console.log(chalk.gray('   Keep this token secure and use HTTPS for all streaming connections.'));
      }
    } catch (error) {
      console.error(chalk.red('Error creating stream token:'), error.message);
    }
  }

  async broadcast(subscription, message, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora('Broadcasting message...').start();
    
    try {
      const { projectName, apiKey } = await this.getProjectConfig(options);
      
      // Parse subscription JSON if it's a string
      let parsedSubscription;
      if (typeof subscription === 'string') {
        try {
          parsedSubscription = JSON.parse(subscription);
        } catch (error) {
          spinner.fail('Invalid JSON format for subscription');
          console.log(chalk.yellow('Example: \'{"collection": "users", "filters": {"status": "active"}}\''));
          return;
        }
      } else {
        parsedSubscription = subscription;
      }
      
      // Parse message JSON if it's a string
      let parsedMessage;
      if (typeof message === 'string') {
        try {
          parsedMessage = JSON.parse(message);
        } catch (error) {
          // If not valid JSON, treat as string
          parsedMessage = message;
        }
      } else {
        parsedMessage = message;
      }

      const response = await fetch(`${this.apiUrl}/api/broadcast/${projectName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscription: parsedSubscription,
          message: parsedMessage
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        spinner.fail(`Broadcast failed: ${data.error || 'Unknown error'}`);
        return;
      }

      if (options.json) {
        spinner.stop();
        console.log(JSON.stringify(data, null, 2));
      } else {
        spinner.succeed('Message broadcast successfully!');
        console.log(`  Message ID: ${chalk.yellow(data.messageId)}`);
        console.log(`  Delivered to: ${chalk.cyan(data.delivered)} connection${data.delivered === 1 ? '' : 's'}`);
      }
    } catch (error) {
      spinner.fail(`Broadcast failed: ${error.message}`);
    }
  }

  async subscribe(subscriptions, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options);
    
    try {
      // Parse subscriptions JSON if it's a string
      let parsedSubscriptions;
      if (typeof subscriptions === 'string') {
        try {
          parsedSubscriptions = JSON.parse(subscriptions);
        } catch (error) {
          console.error(chalk.red('Error: Invalid JSON format for subscriptions'));
          console.log(chalk.yellow('Example: \'[{"collection": "users", "filters": {"status": "active"}}]\''));
          return;
        }
      } else {
        parsedSubscriptions = subscriptions;
      }

      if (!Array.isArray(parsedSubscriptions)) {
        console.error(chalk.red('Error: Subscriptions must be an array'));
        return;
      }

      console.log(chalk.blue(`Connecting to real-time stream for ${parsedSubscriptions.length} subscription${parsedSubscriptions.length === 1 ? '' : 's'}...`));
      
      // Create a streaming token first
      const tokenResponse = await fetch(`${this.apiUrl}/api/token/${projectName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'streaming',
          subscriptions: parsedSubscriptions,
          expires_in: options.expires ? parseInt(options.expires, 10) : 3600,
          api_key: apiKey
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        console.error(chalk.red(`Token creation failed: ${tokenData.error || 'Unknown error'}`));
        return;
      }

      console.log(chalk.green('✅ Connected to stream!'));
      console.log(`  Token: ${chalk.yellow(tokenData.token)}`);
      console.log(`  Subscriptions: ${chalk.cyan(parsedSubscriptions.length)}`);
      console.log('');
      console.log(chalk.blue('📡 Listening for real-time updates... (Press Ctrl+C to stop)'));
      console.log('');

      // Connect to SSE stream using token only (subscriptions are stored in the token)
      const { EventSource } = await import('eventsource');
      const eventSource = new EventSource(`${this.apiUrl}/api/subscribe/${projectName}?token=${tokenData.token}`);

      eventSource.onopen = () => {
        console.log(chalk.green('🔗 Stream connection established'));
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const timestamp = new Date().toLocaleTimeString();
          
          if (data.type === 'connected') {
            console.log(chalk.green(`[${timestamp}] ✅ Connected (ID: ${data.connectionId})`));
          } else if (data.type === 'ping') {
            if (options.verbose) {
              console.log(chalk.gray(`[${timestamp}] 💓 Heartbeat`));
            }
          } else if (data.type === 'message') {
            console.log(chalk.cyan(`[${timestamp}] 📨 Message received:`));
            console.log(chalk.white(`  Subscription: ${JSON.stringify(data.subscription)}`));
            console.log(chalk.white(`  Data: ${JSON.stringify(data.data, null, 2)}`));
          } else {
            console.log(chalk.yellow(`[${timestamp}] 📡 ${JSON.stringify(data)}`));
          }
        } catch (error) {
          console.log(chalk.red(`[${new Date().toLocaleTimeString()}] ❌ Parse error: ${event.data}`));
        }
      };

      eventSource.onerror = (error) => {
        console.error(chalk.red('❌ Stream connection error:'), error);
        eventSource.close();
      };

      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n🔌 Closing stream connection...'));
        eventSource.close();
        process.exit(0);
      });

    } catch (error) {
      console.error(chalk.red('Error connecting to stream:'), error.message);
    }
  }

  async search(query, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options);

    try {
      // Handle flag aliases for backward compatibility  
      // Commander.js converts --min-score and --minScore both to minScore
      // Commander.js converts --top-k and --topK both to topK
      const minScore = options.minScore;
      const topK = options.topK || options.limit;
      
      if (!options.json) {
        let searchDescription = 'Searching';
        if (options.collection) {
          searchDescription += ` in collection "${options.collection}"`;
        } else if (options.orgWide) {
          searchDescription += ` in the organization`;
        } else {
          searchDescription += ` in project "${projectName}"`;
        }
        searchDescription += ` for: "${query}"...`;
        console.log(chalk.blue(searchDescription));
      }

      let effectiveMinScore;
      if (minScore) {
        const score = parseFloat(minScore);
        if (!isNaN(score)) {
          if (score > 1 && score <= 100) {
            effectiveMinScore = score / 100;
            if (!options.json) {
              console.log(chalk.gray(`(Note: --min-score ${score} was auto-corrected to ${effectiveMinScore})`));
            }
          } else {
            effectiveMinScore = score;
          }
        }
      }

      const payload = {
        query,
        collection: options.collection || null,
        orgWide: options.orgWide || false,
        minScore: effectiveMinScore,
        topK: topK ? parseInt(topK, 10) : undefined,
      };

      // Add filters if provided
      if (options.filters) {
        try {
          payload.filters = JSON.parse(options.filters);
        } catch (error) {
          throw new Error('Filters must be valid JSON');
        }
      }

      const response = await fetch(`${this.apiUrl}/api/search/${projectName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        if (options.json) {
          console.log(JSON.stringify({
            success: false,
            error: data.error || 'Search failed'
          }, null, 2));
          return;
        }
        throw new Error(data.error || 'Search failed');
      }

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          query: query,
          project: projectName,
          collection: options.collection || null,
          total: data.items.length,
          items: data.items
        }, null, 2));
      } else {
        console.log(chalk.green(`✅ Found ${data.items.length} results:`));
        
        if (data.items.length === 0) {
          return;
        }

        data.items.forEach((item, index) => {
          console.log(`  ${index + 1}. ${item.id} (Score: ${item._score.toFixed(4)})`);
          if (item.type === 'key') {
            // For key/value pairs, show the key.
            console.log(`     ${chalk.green(item.name)}: ${JSON.stringify(item.value)}`);
          } else if (item.type === 'collection_item') {
            // For collection items, show the collection name.
            console.log(`     ${chalk.blue(item.name)}: ${JSON.stringify(item.value)}`);
          } else {
            // Fallback for any other type
            console.log(`     ${JSON.stringify(item.value)}`);
          }
          console.log(`     ${chalk.dim(new Date(item.createdAt).toLocaleString())}`);
        });
      }

    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({
          success: false,
          error: error.message
        }, null, 2));
      } else {
        throw new Error(`Search failed: ${error.message}`);
      }
    }
  }

  // List all available projects
  async listProjects() {
    const projects = await this.config.listProjects()
    const detected = await this.config.detectProject()
    
    if (Object.keys(projects).length === 0) {
      console.log(chalk.yellow('No projects found.'))
      console.log(chalk.gray('Run "shov new" to create your first project.'))
      return
    }

    console.log(chalk.bold('Available Projects:'))
    console.log('')
    
    for (const [name, project] of Object.entries(projects)) {
      const isActive = detected && detected.projectName === name
      const marker = isActive ? chalk.green('●') : chalk.gray('○')
      const status = isActive ? chalk.green('(active)') : ''
      
      console.log(`  ${marker} ${chalk.cyan(name)} ${status}`)
      console.log(`    Email: ${chalk.gray(project.email)}`)
      console.log(`    Created: ${chalk.gray(new Date(project.createdAt).toLocaleDateString())}`)
      console.log('')
    }
    
    if (!detected) {
      console.log(chalk.gray('Use "shov switch <project>" to activate a project.'))
    }
  }

  // Switch to a different project
  async switchProject(projectName) {
    const project = await this.config.getProject(projectName)
    
    if (!project) {
      console.log(chalk.red(`Project "${projectName}" not found.`))
      console.log('')
      console.log(chalk.gray('Available projects:'))
      
      const projects = await this.config.listProjects()
      for (const name of Object.keys(projects)) {
        console.log(`  • ${chalk.cyan(name)}`)
      }
      return
    }

    // Save as local config
    await this.config.saveLocalConfig({
      project: projectName,
      apiKey: project.apiKey,
      email: project.email
    })

    console.log(chalk.green(`✅ Switched to project "${projectName}"`))
    console.log(`  Email: ${chalk.gray(project.email)}`)
    console.log(`  API Key: ${chalk.yellow(project.apiKey.substring(0, 20) + '...')}`)
  }

  // Show current user and project information
  async whoami() {
    const detected = await this.config.detectProject()
    const globalConfig = await this.config.loadGlobalConfig()
    
    console.log(chalk.bold('Current User & Project:'))
    console.log('')
    
    if (globalConfig.email) {
      console.log(`  User: ${chalk.cyan(globalConfig.email)}`)
    } else {
      console.log(`  User: ${chalk.gray('Not set')}`)
    }
    
    if (detected) {
      console.log(`  Project: ${chalk.cyan(detected.projectName)}`)
      console.log(`  API Key: ${chalk.yellow(detected.apiKey.substring(0, 20) + '...')}`)
      console.log(`  Source: ${chalk.gray(detected.source)}`)
    } else {
      console.log(`  Project: ${chalk.gray('None active')}`)
      console.log('')
      console.log(chalk.gray('Run "shov new" to create a project or "shov switch <project>" to activate one.'))
    }
  }

  // Edge Functions Management
  async edgeList(options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    try {
      const result = await this.apiCall(`/edge-list/${projectName}`, {}, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      if (!result.functions || result.functions.length === 0) {
        console.log(chalk.yellow('No edge functions found.'))
        console.log(chalk.gray('Run "shov edge create <name> <file>" to deploy your first function.'))
        return
      }
      
      console.log(chalk.bold(`Edge Functions (${result.functions.length}):`))
      console.log('')
      
      result.functions.forEach(func => {
        console.log(`  ${chalk.cyan(func.name)}`)
        console.log(`    URL: ${chalk.blue(func.url || `https://${projectName}.shov.com/api/${func.name}`)}`)
        console.log(`    Size: ${chalk.gray(func.size || 'Unknown')}`)
        console.log(`    Updated: ${chalk.gray(new Date(func.deployedAt || func.updatedAt).toLocaleString())}`)
        console.log('')
      })
    } catch (error) {
      throw new Error(`Failed to list edge functions: ${error.message}`)
    }
  }

  async edgeCreate(functionName, filePath, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }
    
    const code = fs.readFileSync(filePath, 'utf8')
    const config = {
      timeout: options.timeout ? parseInt(options.timeout) : 10000,
      description: options.description || `Edge function: ${functionName}`
    }
    
    try {
      const result = await this.apiCall(`/edge-create/${projectName}`, {
        name: functionName,
        code,
        config
      }, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      console.log(chalk.green(`✅ Edge function "${functionName}" created successfully!`))
      console.log(`   URL: ${chalk.blue(result.url || `https://${projectName}.shov.com/api/${functionName}`)}`)
      console.log(`   Size: ${chalk.gray(result.size || 'Unknown')}`)
      console.log(`   Deployed: ${chalk.gray(new Date(result.deployedAt || Date.now()).toLocaleString())}`)
    } catch (error) {
      throw new Error(`Failed to create edge function: ${error.message}`)
    }
  }

  async edgeUpdate(functionName, filePath, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }
    
    const code = fs.readFileSync(filePath, 'utf8')
    const config = {
      timeout: options.timeout ? parseInt(options.timeout) : 10000,
      description: options.description || `Edge function: ${functionName}`
    }
    
    try {
      const result = await this.apiCall(`/edge-update/${projectName}`, {
        name: functionName,
        code,
        config
      }, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      console.log(chalk.green(`✅ Edge function "${functionName}" updated successfully!`))
      console.log(`   URL: ${chalk.blue(result.url || `https://${projectName}.shov.com/api/${functionName}`)}`)
      console.log(`   Version: ${chalk.gray(result.version || 'Unknown')}`)
      console.log(`   Updated: ${chalk.gray(new Date(result.deployedAt || Date.now()).toLocaleString())}`)
    } catch (error) {
      throw new Error(`Failed to update edge function: ${error.message}`)
    }
  }

  async edgeDelete(functionName, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    try {
      const result = await this.apiCall(`/edge-delete/${projectName}`, {
        name: functionName
      }, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      console.log(chalk.green(`✅ Edge function "${functionName}" deleted successfully!`))
    } catch (error) {
      throw new Error(`Failed to delete edge function: ${error.message}`)
    }
  }

  async edgeRollback(functionName, version, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    try {
      const result = await this.apiCall(`/edge-rollback/${projectName}`, {
        name: functionName,
        version: version ? parseInt(version) : undefined
      }, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      console.log(chalk.green(`✅ Edge function "${functionName}" rolled back successfully!`))
      console.log(`   Version: ${chalk.gray(result.version || 'Previous')}`)
      console.log(`   Rolled back: ${chalk.gray(new Date().toLocaleString())}`)
    } catch (error) {
      throw new Error(`Failed to rollback edge function: ${error.message}`)
    }
  }

  async edgeLogs(functionName, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    try {
      const endpoint = options.follow ? `/edge-tail/${projectName}` : `/edge-logs/${projectName}`
      const payload = functionName ? { functionName } : {}
      
      if (options.follow) {
        console.log(chalk.blue(`Following logs for ${functionName ? `function "${functionName}"` : 'all functions'}...`))
        console.log(chalk.gray('Press Ctrl+C to stop'))
        console.log('')
        
        // For follow mode, we'd need to implement SSE streaming
        // For now, just show recent logs
        console.log(chalk.yellow('Note: Real-time log following not yet implemented in CLI'))
        console.log(chalk.gray('Showing recent logs instead...'))
        console.log('')
      }
      
      const result = await this.apiCall(endpoint, payload, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      if (!result.logs || result.logs.length === 0) {
        console.log(chalk.yellow('No logs found.'))
        return
      }
      
      console.log(chalk.bold(`Logs (${result.logs.length} entries):`))
      console.log('')
      
      result.logs.forEach(log => {
        const timestamp = chalk.gray(new Date(log.timestamp).toLocaleString())
        const level = log.level === 'error' ? chalk.red(log.level.toUpperCase()) : 
                     log.level === 'warn' ? chalk.yellow(log.level.toUpperCase()) : 
                     chalk.blue(log.level.toUpperCase())
        const func = log.function ? chalk.cyan(`[${log.function}]`) : ''
        const region = log.region ? chalk.gray(`(${log.region})`) : ''
        
        console.log(`${timestamp} ${level} ${func} ${region}`)
        console.log(`  ${log.message}`)
        if (log.duration) {
          console.log(`  ${chalk.gray(`Duration: ${log.duration}`)}`)
        }
        console.log('')
      })
    } catch (error) {
      throw new Error(`Failed to get edge function logs: ${error.message}`)
    }
  }

  // Secrets Management
  async secretsList(options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    try {
      const result = await this.apiCall(`/secrets-list/${projectName}`, {}, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      if (!result.secrets || result.secrets.length === 0) {
        console.log(chalk.yellow('No secrets found.'))
        console.log(chalk.gray('Run "shov secrets set <name> <value>" to create your first secret.'))
        return
      }
      
      console.log(chalk.bold(`Secrets (${result.secrets.length}):`))
      console.log('')
      
      result.secrets.forEach(secret => {
        console.log(`  ${chalk.cyan(secret)}`)
      })
      
      console.log('')
      console.log(chalk.gray('Note: Secret values are never displayed for security.'))
    } catch (error) {
      throw new Error(`Failed to list secrets: ${error.message}`)
    }
  }

  async secretsSet(name, value, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    const functions = options.functions ? options.functions.split(',').map(f => f.trim()) : []
    
    try {
      const result = await this.apiCall(`/secrets-set/${projectName}`, {
        name,
        value,
        functions
      }, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      console.log(chalk.green(`✅ Secret "${name}" set successfully!`))
      if (functions.length > 0) {
        console.log(`   Functions: ${chalk.gray(functions.join(', '))}`)
      } else {
        console.log(`   ${chalk.gray('Available to all functions')}`)
      }
    } catch (error) {
      throw new Error(`Failed to set secret: ${error.message}`)
    }
  }

  async secretsSetMany(secretsJson, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    let secrets
    try {
      secrets = JSON.parse(secretsJson)
    } catch (error) {
      throw new Error(`Invalid JSON: ${error.message}`)
    }
    
    if (!Array.isArray(secrets)) {
      throw new Error('Secrets must be an array of objects with "name" and "value" properties')
    }
    
    const functions = options.functions ? options.functions.split(',').map(f => f.trim()) : []
    
    try {
      const result = await this.apiCall(`/secrets-set-many/${projectName}`, {
        secrets,
        functions
      }, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      console.log(chalk.green(`✅ ${secrets.length} secrets set successfully!`))
      console.log(`   Secrets: ${chalk.cyan(result.secretNames.join(', '))}`)
      if (functions.length > 0) {
        console.log(`   Functions: ${chalk.gray(functions.join(', '))}`)
      } else {
        console.log(`   ${chalk.gray('Available to all functions')}`)
      }
      
      if (result.results) {
        console.log('')
        console.log(chalk.bold('Results by function:'))
        result.results.forEach(res => {
          console.log(`  ${chalk.cyan(res.function)}: ${res.secretsSet} secrets set (${res.totalSecrets} total)`)
        })
      }
    } catch (error) {
      throw new Error(`Failed to set secrets: ${error.message}`)
    }
  }

  async secretsDelete(name, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    const functions = options.functions ? options.functions.split(',').map(f => f.trim()) : []
    
    try {
      const result = await this.apiCall(`/secrets-delete/${projectName}`, {
        name,
        functions
      }, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      console.log(chalk.green(`✅ Secret "${name}" deleted successfully!`))
      if (functions.length > 0) {
        console.log(`   Functions: ${chalk.gray(functions.join(', '))}`)
      } else {
        console.log(`   ${chalk.gray('Deleted from all functions')}`)
      }
    } catch (error) {
      throw new Error(`Failed to delete secret: ${error.message}`)
    }
  }

  // Helper method to deploy blocks after project creation
  async deployBlocksAfterProjectCreation(blocksString, projectName, apiKey) {
    const { default: ora } = await import('ora')
    
    const blocks = blocksString.split(',').map(b => b.trim()).filter(Boolean)
    if (blocks.length === 0) return
    
    console.log(chalk.bold(`\n📦 Deploying ${blocks.length} block${blocks.length > 1 ? 's' : ''}...`))
    
    for (const blockSlug of blocks) {
      const spinner = ora(`Deploying ${blockSlug}...`).start()
      
      try {
        const params = new URLSearchParams()
        params.append('project', projectName)
        
        const url = `/blocks/deploy/${blockSlug}?${params.toString()}`
        const result = await this.apiCall(url, {}, apiKey, {})
        
        spinner.succeed(`${blockSlug} deployed successfully`)
        
        if (result.functionsDeployed && result.functionsDeployed.length > 0) {
          console.log(`  ${chalk.gray('Functions:')} ${result.functionsDeployed.join(', ')}`)
        }
        
        if (result.secretsCreated && result.secretsCreated.length > 0) {
          console.log(`  ${chalk.gray('Secrets created:')} ${result.secretsCreated.join(', ')}`)
        }
      } catch (error) {
        spinner.fail(`Failed to deploy ${blockSlug}: ${error.message}`)
      }
    }
    
    console.log(chalk.gray('\n💡 Set secret values with: shov secrets set <name> <value>'))
  }

  // ============================================================================
  // BLOCKS MANAGEMENT
  // ============================================================================

  async blocksList(options = {}) {
    try {
      const params = new URLSearchParams()
      if (options.category) params.append('category', options.category)
      if (options.author) params.append('author', options.author)
      if (options.search) params.append('search', options.search)
      
      const url = `/blocks/list${params.toString() ? '?' + params.toString() : ''}`
      const result = await this.apiCall(url, null, null, options, 'GET')
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      if (!result.blocks || result.blocks.length === 0) {
        console.log(chalk.yellow('📦 No blocks found'))
        return
      }
      
      console.log(chalk.bold(`\n📦 Available Blocks (${result.blocks.length})`))
      console.log(chalk.gray('─'.repeat(60)))
      
      result.blocks.forEach(block => {
        const author = block.author.isOfficial ? 
          chalk.blue(`@${block.author.slug}`) : 
          chalk.gray(`@${block.author.slug}`)
        
        console.log(`${chalk.cyan(block.slug)} ${chalk.gray('by')} ${author}`)
        console.log(`  ${block.description || 'No description'}`)
        console.log(`  ${chalk.gray(`v${block.latest_version} • ${block.category} • ${block.total_deployments} deployments`)}`)
        console.log()
      })
      
      if (result.pagination && result.pagination.hasNext) {
        console.log(chalk.gray(`Showing ${result.blocks.length} of ${result.pagination.total} blocks`))
        console.log(chalk.blue('Use --page and --limit options to see more'))
      }
    } catch (error) {
      throw new Error(`Failed to list blocks: ${error.message}`)
    }
  }

  async blocksShow(slug, options = {}) {
    try {
      const params = new URLSearchParams()
      if (options.version) params.append('version', options.version)
      
      const url = `/blocks/get/${slug}${params.toString() ? '?' + params.toString() : ''}`
      const result = await this.apiCall(url, null, null, options, 'GET')
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      const block = result.block
      const author = block.author.isOfficial ? 
        chalk.blue(`@${block.author.slug}`) : 
        chalk.gray(`@${block.author.slug}`)
      
      console.log(chalk.bold(`\n📦 ${block.name}`))
      console.log(`${chalk.cyan(block.slug)} ${chalk.gray('by')} ${author}`)
      console.log(`${chalk.gray('Category:')} ${block.category}`)
      console.log(`${chalk.gray('Version:')} v${block.version.version}`)
      console.log(`${chalk.gray('Deployments:')} ${block.total_deployments}`)
      console.log()
      
      if (block.description) {
        console.log(chalk.bold('Description:'))
        console.log(block.description)
        console.log()
      }
      
      if (block.version.readme) {
        console.log(chalk.bold('README:'))
        console.log(block.version.readme)
        console.log()
      }
      
      if (block.functions && block.functions.length > 0) {
        console.log(chalk.bold(`Functions (${block.functions.length}):`))
        block.functions.forEach(func => {
          const methods = func.methods ? func.methods.join(', ') : 'GET'
          console.log(`  ${chalk.cyan(func.name)} ${chalk.gray(`[${methods}]`)}`)
          if (func.description) {
            console.log(`    ${func.description}`)
          }
          if (func.path) {
            console.log(`    ${chalk.gray('Path:')} ${func.path}`)
          }
        })
        console.log()
      }
      
      if (block.secrets && block.secrets.length > 0) {
        console.log(chalk.bold(`Required Secrets (${block.secrets.length}):`))
        block.secrets.forEach(secret => {
          const required = secret.required ? chalk.red('*') : chalk.gray('?')
          console.log(`  ${required} ${chalk.yellow(secret.name)}`)
          if (secret.description) {
            console.log(`    ${secret.description}`)
          }
        })
        console.log()
      }
      
      if (block.collections && block.collections.length > 0) {
        console.log(chalk.bold(`Collections (${block.collections.length}):`))
        block.collections.forEach(collection => {
          console.log(`  ${chalk.magenta(collection.name)}`)
          if (collection.description) {
            console.log(`    ${collection.description}`)
          }
        })
        console.log()
      }
      
      console.log(chalk.gray('─'.repeat(60)))
      console.log(`${chalk.blue('Deploy:')} shov blocks deploy ${block.slug}`)
      if (options.version !== block.latest_version) {
        console.log(`${chalk.blue('Latest:')} shov blocks show ${block.slug}`)
      }
    } catch (error) {
      throw new Error(`Failed to show block: ${error.message}`)
    }
  }

  async blocksDeploy(slug, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    try {
      const params = new URLSearchParams()
      if (options.version) params.append('version', options.version)
      params.append('project', projectName)
      
      const url = `/blocks/deploy/${slug}?${params.toString()}`
      const result = await this.apiCall(url, {}, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      console.log(chalk.green(`✅ ${result.message}`))
      
      if (result.functionsDeployed && result.functionsDeployed.length > 0) {
        console.log(chalk.bold('\nFunctions deployed:'))
        result.functionsDeployed.forEach(func => {
          console.log(`  ${chalk.cyan(func)}`)
        })
      }
      
      if (result.secretsCreated && result.secretsCreated.length > 0) {
        console.log(chalk.bold('\nSecrets created (with blank values):'))
        result.secretsCreated.forEach(secret => {
          console.log(`  ${chalk.yellow(secret)}`)
        })
        console.log(chalk.gray('\n💡 Set secret values with: shov secrets set <name> <value>'))
      }
      
      console.log(chalk.gray(`\nDeployment ID: ${result.deploymentId}`))
    } catch (error) {
      throw new Error(`Failed to deploy block: ${error.message}`)
    }
  }

  async blocksCreate(slug, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    try {
      // Validate required options
      if (!options.name) {
        throw new Error('Block name is required (use --name)')
      }
      if (!options.category) {
        throw new Error('Block category is required (use --category)')
      }
      if (!options.org) {
        throw new Error('Organization ID is required (use --org)')
      }
      
      // Read README if provided
      let readme = ''
      if (options.readme) {
        if (!fs.existsSync(options.readme)) {
          throw new Error(`README file not found: ${options.readme}`)
        }
        readme = fs.readFileSync(options.readme, 'utf8')
      }
      
      // Read functions from directory if provided
      let functions = []
      if (options.functions) {
        if (!fs.existsSync(options.functions)) {
          throw new Error(`Functions directory not found: ${options.functions}`)
        }
        
        const funcDir = options.functions
        const files = fs.readdirSync(funcDir).filter(f => f.endsWith('.js'))
        
        for (const file of files) {
          const funcName = path.basename(file, '.js')
          const funcPath = path.join(funcDir, file)
          const code = fs.readFileSync(funcPath, 'utf8')
          
          functions.push({
            name: funcName,
            description: `${funcName} function`,
            code: code,
            methods: ['GET', 'POST'],
            path: `/${funcName}`
          })
        }
        
        if (functions.length === 0) {
          throw new Error('No JavaScript files found in functions directory')
        }
      }
      
      const blockData = {
        slug,
        name: options.name,
        description: options.description || '',
        category: options.category,
        organizationId: options.org,
        readme,
        functions,
        secrets: [], // TODO: Parse from function code or separate config
        collections: [], // TODO: Parse from function code or separate config
        version: options.version || '1.0.0'
      }
      
      const result = await this.apiCall('/blocks/create', blockData, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      console.log(chalk.green(`✅ ${result.message}`))
      console.log(`${chalk.gray('Block ID:')} ${result.blockId}`)
      console.log(`${chalk.gray('Slug:')} ${chalk.cyan(result.slug)}`)
      console.log(`${chalk.gray('Version:')} v${result.version}`)
      
      if (functions.length > 0) {
        console.log(`${chalk.gray('Functions:')} ${functions.length}`)
      }
      
      console.log(chalk.gray('\n💡 Your block is now available at:'))
      console.log(chalk.blue(`   https://shov.com/blocks/${result.slug}`))
    } catch (error) {
      throw new Error(`Failed to create block: ${error.message}`)
    }
  }

  async blocksVersions(slug, options = {}) {
    try {
      // TODO: Implement versions endpoint in API
      const result = await this.apiCall(`/blocks/versions/${slug}`, null, null, options, 'GET')
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      console.log(chalk.bold(`\n📦 ${slug} - Version History`))
      console.log(chalk.gray('─'.repeat(60)))
      
      if (!result.versions || result.versions.length === 0) {
        console.log(chalk.yellow('No versions found'))
        return
      }
      
      result.versions.forEach(version => {
        const isLatest = version.version === result.latestVersion
        const versionLabel = isLatest ? 
          chalk.green(`v${version.version} (latest)`) : 
          chalk.gray(`v${version.version}`)
        
        console.log(`${versionLabel} - ${chalk.gray(version.createdAt)}`)
        if (version.changelog) {
          console.log(`  ${version.changelog}`)
        }
        console.log()
      })
    } catch (error) {
      throw new Error(`Failed to get block versions: ${error.message}`)
    }
  }
}

module.exports = { ShovCLI }
