# Shov CLI

Instant edge key/value store for developers. Create projects, store data, and build apps with zero setup.

## Installation

```bash
npm install -g shov
```

## Quick Start

### 1. Create a new project

```bash
shov new
```

This will:
- Prompt for your email and project name
- Create a new Shov project
- Generate an API key
- Save configuration locally

### 2. Store and retrieve data

```bash
# Set a key-value pair
shov set hello "world"

# Get a value
shov get hello

# Store JSON data
shov set user '{"name":"Alice","age":25}'
```

### 3. Work with collections

```bash
# Add items to a collection
shov add users '{"name":"Alice","age":25}'
shov add users '{"name":"Bob","age":30}'

# List all items in a collection
shov list users

# Find items with filters
shov find users --filter '{"age":25}'
```

## Commands

### Project Management

- `shov new` - Create a new Shov project
- `shov init` - Initialize Shov in an existing project
- `shov config` - Show current project configuration

### Data Operations

- `shov set <key> <value>` - Set a key-value pair
- `shov get <key>` - Get a value by key
- `shov add <collection> <value>` - Add item to collection
- `shov list <collection>` - List items in collection
- `shov find <collection> --filter <json>` - Find items with filters
- `shov delete <id>` - Delete item by ID

### Options

All data commands support these options:
- `-p, --project <name>` - Specify project name
- `-k, --key <apikey>` - Specify API key

If not provided, values are read from `.shov` configuration file.

## Configuration

The CLI stores configuration in a `.shov` file in your project directory:

```json
{
  "project": "my-app",
  "apiKey": "sk_live_...",
  "email": "you@example.com"
}
```

## Examples

### Basic Key-Value Storage

```bash
# String values
shov set app_name "My Awesome App"
shov get app_name

# JSON values
shov set config '{"theme":"dark","lang":"en"}'
shov get config
```

### Collections

```bash
# Add users
shov add users '{"id":1,"name":"Alice","role":"admin"}'
shov add users '{"id":2,"name":"Bob","role":"user"}'

# List all users
shov list users

# Find admins
shov find users --filter '{"role":"admin"}'

# Limit results
shov list users --limit 10 --sort asc
```

### Integration with Existing Projects

```bash
# Initialize in existing project
cd my-existing-project
shov init --project my-project --key shov_live_...

# Or use environment variables
export SHOV_PROJECT=my-project
export SHOV_API_KEY=shov_live_...
shov get some_key
```

## JavaScript SDK

For programmatic access, use the Shov JavaScript SDK:

```bash
npm install shov-sdk
```

```javascript
import { Shov } from 'shov-sdk'

const shov = new Shov({
  project: 'my-project',
  apiKey: 'shov_live_...'
})

// Key-value operations
await shov.set('hello', 'world')
const value = await shov.get('hello')

// Collections
await shov.add('users', { name: 'Alice', age: 25 })
const users = await shov.list('users')
```

## Next.js Integration

Create a new Next.js app with Shov pre-configured:

```bash
npx create-next-app@latest my-app --use-npm
cd my-app
shov init
npm install shov-sdk
```

Then use in your app:

```javascript
// lib/shov.js
import { Shov } from 'shov-sdk'

export const shov = new Shov({
  project: process.env.SHOV_PROJECT,
  apiKey: process.env.SHOV_API_KEY
})

// pages/api/users.js
import { shov } from '../../lib/shov'

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const user = await shov.add('users', req.body)
    res.json(user)
  } else {
    const users = await shov.list('users')
    res.json(users)
  }
}
```

## Support

- Documentation: https://shov.com/docs
- GitHub: https://github.com/shovdev/shov-cli
- Issues: https://github.com/shovdev/shov-cli/issues

## License

MIT
