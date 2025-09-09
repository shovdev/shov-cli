#!/usr/bin/env node

const { program } = require('commander')
const chalk = require('chalk')
const { ShovCLI } = require('../dist/index.js')

program
  .name('shov')
  .description('Shov CLI - Instant edge key/value store')
  .version('1.0.0')

program
  .command('new [projectName]')
  .description('Create a new Shov project')
  .option('-e, --email <email>', 'Your email address (optional)')
  .option('--local', 'Use local development server')
  .action(async (projectName, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.createProject(projectName, options)
    } catch (error) {
      console.error(chalk.red('Error:'), error.message)
      process.exit(1)
    }
  })

program
  .command('claim <email> [projectName]')
  .description('Claim a project with your email address. Project name is optional if run from a project directory.')
  .option('--local', 'Use local development server')
  .action(async (email, projectName, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.claimProject(projectName, email, options)
    } catch (error) {
      console.error(chalk.red('Error:'), error.message)
      process.exit(1)
    }
  })

program
  .command('get <key>')
  .description('Get a value from your Shov project')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--local', 'Use local development server')
  .action(async (key, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.get(key, options)
    } catch (error) {
      console.error(chalk.red('Error:'), error.message)
      process.exit(1)
    }
  })

program
  .command('set <key> <value>')
  .description('Set a key-value pair in your Shov project')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--local', 'Use local development server')
  .action(async (key, value, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.set(key, value, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message)
      process.exit(1)
    }
  })

program
  .command('add <collection> <value>')
  .description('Add an item to a collection in your Shov project')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--local', 'Use local development server')
  .action(async (collection, value, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.addToCollection(collection, value, options)
    } catch (error) {
      console.error(chalk.red('Error:'), error.message)
      process.exit(1)
    }
  })

program
  .command('add-many <collection> <itemsJson>')
  .description('Add multiple items to a collection from a JSON string')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--local', 'Use local development server')
  .action(async (collection, itemsJson, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.addManyToCollection(collection, itemsJson, options)
    } catch (error) {
      console.error(chalk.red('Error:'), error.message)
      process.exit(1)
    }
  })

program
  .command('list <collection>')
  .description('List items in a collection')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('-l, --limit <limit>', 'Limit number of results')
  .option('-s, --sort <sort>', 'Sort order (asc|desc)', 'desc')
  .option('--local', 'Use local development server')
  .action(async (collection, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.listCollection(collection, options)
    } catch (error) {
      console.error(chalk.red('Error:'), error.message)
      process.exit(1)
    }
  })

program
  .command('find <collection>')
  .description('Find items in a collection with filters')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('-f, --filter <filter>', 'JSON filter object')
  .option('--local', 'Use local development server')
  .action(async (collection, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.findInCollection(collection, options)
    } catch (error) {
      console.error(chalk.red('Error:'), error.message)
      process.exit(1)
    }
  })

program
    .command('remove <item_id>')
    .description('Remove an item from a collection by its ID')
    .option('-p, --project <project>', 'Project name (or use .shov config)')
    .option('-k, --key <apiKey>', 'API key (or use .shov config)')
    .option('--local', 'Use local development server')
    .action(async (item_id, options) => {
        try {
            const cli = new ShovCLI(options);
            await cli.removeItem(item_id, options)
        } catch (error) {
            console.error(chalk.red('Error:'), error.message)
            process.exit(1)
        }
    });

program
    .command('removeAll <collection>')
    .description('Remove all items in a collection')
    .option('-p, --project <project>', 'Project name (or use .shov config)')
    .option('-k, --key <apiKey>', 'API key (or use .shov config)')
    .option('--local', 'Use local development server')
    .action(async (collection, options) => {
        try {
            const cli = new ShovCLI(options);
            await cli.removeAll(collection, options)
        } catch (error) {
            console.error(chalk.red('Error:'), error.message)
            process.exit(1)
        }
    });

program
  .command('forget <id_or_name>')
  .description('Forget a key/value pair by its key or ID')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--local', 'Use local development server')
  .action(async (id_or_name, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.forgetItem(id_or_name, options)
    } catch (error) {
      console.error(chalk.red('Error:'), error.message)
      process.exit(1)
    }
  })

program
  .command('update <id_or_name> <value>')
  .description('Update an item by its ID or name (for key-value pairs)')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--local', 'Use local development server')
  .action(async (id_or_name, value, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.updateItem(id_or_name, value, options)
    } catch (error) {
      console.error(chalk.red('Error:'), error.message)
      process.exit(1)
    }
  })

program
    .command('search <query>')
    .description('Perform a vector search on a collection, project, or organization')
    .option('-p, --project <project>', 'Project name (or use .shov config)')
    .option('-k, --key <apiKey>', 'API key (or use .shov config)')
    .option('-c, --collection <collection>', 'Search within a specific collection')
    .option('--project-wide', 'Search across all collections in the project (default)')
    .option('--org-wide', 'Search across all projects in the organization')
    .option('--min-score <score>', 'The minimum similarity score for results (0.0 to 1.0)')
    .option('--local', 'Use local development server')
    .action(async (query, options) => {
        try {
            const cli = new ShovCLI(options);
            await cli.search(query, options);
        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

program
    .command('upload <filePath>')
    .description('Upload a file to your project')
    .option('-p, --project <project>', 'Project name (or use .shov config)')
    .option('-k, --key <apiKey>', 'API key (or use .shov config)')
    .option('--local', 'Use local development server')
    .action(async (filePath, options) => {
        try {
            const cli = new ShovCLI(options);
            await cli.uploadFile(filePath, options);
        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

program
    .command('upload-url <fileName>')
    .description('Get a pre-signed URL for client-side file uploads')
    .option('-p, --project <project>', 'Project name (or use .shov config)')
    .option('-k, --key <apiKey>', 'API key (or use .shov config)')
    .option('--mime-type <mimeType>', 'The MIME type of the file')
    .option('--local', 'Use local development server')
    .action(async (fileName, options) => {
        try {
            const cli = new ShovCLI(options);
            await cli.getUploadUrl(fileName, options);
        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

const files = program.command('files').description('Manage project files');

files
    .command('list')
    .description('List all files in the project')
    .option('-p, --project <project>', 'Project name (or use .shov config)')
    .option('-k, --key <apiKey>', 'API key (or use .shov config)')
    .option('--local', 'Use local development server')
    .action(async (options) => {
        try {
            const cli = new ShovCLI(options);
            await cli.listFiles(options);
        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

files
    .command('get <fileId>')
    .description('Get metadata for a specific file')
    .option('-p, --project <project>', 'Project name (or use .shov config)')
    .option('-k, --key <apiKey>', 'API key (or use .shov config)')
    .option('--local', 'Use local development server')
    .action(async (fileId, options) => {
        try {
            const cli = new ShovCLI(options);
            await cli.getFile(fileId, options);
        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

files
    .command('delete <fileId>')
    .description('Delete a file from the project')
    .option('-p, --project <project>', 'Project name (or use .shov config)')
    .option('-k, --key <apiKey>', 'API key (or use .shov config)')
    .option('--local', 'Use local development server')
    .action(async (fileId, options) => {
        try {
            const cli = new ShovCLI(options);
            await cli.deleteFile(fileId, options);
        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

program
    .command('otp:issue <identifier>')
    .description('Issue an OTP to an identifier (e.g., email)')
    .option('-p, --project <project>', 'Project name (or use .shov config)')
    .option('-k, --key <apiKey>', 'API key (or use .shov config)')
    .option('-d, --digits <digits>', 'Number of digits for the OTP (4-8)', '6')
    .option('--local', 'Use local development server')
    .action(async (identifier, options) => {
        try {
            const cli = new ShovCLI(options);
            await cli.issueOtp(identifier, options)
        } catch (error) {
            console.error(chalk.red('Error:'), error.message)
            process.exit(1)
        }
    })

program
    .command('otp:verify <identifier> <pin>')
    .description('Verify an OTP for an identifier')
    .option('-p, --project <project>', 'Project name (or use .shov config)')
    .option('-k, --key <apiKey>', 'API key (or use .shov config)')
    .option('--local', 'Use local development server')
    .action(async (identifier, pin, options) => {
        try {
            const cli = new ShovCLI(options);
            await cli.verifyOtp(identifier, pin, options)
        } catch (error) {
            console.error(chalk.red('Error:'), error.message)
            process.exit(1)
        }
    })

program
  .command('config')
  .description('Show current project configuration')
  .action(async () => {
    try {
      await cli.showConfig()
    } catch (error) {
      console.error(chalk.red('Error:'), error.message)
      process.exit(1)
    }
  })

program
  .command('projects')
  .description('List all available projects')
  .action(async () => {
    try {
      await cli.listProjects()
    } catch (error) {
      console.error(chalk.red('Error:'), error.message)
      process.exit(1)
    }
  })

program
  .command('switch <project>')
  .description('Switch to a different project')
  .action(async (project) => {
    try {
      await cli.switchProject(project)
    } catch (error) {
      console.error(chalk.red('Error:'), error.message)
      process.exit(1)
    }
  })

program
  .command('whoami')
  .description('Show current user and project information')
  .action(async () => {
    try {
      await cli.whoami()
    } catch (error) {
      console.error(chalk.red('Error:'), error.message)
      process.exit(1)
    }
  })

program
  .command('init')
  .description('Initialize Shov in an existing project')
  .option('-p, --project <project>', 'Project name')
  .option('-k, --key <apiKey>', 'API key')
  .action(async (options) => {
    try {
      await cli.initProject(options)
    } catch (error) {
      console.error(chalk.red('Error:'), error.message)
      process.exit(1)
    }
  })

// Handle unknown commands
program.on('command:*', () => {
  console.error(chalk.red('Invalid command:'), program.args.join(' '))
  console.log(chalk.yellow('See --help for a list of available commands.'))
  process.exit(1)
})

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp()
}

program.parse()
