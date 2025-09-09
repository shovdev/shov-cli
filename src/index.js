const fs = require('fs')
const path = require('path')
const chalk = require('chalk')
const { ShovConfig } = require('./config')

// Dynamic import for node-fetch
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args))

class ShovCLI {
  constructor(options = {}) {
    const isRunningLocally =
      options.local || process.env.NODE_ENV === 'development'
    const isStaging = process.env.SHOV_ENV === 'staging'
    this.apiUrl = isRunningLocally 
      ? 'http://127.0.0.1:8787' 
      : isStaging 
        ? 'https://staging.shov.com' 
        : 'https://shov.com'
    this.config = new ShovConfig()
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

  async createProject(projectName, options) {
    const { default: ora } = await import('ora')
    console.log('Creating your project...')

    if (!projectName) {
      console.log('No project name provided, server will generate a random one...')
    }

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
          email: options.email,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        spinner.fail(
          `Project creation failed: ${data.error || response.statusText}`
        )
        return
      }

      const data = await response.json()

      if (data.success) {
        spinner.succeed(`Project '${data.project.name}' created!`)
        console.log(`API Key: ${data.project.apiKey}`)
        await this.config.saveLocalConfig({
          project: data.project.name,
          apiKey: data.project.apiKey,
        })
        console.log('Project details saved to local .shov file.')
        this.addToEnv(data.project.apiKey)
      } else {
        spinner.fail(`Project creation failed: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      spinner.fail('Project creation failed.')
      console.error(`Error: ${error.message}`)
    }
  }

  addToEnv(apiKey) {
    const envVar = `\nSHOV_API_KEY=${apiKey}\n`
    const envLocalPath = path.resolve(process.cwd(), '.env.local')
    const envPath = path.resolve(process.cwd(), '.env')

    try {
      if (fs.existsSync(envLocalPath)) {
        const content = fs.readFileSync(envLocalPath, 'utf-8')
        if (!content.includes('SHOV_API_KEY')) {
          fs.appendFileSync(envLocalPath, envVar)
          console.log('We have added the API key to your .env.local file.')
        }
      } else if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8')
        if (!content.includes('SHOV_API_KEY')) {
          fs.appendFileSync(envPath, envVar)
          console.log('We have added the API key to your .env file.')
        }
      } else {
        fs.writeFileSync(envPath, `SHOV_API_KEY=${apiKey}\n`)
        console.log('We have created a .env file and added your API key.')
      }
    } catch (error) {
      console.warn(`\nCould not add API key to .env file: ${error.message}`)
      console.warn(`Please add the following to your environment file:\n`)
      console.warn(chalk.bold(`SHOV_API_KEY=${apiKey}`))
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
        spinner.fail(`Failed to initiate claim: ${initiateData.error || 'Unknown error'}`);
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
        spinner.fail(`Claim failed: ${verifyData.error || 'Unknown error'}`);
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
        console.log(`Value for "${key}": ${JSON.stringify(data.value, null, 2)}`)
      } else {
        console.error(`Error: Failed to get value: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error(`Error: Failed to get value: ${error.message}`);
      if (error.response && error.response.payload) {
        console.error(chalk.gray(`Request Payload: ${JSON.stringify(error.response.payload, null, 2)}`));
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
      const data = await this.apiCall(`/add/${projectName}`, body, apiKey, options);

      if (data.success) {
        console.log(chalk.green('✅ Item added to collection'))
        console.log(`  Collection: ${chalk.cyan(collection)}`)
        console.log(`  Item ID: ${chalk.yellow(data.id)}`)
        console.log(`  Value: ${chalk.gray(JSON.stringify(parsedValue))}`)
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

      const response = await fetch(`${this.apiUrl}/api/addMany/${projectConfig.projectName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${projectConfig.apiKey}`
        },
        body: JSON.stringify({ name: collection, items: items })
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

  // List items in collection
  async listCollection(collection, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)

    const requestBody = {
      name: collection,
      sort: options.sort || 'desc'
    }

    if (options.limit) {
      requestBody.limit = parseInt(options.limit)
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/list/${projectName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to list collection')
      }

      console.log(chalk.green(`✅ Collection "${collection}" (${data.items.length} items):`))
      
      if (data.items.length === 0) {
        console.log(chalk.gray('  No items found'))
        return
      }

      data.items.forEach((item, index) => {
        console.log(`  ${index + 1}. ${chalk.yellow(item.id)}`)
        console.log(`     ${chalk.gray(JSON.stringify(item.value))}`)
        console.log(`     ${chalk.dim(item.createdAt)}`)
      })

    } catch (error) {
      throw new Error(`Failed to list collection: ${error.message}`)
    }
  }

  // Find items in collection with filters
  async findInCollection(collection, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options)

    let filter = {}
    if (options.filter) {
      try {
        filter = JSON.parse(options.filter)
      } catch {
        throw new Error('Filter must be valid JSON')
      }
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/find/${projectName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          name: collection,
          filter: filter
        })
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

  async removeItem(itemId, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora('Removing item...').start();
    try {
      const projectConfig = await this.getProjectConfig(options);
      const response = await fetch(`${this.apiUrl}/api/remove/${projectConfig.projectName}/${itemId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${projectConfig.apiKey}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        spinner.succeed(`Successfully removed item "${itemId}".`);
      } else {
        spinner.fail(`Failed to remove item: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      spinner.fail(`Failed to remove item: ${error.response ? error.response.data.error : error.message}`);
    }
  }

  async removeAll(collectionName, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora(`Removing all items from collection "${collectionName}"...`).start();
    try {
      const projectConfig = await this.getProjectConfig(options);
      const response = await fetch(`${this.apiUrl}/api/removeAll/${projectConfig.projectName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${projectConfig.apiKey}`
        },
        body: JSON.stringify({ name: collectionName })
      });
      const data = await response.json();
      if (response.ok) {
        spinner.succeed(`Successfully removed ${data.count} items from collection "${collectionName}".`);
      } else {
        spinner.fail(`Failed to remove all items: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      spinner.fail(`Failed to remove all items: ${error.response ? error.response.data.error : error.message}`);
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

  async updateItem(idOrName, value, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora(`Updating item "${idOrName}"...`).start();
    try {
      const { projectName, apiKey } = await this.getProjectConfig(options);
      let parsedValue;
      try {
        parsedValue = JSON.parse(value);
      } catch (e) {
        parsedValue = value;
      }
      const body = { value: parsedValue };

      // Use POST for update, consistent with other data operations
      const data = await this.apiCall(`/update/${projectName}/${idOrName}`, body, apiKey, options);

      if (data.success) {
        spinner.succeed(`Item "${idOrName}" updated successfully.`);
      } else {
        spinner.fail(`Failed to update item: ${data.error || 'An unexpected error occurred.'}`);
      }
    } catch (error) {
      spinner.fail(`Failed to update item: ${error.message}`);
    }
  }

  async issueOtp(identifier, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora(`Issuing OTP to ${identifier}...`).start();
    try {
      const projectConfig = await this.getProjectConfig(options);
      const digits = options.digits ? parseInt(options.digits, 10) : 6;
      
      const response = await fetch(`${this.apiUrl}/api/otp_issue/${projectConfig.projectName}`, {
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
        spinner.fail(`Failed to issue OTP: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      spinner.fail(`Failed to issue OTP: ${error.message}`);
    }
  }

  async verifyOtp(identifier, pin, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora(`Verifying OTP for ${identifier}...`).start();
    try {
      const projectConfig = await this.getProjectConfig(options);

      const response = await fetch(`${this.apiUrl}/api/otp_verify/${projectConfig.projectName}`, {
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

        const fileStream = fs.createReadStream(absolutePath);
        const stats = fs.statSync(absolutePath);
        const { fileTypeFromStream } = await import('file-type');
        const type = await fileTypeFromStream(fileStream);

        const response = await fetch(`${this.apiUrl}/api/upload/${projectName}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': type ? type.mime : 'application/octet-stream',
                'Content-Length': stats.size,
                'x-shov-filename': path.basename(absolutePath)
            },
            body: fileStream,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to upload file');
        }

        spinner.succeed('File uploaded successfully!');
        console.log(`  File ID: ${chalk.yellow(data.fileId)}`);
        console.log(`  URL: ${chalk.cyan(data.url)}`);

    } catch (error) {
        spinner.fail(`File upload failed: ${error.message}`);
    }
  }

  // Get a pre-signed upload URL
  async getUploadUrl(fileName, options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora('Generating pre-signed URL...').start();
    try {
        const { projectName, apiKey } = await this.getProjectConfig(options);
        const { fileTypeFromFile } = await import('file-type');
        const type = await fileTypeFromFile(fileName);

        const response = await fetch(`${this.apiUrl}/api/upload-url/${projectName}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                fileName,
                mimeType: options.mimeType || (type ? type.mime : 'application/octet-stream')
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to get upload URL');
        }

        spinner.succeed('Pre-signed URL generated successfully!');
        console.log(`  File ID: ${chalk.yellow(data.fileId)}`);
        console.log(`  Upload URL: ${chalk.cyan(data.url)}`);
        console.log(chalk.yellow('This URL is valid for 15 minutes.'));

    } catch (error) {
        spinner.fail(`Failed to get upload URL: ${error.message}`);
    }
  }

  async listFiles(options = {}) {
    const { default: ora } = await import('ora');
    const spinner = ora('Listing files...').start();
    try {
        const { projectName, apiKey } = await this.getProjectConfig(options);
        const data = await this.apiCall(`/files_list/${projectName}`, {}, apiKey, options);
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
        const data = await this.apiCall(`/files_get/${projectName}/${fileId}`, {}, apiKey, options);
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
        const data = await this.apiCall(`/files_delete/${projectName}/${fileId}`, {}, apiKey, options, 'DELETE');
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
  async search(query, options = {}) {
    const { projectName, apiKey } = await this.getProjectConfig(options);

    try {
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

      let minScore;
      if (options.minScore) {
        const score = parseFloat(options.minScore);
        if (!isNaN(score)) {
          if (score > 1 && score <= 100) {
            minScore = score / 100;
            console.log(chalk.gray(`(Note: --min-score ${score} was auto-corrected to ${minScore})`));
          } else {
            minScore = score;
          }
        }
      }

      const payload = {
        query,
        collection: options.collection || null,
        orgWide: options.orgWide || false,
        minScore: minScore,
      };

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
        throw new Error(data.error || 'Search failed');
      }

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

    } catch (error)
      {
      throw new Error(`Search failed: ${error.message}`);
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
}

module.exports = { ShovCLI }
