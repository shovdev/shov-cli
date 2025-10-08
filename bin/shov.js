#!/usr/bin/env node

const { program } = require('commander')
const chalk = require('chalk')
const { ShovCLI } = require('../dist/index.js')
const { version } = require('../package.json')

program
  .name('shov')
  .description('Shov CLI - Instant edge key/value store with time-travel backups')
  .version(version)

program
  .command('new [projectName]')
  .description('Create a new Shov project')
  .option('-e, --email <email>', 'Your email address (optional)')
  .option('--starter <type>', 'Deploy starter template: b2c (consumer app) or b2b (SaaS app)')
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
  .description('Claim a project with your email address. Project name and API key are auto-detected from .shov file if available.')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
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
  .option('--json', 'Output JSON for scripting')
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
  .option('--no-vector', 'Exclude from vector search/embedding processing')
  .option('--ttl <seconds>', 'Time to live in seconds (for expiration)')
  .option('--json', 'Output JSON for scripting')
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
  .option('--no-vector', 'Exclude from vector search/embedding processing')
  .option('--ttl <seconds>', 'Time to live in seconds (for expiration)')
  .option('--json', 'Output JSON for scripting')
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
  .option('--no-vector', 'Exclude from vector search/embedding processing')
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
  .command('where <collection>')
  .description('Find items in a collection based on a filter.')
  .option('-f, --filter <json>', 'JSON string to filter by', '{}')
  .option('-l, --limit <number>', 'Limit the number of results', '50')
  .option('--offset <number>', 'Skip this many results (for pagination)')
  .option('-p, --project <name>', 'Specify the project name')
  .option('-k, --key <key>', 'Specify the API key')
  .option('--json', 'Output JSON for scripting')
  .action(async (collection, options) => {
    try {
      await new ShovCLI(options).whereInCollection(collection, options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('count <collection>')
  .description('Count the number of items in a collection with optional filtering.')
  .option('-f, --filter <json>', 'JSON string to filter by')
  .option('-p, --project <name>', 'Specify the project name')
  .option('-k, --key <key>', 'Specify the API key')
  .option('--json', 'Output JSON for scripting')
  .action(async (collection, options) => {
    try {
      await new ShovCLI(options).countInCollection(collection, options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('update <collection> <id> <value>')
  .description('Update an item in a collection by its ID.')
  .option('-p, --project <name>', 'Specify the project name')
  .option('-k, --key <key>', 'Specify the API key')
  .option('--no-vector', 'Exclude from vector search/embedding processing')
  .action(async (collection, id, value, options) => {
    try {
      await new ShovCLI(options).updateItem(collection, id, value, options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('remove <collection> <id>')
  .description('Remove an item from a collection by its ID.')
  .option('-p, --project <name>', 'Specify the project name')
  .option('-k, --key <key>', 'Specify the API key')
  .action(async (collection, id, options) => {
    try {
      await new ShovCLI(options).removeItem(collection, id, options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('clear <collection>')
  .description('Clear all items from a collection.')
  .option('-p, --project <name>', 'Specify the project name')
  .option('-k, --key <key>', 'Specify the API key')
  .action(async (collection, options) => {
    try {
      await new ShovCLI(options).clearCollection(collection, options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('batch <operations>')
  .description('Execute multiple operations atomically in a single transaction')
  .option('-p, --project <name>', 'Specify the project name')
  .option('-k, --key <key>', 'Specify the API key')
  .option('--json', 'Output JSON for scripting')
  .action(async (operations, options) => {
    try {
      await new ShovCLI(options).batch(operations, options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('forget <key>')
  .description('Forget a key-value pair.')
  .option('-p, --project <name>', 'Specify the project name')
  .option('-k, --key <key>', 'Specify the API key')
  .action(async (key, options) => {
    try {
      await new ShovCLI(options).forgetItem(key, options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('forget-file <filename>')
  .description('Delete a file by filename.')
  .option('-p, --project <name>', 'Specify the project name')
  .option('-k, --key <key>', 'Specify the API key')
  .action(async (filename, options) => {
    try {
      await new ShovCLI(options).forgetFile(filename, options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('search <query>')
    .description('Perform a vector search on a collection, project, or organization')
    .option('-p, --project <project>', 'Project name (or use .shov config)')
    .option('-k, --key <apiKey>', 'API key (or use .shov config)')
    .option('-c, --collection <collection>', 'Search within a specific collection')
    .option('--project-wide', 'Search across all collections in the project (default)')
    .option('--org-wide', 'Search across all projects in the organization')
    .option('--min-score <score>', 'The minimum similarity score for results (0.0 to 1.0)')
    .option('--minScore <score>', 'Alias for --min-score (backward compatibility)')
    .option('--top-k <number>', 'Maximum number of results to return (default: 10)')
    .option('--topK <number>', 'Alias for --top-k (backward compatibility)')
    .option('--filters <json>', 'JSON object to filter results by specific fields (e.g. \'{"user_id": "123"}\')')
    .option('--limit <number>', 'Alias for --top-k (pagination)')
    .option('--offset <number>', 'Skip this many results (for pagination)')
    .option('--json', 'Output JSON for scripting')
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
    .option('--json', 'Output JSON for scripting')
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
    .command('token <type> <data>')
    .description('Create a temporary token for various client-side operations')
    .option('-p, --project <project>', 'Project name (or use .shov config)')
    .option('-k, --key <apiKey>', 'API key (or use .shov config)')
    .option('--expires <seconds>', 'Token expiration time in seconds (default: 3600)')
    .option('--json', 'Output JSON for scripting')
    .action(async (type, data, options) => {
        try {
            const cli = new ShovCLI(options);
            await cli.token(type, data, options);
        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

program
    .command('broadcast <subscription> <message>')
    .description('Broadcast a message to subscribers of a specific subscription')
    .option('-p, --project <project>', 'Project name (or use .shov config)')
    .option('-k, --key <apiKey>', 'API key (or use .shov config)')
    .option('--json', 'Output JSON for scripting')
    .action(async (subscription, message, options) => {
        try {
            const cli = new ShovCLI(options);
            await cli.broadcast(subscription, message, options);
        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

program
    .command('subscribe <subscriptions>')
    .description('Subscribe to real-time updates from collections, keys, or channels')
    .option('-p, --project <project>', 'Project name (or use .shov config)')
    .option('-k, --key <apiKey>', 'API key (or use .shov config)')
    .option('--expires <seconds>', 'Token expiration time in seconds (default: 3600)')
    .option('--verbose', 'Show heartbeat messages')
    .action(async (subscriptions, options) => {
        try {
            const cli = new ShovCLI(options);
            await cli.subscribe(subscriptions, options);
        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

program
    .command('send-otp <identifier>')
    .description('Send a one-time password (OTP) to an email address.')
    .option('-p, --project <name>', 'Specify the project name')
    .option('-k, --key <key>', 'Specify the API key')
    .option('--digits <number>', 'Specify the number of digits for the OTP (4 or 6)', '4')
    .action(async (identifier, options) => {
    try {
      await new ShovCLI(options).sendOtp(identifier, options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
    .command('verify-otp <identifier> <pin>')
    .description('Verify an OTP for an identifier')
    .option('-p, --project <project>', 'Project name (or use .shov config)')
    .option('-k, --key <apiKey>', 'API key (or use .shov config)')
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
  .command('contents')
  .description('List the contents of the current memory (keys, collections, files).')
  .option('-p, --project <name>', 'Specify the project name')
  .option('-k, --key <key>', 'Specify the API key')
  .action(async (options) => {
    try {
      await new ShovCLI(options).getContents(options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  })

program
  .command('config')
  .description('Show current project configuration')
  .action(async () => {
    try {
      const cli = new ShovCLI();
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
      const cli = new ShovCLI();
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
      const cli = new ShovCLI();
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
      const cli = new ShovCLI();
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
      const cli = new ShovCLI();
      await cli.initProject(options)
    } catch (error) {
      console.error(chalk.red('Error:'), error.message)
      process.exit(1)
    }
  })

// Code Functions Commands
const code = program.command('code').description('Manage code functions');

code
  .command('list')
  .description('List all deployed code functions')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--json', 'Output JSON for scripting')
  .action(async (options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.codeList(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

code
  .command('write <functionName> <filePath>')
  .description('Write (create or overwrite) a code function')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--description <description>', 'Function description')
  .option('--timeout <ms>', 'Function timeout in milliseconds')
  .option('--json', 'Output JSON for scripting')
  .action(async (functionName, filePath, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.codeWrite(functionName, filePath, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

code
  .command('read <functionName>')
  .description('Read the source code of a deployed code function')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--json', 'Output JSON for scripting')
  .action(async (functionName, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.codeRead(functionName, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

code
  .command('delete <functionName>')
  .description('Delete a code function')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--json', 'Output JSON for scripting')
  .action(async (functionName, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.codeDelete(functionName, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

code
  .command('rollback <functionName> [version]')
  .description('Rollback a code function to a previous version')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--json', 'Output JSON for scripting')
  .action(async (functionName, version, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.codeRollback(functionName, version, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

code
  .command('logs [functionName]')
  .description('View code function logs')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--follow', 'Follow logs in real-time')
  .option('--json', 'Output JSON for scripting')
  .action(async (functionName, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.codeLogs(functionName, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

code
  .command('pull')
  .description('Download all code files from your project')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('-o, --output <directory>', 'Output directory (default: current directory)')
  .option('--json', 'Output JSON for scripting')
  .action(async (options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.codePull(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Secrets Management Commands
const secrets = program.command('secrets').description('Manage edge function secrets');

secrets
  .command('list')
  .description('List all secret names (values are never shown)')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--json', 'Output JSON for scripting')
  .action(async (options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.secretsList(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

secrets
  .command('set <name> <value>')
  .description('Set a secret for edge functions')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--functions <functions>', 'Comma-separated list of functions (default: all functions)')
  .option('--json', 'Output JSON for scripting')
  .action(async (name, value, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.secretsSet(name, value, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

secrets
  .command('set-many <secretsJson>')
  .description('Set multiple secrets at once from JSON array')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--functions <functions>', 'Comma-separated list of functions (default: all functions)')
  .option('--json', 'Output JSON for scripting')
  .action(async (secretsJson, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.secretsSetMany(secretsJson, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

secrets
  .command('delete <name>')
  .description('Delete a secret')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--functions <functions>', 'Comma-separated list of functions (default: all functions)')
  .option('--json', 'Output JSON for scripting')
  .action(async (name, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.secretsDelete(name, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Backup & Restore Commands
program
  .command('restore')
  .description('Restore your project from a backup')
  .option('--from <timestamp>', 'Timestamp to restore from (e.g., "2 hours ago", "2024-10-01 14:30")')
  .option('--to <environment>', 'Target environment to restore to')
  .option('--to-new-env <name>', 'Create a new environment with this name')
  .option('--code', 'Restore code files')
  .option('--data', 'Restore data')
  .option('--files', 'Restore uploaded files')
  .option('--secrets', 'Restore secrets')
  .option('--all', 'Restore everything (code, data, files, secrets)')
  .option('--env <environment>', 'Source environment (default: production)')
  .option('--environment <environment>', 'Alias for --env')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .action(async (options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.restore(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('clone <sourceEnv> <targetEnv>')
  .description('Clone an entire environment (code, data, files, secrets)')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--overwrite', 'Overwrite target environment if it exists')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .action(async (sourceEnv, targetEnv, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.clone(sourceEnv, targetEnv, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('history')
  .description('View backup history for your project')
  .option('--env <environment>', 'Filter by environment (default: production)')
  .option('--environment <environment>', 'Alias for --env')
  .option('--type <type>', 'Filter by backup type (code, data, files, secrets)')
  .option('--limit <number>', 'Number of backups to show (default: 50)')
  .option('--json', 'Output JSON for scripting')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .action(async (options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.history(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('rollback')
  .description('Quick rollback to the most recent backup (1 hour ago)')
  .option('--from <timestamp>', 'Rollback to specific time instead of 1 hour ago')
  .option('--to <environment>', 'Target environment (default: current)')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .action(async (options) => {
    try {
      const cli = new ShovCLI(options);
      // Quick rollback defaults to 1 hour ago, all resources
      const rollbackOptions = {
        ...options,
        from: options.from || '1 hour ago',
        all: true
      };
      await cli.restore(rollbackOptions);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Handle unknown commands
program.on('command:*', () => {
  console.error(chalk.red('Invalid command:'), program.args.join(' '))
  console.log(chalk.yellow('See --help for a list of available commands.'))
  process.exit(1)
})

// Events Commands
const events = program.command('events').description('Track and query custom events');

events
  .command('track <event> [properties]')
  .description('Track a custom event with optional properties')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--env <environment>', 'Environment name (default: production)')
  .option('--json', 'Output JSON for scripting')
  .action(async (event, properties, options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.eventsTrack(event, properties, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

events
  .command('query')
  .description('Query historical events with filters')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--env <environment>', 'Environment name (default: production)')
  .option('--event <name>', 'Filter by event name')
  .option('--filters <json>', 'JSON filters for event properties')
  .option('--time-range <range>', 'Time range: 1h, 6h, 12h, 24h, 7d, 30d (default: 24h)')
  .option('--limit <number>', 'Maximum number of events to return (default: 100)')
  .option('--json', 'Output JSON for scripting')
  .action(async (options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.eventsQuery(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

events
  .command('tail')
  .description('Stream recent events in real-time')
  .option('-p, --project <project>', 'Project name (or use .shov config)')
  .option('-k, --key <apiKey>', 'API key (or use .shov config)')
  .option('--env <environment>', 'Environment name (default: production)')
  .option('--event <name>', 'Filter by event name')
  .option('--limit <number>', 'Maximum number of events to show (default: 100)')
  .option('--json', 'Output JSON for scripting')
  .action(async (options) => {
    try {
      const cli = new ShovCLI(options);
      await cli.eventsTail(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp()
}

program.parse()
