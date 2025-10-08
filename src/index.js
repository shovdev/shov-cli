const fs = require('fs')
const path = require('path')
const chalk = require('chalk')
const { ShovConfig } = require('./config')

// Dynamic import for node-fetch
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args))

// Get __dirname equivalent in CommonJS
const __dirname = __dirname || path.dirname(require.main.filename)

class ShovCLI {
  constructor(options = {}) {
    // Public CLI uses production by default
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

    if (response.status === 401 && data.details?.reason === 'AUTHENTICATION_REQUIRED') {
      // Authentication required
      spinner.fail(data.error)
      console.log('')
      console.log(chalk.yellow('💡 Make sure you&apos;re providing the correct API key for this project.'))
      console.log(chalk.gray('   If you created this project anonymously, the API key should be in your .shov file.'))
      console.log(chalk.gray('   You can also specify the API key with: shov claim <email> -k <apiKey>'))
      return
    }

    if (response.status === 403) {
      if (data.details?.reason === 'FREE_TIER_PROJECT_LIMIT') {
        // Free tier project limit reached
        spinner.fail(data.error)
        console.log('')
        console.log(chalk.yellow('📊 Your current plan:'))
        console.log(chalk.white(`   Organization: ${data.details.organizationName}`))
        console.log(chalk.white(`   Projects: ${data.details.currentProjects}/${data.details.maxProjects}`))
        console.log('')
        console.log(chalk.cyan('🚀 Upgrade to Pro for unlimited projects:'))
        console.log(chalk.white(`   ${data.details.upgradeUrl}`))
        console.log('')
        console.log(chalk.blue('💡 Pro includes: Unlimited projects, premium support, and more!'))
        return
      } else if (data.details?.reason === 'PROJECT_ALREADY_CLAIMED') {
        // Project already claimed
        spinner.fail(data.error)
        console.log('')
        console.log(chalk.blue('💡 If this is your project, log in at https://shov.com to manage it.'))
        return
      }
      // Generic 403 error
      spinner.fail(`${operation} failed: ${data.error || 'Permission denied'}`)
      return
    }

    if (response.status === 404 && data.details?.reason === 'PROJECT_NOT_FOUND') {
      // Project not found
      spinner.fail(data.error)
      console.log('')
      console.log(chalk.blue('💡 Tip: Make sure you&apos;re using the exact project name. Project names are case-sensitive.'))
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
    
    // Generic error handling with upgrade message if available
    spinner.fail(`${operation} failed: ${data.error || response.statusText}`)
    
    if (data.upgradeMessage) {
      console.log('')
      console.log(chalk.cyan(`💡 ${data.upgradeMessage}`))
    }
  }

  async apiCall(path, body, apiKey, options = {}, method = 'POST') {
    const { verbose } = options;
    const url = `${this.apiUrl}/api${path}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };

    if (verbose) {
      console.log(chalk.gray(`> ${method} ${url}`));
      if (body) {
        console.log(chalk.gray(`> Payload: ${JSON.stringify(body, null, 2)}`));
      }
    }

    const fetchOptions = {
      method: method,
      headers
    };

    // Only add body for non-GET/HEAD requests
    if (method !== 'GET' && method !== 'HEAD' && body !== null && body !== undefined) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

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
    // Sleek, minimal header
    console.log('\n')
    console.log(chalk.bold.white('     SHOV'))
    console.log(chalk.gray('     ────'))
    console.log('\n')
    
    // Main Headlines with better spacing
    console.log(chalk.bold.white('  Ship Production Backends in Seconds, Not Weeks\n'))
    console.log(chalk.gray('  The instant database for AI native apps.'))
    console.log(chalk.gray('  Zero provisioning, vector search, and millisecond responses.\n'))
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

  async showProjectDetails(projectName, apiKey, projectUrl) {
    const { default: ora } = await import('ora')
    
    // Helper for delays and animation
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))
    
    console.log('\n')
    
    // Animated reveal of each detail
    const spinner = ora({ text: 'Setting up your project...', spinner: 'dots12' }).start()
    await delay(600)
    spinner.stop()
    
    // Hero the URL - most important info
    console.log(chalk.bold.white('  Your Shov backend is live:\n'))
    console.log(chalk.cyan.bold(`  ${projectUrl}\n`))
    
    await delay(400)
    
    // Project name
    const nameSpinner = ora({ text: '', spinner: 'dots12' }).start()
    await delay(300)
    nameSpinner.stop()
    console.log(chalk.gray('  Project:    ') + chalk.white(projectName))
    
    await delay(300)
    
    // API Key
    const keySpinner = ora({ text: '', spinner: 'dots12' }).start()
    await delay(300)
    keySpinner.stop()
    console.log(chalk.gray('  API Key:    ') + chalk.yellow(apiKey))
    
    await delay(300)
    
    // Config saved
    const configSpinner = ora({ text: '', spinner: 'dots12' }).start()
    await delay(300)
    configSpinner.succeed(chalk.gray('  Config saved to .shov and .env'))
    
    console.log('\n')
  }

  async showFirstTimeExamples(projectUrl) {
    console.log(chalk.green('📚 Next steps:\n'))
    
    // Add delay helper
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))
    
    // Key-value storage (moved up)
    await delay(500)
    console.log(chalk.gray('   Key-value storage:'))
    console.log(chalk.gray('   ') + chalk.white('shov set') + chalk.gray(' config ') + chalk.cyan('\'{"theme": "dark", "notifications": true}\''))
    console.log(chalk.gray('   ') + chalk.white('shov get') + chalk.gray(' config'))
    
    // Store relational data
    await delay(700)
    console.log(chalk.gray('\n   Store relational data:'))
    console.log(chalk.gray('   ') + chalk.white('shov add') + chalk.gray(' users ') + chalk.cyan('\'{"name": "Alice", "email": "alice@example.com"}\''))
    
    // Retrieve data  
    await delay(700)
    console.log(chalk.gray('\n   Retrieve data:'))
    console.log(chalk.gray('   ') + chalk.white('shov where') + chalk.gray(' users'))
    console.log(chalk.gray('   ') + chalk.white('shov where') + chalk.gray(' users ') + chalk.cyan('\'{"name": "Alice"}\''))
    
    // Vector search with magic
    await delay(700)
    console.log(chalk.gray('\n   ✨ Vector search (all data auto-embedded):'))
    console.log(chalk.gray('   ') + chalk.white('shov search') + chalk.gray(' ') + chalk.cyan('"find users named Alice"'))
    console.log(chalk.gray('   ') + chalk.dim('Natural language queries across collections or entire project'))
    
    // Upload files
    await delay(700)
    console.log(chalk.gray('\n   Upload files:'))
    console.log(chalk.gray('   ') + chalk.white('shov upload') + chalk.gray(' ./document.pdf'))
    
    await delay(500)
    console.log(chalk.gray('\n   📚 Full documentation: ') + chalk.cyan('https://shov.com'))
    console.log(chalk.gray('   💬 Join our community: ') + chalk.cyan('discord.gg/GB3rDcFrGz') + chalk.gray(' • ') + chalk.cyan('reddit.com/r/shov'))
    console.log(chalk.gray('   🐦 Follow us: ') + chalk.cyan('x.com/shovdev'))
    
    console.log('\n' + chalk.green.bold('🎯 Your project is ready to use!\n'))
    
    // Show backend URL again as final call-to-action
    if (projectUrl) {
      console.log(chalk.gray('   👉 Open your live backend: ') + chalk.cyan.bold(projectUrl))
      console.log('\n')
    }
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
      return this.createProjectWithEmail(projectName, options.email, options)
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
          starter: options.starter || null,
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
        spinner.succeed(`Project created successfully!`)
        
        // Save config first
        await this.config.saveLocalConfig({
          project: data.project.name,
          apiKey: data.project.apiKey,
        })
        this.addToEnv(data.project.apiKey, data.project.name)
        
        if (isFirstTimeUser) {
          // Show animated project details with URL hero'd
          await this.showProjectDetails(
            data.project.name, 
            data.project.apiKey, 
            data.project.url
          )
          
          // Show next steps with examples (pass URL for final call-to-action)
          await this.showFirstTimeExamples(data.project.url)
        } else {
          // Minimal output for returning users but still show URL
          console.log('\n')
          console.log(chalk.gray('  Shov backend URL: ') + chalk.cyan(data.project.url))
          console.log(chalk.gray('  API Key:     ') + chalk.yellow(data.project.apiKey))
          console.log(chalk.gray('  Config saved to .shov and .env'))
          console.log('\n')
        }
      } else {
        spinner.fail(`❌ Project creation failed: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      spinner.fail('Project creation failed.')
      console.error(`Error: ${error.message}`)
    }
  }

  async createProjectWithEmail(projectName, email, options = {}) {
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
          starter: options.starter || null,
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
            starter: options.starter || null,
          }),
        })

        if (!verifyResponse.ok) {
          const verifyData = await verifyResponse.json().catch(() => ({}))
          this.handleApiError(verifyResponse, verifyData, spinner, 'Verification')
          return
        }

        const verifyData = await verifyResponse.json()

        if (verifyData.success) {
          spinner.succeed(`Project verified and created successfully!`)
          
          // Save config first
          await this.config.saveLocalConfig({
            project: verifyData.project.name,
            apiKey: verifyData.project.apiKey,
          })
          this.addToEnv(verifyData.project.apiKey, verifyData.project.name)
          
          if (isFirstTimeUser) {
            // Show animated project details with URL hero'd
            await this.showProjectDetails(
              verifyData.project.name, 
              verifyData.project.apiKey, 
              verifyData.project.url
            )
            
            // Show next steps with examples
            await this.showFirstTimeExamples()
          } else {
            // Minimal output for returning users but still show URL
            console.log('\n')
            console.log(chalk.gray('  Shov backend URL: ') + chalk.cyan(verifyData.project.url))
            console.log(chalk.gray('  API Key:     ') + chalk.yellow(verifyData.project.apiKey))
            console.log(chalk.gray('  Config saved to .shov and .env'))
            console.log('\n')
          }
        } else {
          spinner.fail(`❌ Verification failed: ${verifyData.error || 'Unknown error'}`)
        }
      } else if (data.success) {
        // Direct creation without verification (shouldn't happen with email)
        spinner.succeed(`Project created successfully!`)
        
        await this.config.saveLocalConfig({
          project: data.project.name,
          apiKey: data.project.apiKey,
        })
        this.addToEnv(data.project.apiKey, data.project.name)
        
        // Show URL even for edge case
        console.log('\n')
        console.log(chalk.gray('  Shov backend URL: ') + chalk.cyan(data.project.url))
        console.log(chalk.gray('  API Key:     ') + chalk.yellow(data.project.apiKey))
        console.log(chalk.gray('  Config saved to .shov and .env'))
        console.log('\n')
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
    let apiKey = options.key;

    // Try to detect project and API key from .shov file if not provided
    if (!finalProjectName || !apiKey) {
      try {
        const detected = await this.config.detectProject();
        if (detected) {
          if (!finalProjectName && detected.projectName) {
            finalProjectName = detected.projectName;
            console.log(chalk.gray(`Project '${finalProjectName}' detected from local .shov file.`));
          }
          if (!apiKey && detected.apiKey) {
            apiKey = detected.apiKey;
            console.log(chalk.gray(`API key loaded from local .shov file.`));
          }
        }
      } catch (error) {
        // Ignore detection errors, we'll validate below
      }
    }

    // Validate we have all required information
    if (!finalProjectName) {
      console.error(chalk.red('Error: No project name specified and no local project found.'));
      console.log(chalk.yellow('Usage: shov claim <email> [projectName] [-k <apiKey>]'));
      return;
    }

    if (!apiKey) {
      console.error(chalk.red('Error: No API key found.'));
      console.log(chalk.yellow('\nPlease provide an API key using:'));
      console.log(chalk.white('  shov claim <email> -k <apiKey>'));
      console.log(chalk.gray('\nOr ensure your .shov file contains both "project" and "apiKey" fields.'));
      if (finalProjectName) {
        console.log(chalk.gray(`\nDetected project "${finalProjectName}" but missing API key in .shov file.`));
      }
      return;
    }

    let spinner = ora(`Initiating claim for project '${finalProjectName}'...`).start();
    try {
      // Step 1: Initiate the claim and trigger OTP
      const initiateResponse = await fetch(`${this.apiUrl}/api/claim/initiate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
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
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ projectName: finalProjectName, email, pin }),
      });
      
      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok || !verifyData.success) {
        this.handleApiError(verifyResponse, verifyData, spinner, 'Claim verification');
        return;
      }

      spinner.succeed(verifyData.message);
      
      // Display project information
      if (verifyData.project) {
        console.log('');
        console.log(chalk.bold.cyan('📦 Project Details:'));
        console.log(chalk.white(`   Name: ${verifyData.project.name}`));
        console.log(chalk.white(`   Organization: ${verifyData.project.organizationSlug}`));
        console.log(chalk.white(`   Backend URL: ${verifyData.project.url}`));
        console.log('');
        console.log(chalk.green('✓ Your existing API key will continue to work for this project.'));
        console.log(chalk.gray('   No need to update your code - everything keeps working!'));
        console.log('');
        console.log(chalk.blue('💡 Manage your project at https://shov.com'));
      } else {
        console.log(chalk.green('You can now manage this project from your account.'));
      }

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
        const data = await this.apiCall(`/data/${projectName}/files-list`, {}, apiKey, options);
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
        const data = await this.apiCall(`/data/${projectName}/files-list`, {}, apiKey, options);
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
        const data = await this.apiCall(`/data/${projectName}/files-get/${fileId}`, {}, apiKey, options);
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
        const data = await this.apiCall(`/data/${projectName}/files-delete/${fileId}`, {}, apiKey, options, 'DELETE');
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

  // Code Functions Management
  async codeList(options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    try {
      const result = await this.apiCall(`/code-list/${projectName}`, {}, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      if (!result.functions || result.functions.length === 0) {
        console.log(chalk.yellow('No code functions found.'))
        console.log(chalk.gray('Run "shov code write <name> <file>" to deploy your first function.'))
        return
      }
      
      console.log(chalk.bold(`Code Functions (${result.functions.length}):`))
      console.log('')
      
      result.functions.forEach(func => {
        console.log(`  ${chalk.cyan(func.name)}`)
        console.log(`    URL: ${chalk.blue(func.url || `https://${projectName}.shov.com/api/${func.name}`)}`)
        console.log(`    Size: ${chalk.gray(func.size || 'Unknown')}`)
        console.log(`    Updated: ${chalk.gray(new Date(func.deployedAt || func.updatedAt).toLocaleString())}`)
        console.log('')
      })
    } catch (error) {
      throw new Error(`Failed to list code functions: ${error.message}`)
    }
  }

  async codeWrite(functionName, filePath, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }
    
    const code = fs.readFileSync(filePath, 'utf8')
    const config = {
      timeout: options.timeout ? parseInt(options.timeout) : 10000,
      description: options.description || `Code function: ${functionName}`
    }
    
    try {
      const result = await this.apiCall(`/code-write/${projectName}`, {
        name: functionName,
        code,
        config
      }, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      console.log(chalk.green(`✅ Code function "${functionName}" written successfully!`))
      console.log(`   URL: ${chalk.blue(result.url || `https://${projectName}.shov.com/api/${functionName}`)}`)
      console.log(`   Version: ${chalk.gray(result.version || 'Unknown')}`)
      console.log(`   Deployed: ${chalk.gray(new Date(result.deployedAt || Date.now()).toLocaleString())}`)
    } catch (error) {
      throw new Error(`Failed to write code function: ${error.message}`)
    }
  }

  async codeRead(functionName, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    try {
      const result = await this.apiCall(`/code-read/${projectName}/${functionName}`, {}, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      console.log(chalk.bold(`Code Function: ${chalk.cyan(functionName)}`))
      console.log('')
      console.log(chalk.gray(`Version: ${result.version || 'Unknown'}`))
      console.log(chalk.gray(`Size: ${result.size || 'Unknown'}`))
      console.log(chalk.gray(`Deployed: ${new Date(result.deployedAt || Date.now()).toLocaleString()}`))
      console.log('')
      console.log(chalk.bold('Source Code:'))
      console.log('')
      console.log(result.code)
    } catch (error) {
      throw new Error(`Failed to read code function: ${error.message}`)
    }
  }

  async codeDelete(functionName, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    try {
      const result = await this.apiCall(`/code-delete/${projectName}/${functionName}`, { 
        name: functionName 
      }, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      console.log(chalk.green(`✅ Code function "${functionName}" deleted successfully!`))
    } catch (error) {
      throw new Error(`Failed to delete code function: ${error.message}`)
    }
  }

  async codeRollback(functionName, version, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    try {
      const result = await this.apiCall(`/code-rollback/${projectName}`, {
        name: functionName,
        version: version ? parseInt(version) : undefined
      }, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      console.log(chalk.green(`✅ Code function "${functionName}" rolled back successfully!`))
      console.log(`   Version: ${chalk.gray(result.version || 'Previous')}`)
      console.log(`   Rolled back: ${chalk.gray(new Date().toLocaleString())}`)
    } catch (error) {
      throw new Error(`Failed to rollback code function: ${error.message}`)
    }
  }

  async codeLogs(functionName, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    try {
      const endpoint = options.follow ? `/code-tail/${projectName}` : `/code-logs/${projectName}`
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
      throw new Error(`Failed to get code function logs: ${error.message}`)
    }
  }

  async codePull(options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    const outputDir = options.output || '.'
    
    try {
      console.log(chalk.blue('Fetching code files from project...'))
      
      // Get list of all code files
      const listResult = await this.apiCall(`/code-list/${projectName}`, {}, apiKey, options)
      
      if (!listResult.functions || listResult.functions.length === 0) {
        console.log(chalk.yellow('No code files found in project.'))
        return
      }
      
      console.log(chalk.gray(`Found ${listResult.functions.length} code files`))
      console.log('')
      
      // Create output directory if it doesn't exist
      if (outputDir !== '.') {
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true })
          console.log(chalk.gray(`Created directory: ${outputDir}`))
        }
      }
      
      // Download each file
      let successCount = 0
      let errorCount = 0
      
      for (const func of listResult.functions) {
        try {
          // Read the code content
          const readResult = await this.apiCall(`/code-read/${projectName}/${func.name}`, {}, apiKey, options)
          
          // Determine file path
          const filePath = path.join(outputDir, func.name)
          const fileDir = path.dirname(filePath)
          
          // Create subdirectories if needed
          if (fileDir !== outputDir && fileDir !== '.') {
            fs.mkdirSync(fileDir, { recursive: true })
          }
          
          // Write file
          fs.writeFileSync(filePath, readResult.code, 'utf8')
          
          console.log(chalk.green(`✓ ${func.name}`) + chalk.gray(` (${readResult.size || 'Unknown size'})`))
          successCount++
        } catch (error) {
          console.log(chalk.red(`✗ ${func.name}`) + chalk.gray(` - ${error.message}`))
          errorCount++
        }
      }
      
      console.log('')
      if (errorCount === 0) {
        console.log(chalk.green(`✅ Successfully downloaded ${successCount} code files to ${outputDir === '.' ? 'current directory' : outputDir}`))
      } else {
        console.log(chalk.yellow(`⚠️  Downloaded ${successCount} files, ${errorCount} failed`))
      }
      
      if (options.json) {
        console.log(JSON.stringify({
          success: errorCount === 0,
          filesDownloaded: successCount,
          filesFailed: errorCount,
          outputDirectory: outputDir
        }, null, 2))
      }
    } catch (error) {
      throw new Error(`Failed to pull code files: ${error.message}`)
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
      
      // Handle new secretsByEnvironment format
      if (result.secretsByEnvironment) {
        const allSecrets = new Set()
        
        // Collect all unique secrets across environments
        Object.entries(result.secretsByEnvironment).forEach(([env, secrets]) => {
          secrets.forEach(secret => allSecrets.add(secret))
        })
        
        if (allSecrets.size === 0) {
          console.log(chalk.yellow('No secrets found.'))
          console.log(chalk.gray('Run "shov secrets set <name> <value>" to create your first secret.'))
          return
        }
        
        console.log(chalk.bold(`Secrets (${allSecrets.size}):`))
        console.log('')
        
        Array.from(allSecrets).sort().forEach(secret => {
          console.log(`  ${chalk.cyan(secret)}`)
        })
        
        console.log('')
        console.log(chalk.gray('Note: Secret values are never displayed for security.'))
        return
      }
      
      // Fallback to old format for backwards compatibility
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

  // ============================================================================
  // BACKUP & RESTORE
  // ============================================================================

  /**
   * Restore from backup
   * @param {object} options - Restore options
   */
  async restore(options = {}) {
    const { default: ora } = await import('ora');
    const { default: prompts } = await import('prompts');
    
    const { projectName, apiKey } = await this.getProjectConfig(options);
    
    try {
      // Parse timestamp
      let timestamp;
      if (options.from) {
        timestamp = this.parseTimestamp(options.from);
      } else {
        // Prompt for timestamp
        const response = await prompts({
          type: 'text',
          name: 'timestamp',
          message: 'When do you want to restore from? (e.g., "2 hours ago", "2024-10-01 14:30")',
        });
        if (!response.timestamp) {
          console.log(chalk.yellow('Restore cancelled.'));
          return;
        }
        timestamp = this.parseTimestamp(response.timestamp);
      }

      // Determine what to restore
      let resources = {
        code: options.code || options.all,
        data: options.data || options.all,
        files: options.files || options.all,
        secrets: options.secrets || options.all
      };

      // If nothing specified, restore everything
      if (!resources.code && !resources.data && !resources.files && !resources.secrets) {
        const response = await prompts([
          {
            type: 'multiselect',
            name: 'selected',
            message: 'What would you like to restore?',
            choices: [
              { title: 'Code & Secrets (deployment unit)', value: 'code', selected: true },
              { title: 'Data', value: 'data', selected: true },
              { title: 'Files', value: 'files', selected: true }
            ]
          }
        ]);

        if (!response.selected || response.selected.length === 0) {
          console.log(chalk.yellow('No resources selected. Restore cancelled.'));
          return;
        }

        resources = {
          code: response.selected.includes('code'),
          data: response.selected.includes('data'),
          files: response.selected.includes('files'),
          secrets: response.selected.includes('code') // Secrets always with code
        };
      }

      // Determine target environment
      let targetEnvironment = options.to || options.environment || 'production';
      let createNewEnvironment = false;

      if (options.toNewEnv) {
        createNewEnvironment = true;
        targetEnvironment = options.toNewEnv;
      } else if (!options.to && !options.environment) {
        const response = await prompts({
          type: 'select',
          name: 'target',
          message: 'Where do you want to restore to?',
          choices: [
            { title: 'Current environment (production)', value: 'current' },
            { title: 'Another environment', value: 'other' },
            { title: 'New environment', value: 'new' }
          ]
        });

        if (response.target === 'other') {
          const envResponse = await prompts({
            type: 'text',
            name: 'env',
            message: 'Environment name:',
          });
          targetEnvironment = envResponse.env || 'production';
        } else if (response.target === 'new') {
          const envResponse = await prompts({
            type: 'text',
            name: 'env',
            message: 'New environment name (e.g., "debug-oct-1"):',
          });
          if (!envResponse.env) {
            console.log(chalk.yellow('Restore cancelled.'));
            return;
          }
          targetEnvironment = envResponse.env;
          createNewEnvironment = true;
        }
      }

      // Confirm restore
      if (!options.yes) {
        console.log(chalk.yellow('\n⚠️  This will restore:'));
        if (resources.code) console.log(chalk.gray('  • Code & Secrets'));
        if (resources.data) console.log(chalk.gray('  • Data'));
        if (resources.files) console.log(chalk.gray('  • Files'));
        console.log(chalk.yellow(`\nFrom: ${chalk.white(new Date(timestamp).toLocaleString())}`));
        console.log(chalk.yellow(`To: ${chalk.white(targetEnvironment)}${createNewEnvironment ? ' (new)' : ''}\n`));

        const confirm = await prompts({
          type: 'confirm',
          name: 'proceed',
          message: 'Proceed with restore?',
          initial: false
        });

        if (!confirm.proceed) {
          console.log(chalk.yellow('Restore cancelled.'));
          return;
        }
      }

      const spinner = ora('Restoring backup...').start();

      // Call restore API
      const response = await fetch(`${this.apiUrl}/api/backups/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          projectName,
          timestamp: new Date(timestamp).toISOString(),
          sourceEnvironment: options.from || 'production',
          targetEnvironment,
          createNewEnvironment,
          resources: {
            code: resources.code,
            data: resources.data,
            files: resources.files,
            secrets: resources.secrets
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        spinner.fail(`Restore failed: ${data.error || 'Unknown error'}`);
        return;
      }

      spinner.succeed('Restore completed successfully!');
      
      // Show results
      console.log(chalk.green('\n✅ Restore Results:'));
      if (data.details?.code) {
        console.log(chalk.gray(`  • Code: ${data.details.code.filesRestored || 0} files restored`));
      }
      if (data.details?.data) {
        console.log(chalk.gray(`  • Data: ${data.details.data.itemsRestored || 0} items restored`));
      }
      if (data.details?.files) {
        console.log(chalk.gray(`  • Files: ${data.details.files.filesRestored || 0} files restored`));
      }
      if (data.details?.secrets) {
        console.log(chalk.gray(`  • Secrets: ${data.details.secrets.secretsRestored || 0} secrets restored`));
      }

      // Show warnings
      if (data.details?.warnings && data.details.warnings.length > 0) {
        console.log(chalk.yellow('\n⚠️  Warnings:'));
        data.details.warnings.forEach(w => {
          console.log(chalk.yellow(`  • ${w.message}`));
        });
      }

      console.log(chalk.gray(`\nRestore ID: ${data.restoreId}`));
      
      if (createNewEnvironment) {
        console.log(chalk.blue(`\n🔗 New environment URL: https://${targetEnvironment}_${projectName}.shov.dev`));
      }

    } catch (error) {
      console.error(chalk.red('Restore failed:'), error.message);
    }
  }

  /**
   * Clone an environment
   * @param {string} sourceEnv - Source environment
   * @param {string} targetEnv - Target environment
   * @param {object} options - Clone options
   */
  async clone(sourceEnv, targetEnv, options = {}) {
    const { default: ora } = await import('ora');
    const { default: prompts } = await import('prompts');
    
    const { projectName, apiKey } = await this.getProjectConfig(options);

    try {
      if (!sourceEnv || !targetEnv) {
        console.error(chalk.red('Usage: shov clone <source-env> <target-env>'));
        console.log(chalk.gray('Example: shov clone production staging'));
        return;
      }

      // Confirm clone
      if (!options.yes) {
        console.log(chalk.yellow(`\n⚠️  This will copy the current state of ${chalk.white(sourceEnv)} to ${chalk.white(targetEnv)}`));
        console.log(chalk.yellow('Including: Code, Data, Files, and Secrets\n'));

        const confirm = await prompts({
          type: 'confirm',
          name: 'proceed',
          message: `Clone ${sourceEnv} → ${targetEnv}?`,
          initial: false
        });

        if (!confirm.proceed) {
          console.log(chalk.yellow('Clone cancelled.'));
          return;
        }
      }

      const spinner = ora(`Cloning ${sourceEnv} → ${targetEnv}...`).start();

      // Call restore API with "now" timestamp
      const response = await fetch(`${this.apiUrl}/api/backups/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          projectName,
          timestamp: new Date().toISOString(), // Current time
          sourceEnvironment: sourceEnv,
          targetEnvironment: targetEnv,
          createNewEnvironment: targetEnv !== sourceEnv && !options.overwrite,
          resources: {
            code: true,
            data: true,
            files: true,
            secrets: true
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        spinner.fail(`Clone failed: ${data.error || 'Unknown error'}`);
        return;
      }

      spinner.succeed(`✅ ${sourceEnv} cloned to ${targetEnv} successfully!`);
      
      // Show results
      console.log(chalk.gray('\nCloned:'));
      if (data.details?.code) {
        console.log(chalk.gray(`  • Code: ${data.details.code.filesRestored || 0} files`));
      }
      if (data.details?.data) {
        console.log(chalk.gray(`  • Data: ${data.details.data.itemsRestored || 0} items`));
      }
      if (data.details?.files) {
        console.log(chalk.gray(`  • Files: ${data.details.files.filesRestored || 0} files`));
      }
      if (data.details?.secrets) {
        console.log(chalk.gray(`  • Secrets: ${data.details.secrets.secretsRestored || 0} secrets`));
      }

      console.log(chalk.blue(`\n🔗 ${targetEnv} URL: https://${targetEnv}_${projectName}.shov.dev`));

    } catch (error) {
      console.error(chalk.red('Clone failed:'), error.message);
    }
  }

  /**
   * View backup history
   * @param {object} options - History options
   */
  async history(options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options);

    try {
      const environment = options.env || options.environment || 'production';
      const typeFilter = options.type || '';
      const limit = options.limit || 50;

      // Build query string
      const params = new URLSearchParams({
        env: environment,
        limit: limit.toString()
      });
      if (typeFilter) {
        params.append('type', typeFilter);
      }

      const response = await fetch(
        `${this.apiUrl}/api/backups/timeline?project=${projectName}&${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get backup history');
      }

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      // Display backup timeline
      console.log(chalk.bold(`\n📦 Backup History - ${environment}`));
      console.log(chalk.gray('─'.repeat(80)));

      if (!data.backups || data.backups.length === 0) {
        console.log(chalk.yellow('\nNo backups found'));
        console.log(chalk.gray('Backups are created automatically when you make changes'));
        return;
      }

      console.log(chalk.gray(`\nShowing ${data.backups.length} most recent backups:\n`));

      data.backups.forEach((backup, index) => {
        const date = new Date(backup.created_at);
        const timestamp = date.toLocaleString();
        const relativeTime = this.getRelativeTime(date);

        // Type icon
        const typeIcons = {
          code: '💻',
          data: '🗄️ ',
          files: '📁',
          secrets: '🔐'
        };
        const icon = typeIcons[backup.type] || '📦';

        // Color based on type
        const typeColors = {
          code: chalk.blue,
          data: chalk.green,
          files: chalk.purple,
          secrets: chalk.yellow
        };
        const colorFn = typeColors[backup.type] || chalk.white;

        console.log(`${icon} ${colorFn(backup.type.toUpperCase().padEnd(8))} ${chalk.gray(timestamp)} ${chalk.dim(`(${relativeTime})`)}`);

        // Show details
        if (backup.file_path) {
          console.log(chalk.gray(`   └─ ${backup.file_path}${backup.change_type ? ` (${backup.change_type})` : ''}`));
        } else if (backup.collections_count) {
          console.log(chalk.gray(`   └─ ${backup.collections_count} collections, ${backup.items_count} items`));
        } else if (backup.secrets_count) {
          console.log(chalk.gray(`   └─ ${backup.secrets_count} secrets`));
        }

        console.log('');
      });

      console.log(chalk.gray('─'.repeat(80)));
      console.log(chalk.blue('\n💡 Restore from any point:'));
      console.log(chalk.gray(`   shov restore --from "${data.backups[0].created_at}"`));
      console.log(chalk.gray(`   shov restore --from "2 hours ago"`));

    } catch (error) {
      console.error(chalk.red('Failed to get backup history:'), error.message);
    }
  }

  /**
   * Parse natural language timestamp
   */
  parseTimestamp(input) {
    // ISO timestamp
    if (input.match(/^\d{4}-\d{2}-\d{2}/)) {
      return new Date(input).getTime();
    }

    // Relative time
    const relativeMatch = input.match(/^(\d+)\s*(second|minute|hour|day|week|month)s?\s*ago$/i);
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1]);
      const unit = relativeMatch[2].toLowerCase();
      const now = Date.now();
      
      const multipliers = {
        second: 1000,
        minute: 60 * 1000,
        hour: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000
      };

      return now - (amount * multipliers[unit]);
    }

    // Try parsing as date
    const parsed = new Date(input);
    if (!isNaN(parsed.getTime())) {
      return parsed.getTime();
    }

    throw new Error(`Invalid timestamp: ${input}`);
  }

  /**
   * Get relative time string
   */
  getRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 30) return `${diffDay}d ago`;
    
    return date.toLocaleDateString();
  }

  // ============================================================================
  // EVENTS MANAGEMENT
  // ============================================================================

  // Events Commands
  async eventsTrack(event, propertiesString, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    try {
      let properties = {}
      if (propertiesString) {
        try {
          properties = JSON.parse(propertiesString)
        } catch (e) {
          throw new Error('Properties must be valid JSON')
        }
      }
      
      const payload = {
        event,
        properties,
        environment: options.env || 'production'
      }
      
      const result = await this.apiCall(`/events/${projectName}`, payload, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      console.log(chalk.green(`✅ Event tracked successfully`))
      console.log(`${chalk.gray('Event:')} ${chalk.cyan(event)}`)
      console.log(`${chalk.gray('Event ID:')} ${result.eventId}`)
      if (Object.keys(properties).length > 0) {
        console.log(`${chalk.gray('Properties:')} ${Object.keys(properties).length} properties`)
      }
    } catch (error) {
      throw new Error(`Failed to track event: ${error.message}`)
    }
  }

  async eventsQuery(options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    try {
      let filters = {}
      if (options.filters) {
        try {
          filters = JSON.parse(options.filters)
        } catch (e) {
          throw new Error('Filters must be valid JSON')
        }
      }
      
      if (options.event) {
        filters.event = options.event
      }
      
      const payload = {
        timeRange: options.timeRange || '24h',
        limit: parseInt(options.limit) || 100,
        filters,
        environment: options.env || null
      }
      
      if (options.event) {
        payload.eventName = options.event
      }
      
      const result = await this.apiCall(`/events/${projectName}/query`, payload, apiKey, options)
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      console.log(chalk.bold(`\n📊 Events Query Results`))
      console.log(chalk.gray('─'.repeat(60)))
      
      if (!result.events || result.events.length === 0) {
        console.log(chalk.yellow('No events found'))
        return
      }
      
      console.log(`${chalk.gray('Total events:')} ${result.events.length}`)
      if (result.sources) {
        console.log(`${chalk.gray('Sources:')} KV: ${result.sources.kv}, Analytics: ${result.sources.analytics}`)
      }
      console.log()
      
      result.events.forEach(event => {
        const date = new Date(event.timestamp).toLocaleString()
        console.log(`${chalk.cyan(event.eventName)} - ${chalk.gray(date)}`)
        console.log(`  ${chalk.gray('ID:')} ${event.eventId}`)
        if (event.properties && Object.keys(event.properties).length > 0) {
          console.log(`  ${chalk.gray('Properties:')} ${JSON.stringify(event.properties, null, 2).split('\n').join('\n  ')}`)
        }
        console.log()
      })
    } catch (error) {
      throw new Error(`Failed to query events: ${error.message}`)
    }
  }

  async eventsTail(options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)
    
    try {
      const url = new URL(`/api/events-tail/${projectName}`, this.apiUrl)
      if (options.event) {
        url.searchParams.set('event', options.event)
      }
      if (options.limit) {
        url.searchParams.set('limit', options.limit)
      }
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Events tail failed')
      }
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      
      console.log(chalk.bold(`\n🔴 Real-time Events (Past 60 seconds)`))
      console.log(chalk.gray('─'.repeat(60)))
      
      if (!result.events || result.events.length === 0) {
        console.log(chalk.yellow('No recent events'))
        return
      }
      
      console.log(`${chalk.gray('Total events:')} ${result.count}`)
      console.log()
      
      result.events.forEach(event => {
        const date = new Date(event.timestamp).toLocaleString()
        console.log(`${chalk.cyan(event.eventName)} - ${chalk.gray(date)}`)
        console.log(`  ${chalk.gray('ID:')} ${event.eventId}`)
        if (event.properties && Object.keys(event.properties).length > 0) {
          console.log(`  ${chalk.gray('Properties:')} ${JSON.stringify(event.properties, null, 2).split('\n').join('\n  ')}`)
        }
        console.log()
      })
    } catch (error) {
      throw new Error(`Failed to tail events: ${error.message}`)
    }
  }
}

module.exports = { ShovCLI }
