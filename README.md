# Shov CLI

Instant edge key/value store for developers. Create projects, store data, and build apps with zero setup.

<p align="center">
  <a href="https://shov.com" target="_blank"><strong>Website / Docs</strong></a> •
  <a href="https://github.com/shovdev" target="_blank"><img src="https://img.shields.io/badge/GitHub-181717?style=flat&logo=github&logoColor=white" alt="GitHub"></a> •
  <a href="https://x.com/shovdev" target="_blank"><img src="https://img.shields.io/badge/X-000000?style=flat&logo=x&logoColor=white" alt="X"></a> •
  <a href="https://www.reddit.com/r/shov/" target="_blank"><img src="https://img.shields.io/badge/Reddit-FF4500?style=flat&logo=reddit&logoColor=white" alt="Reddit"></a> •
  <a href="https://discord.gg/GB3rDcFrGz" target="_blank"><img src="https://img.shields.io/badge/Discord-5865F2?style=flat&logo=discord&logoColor=white" alt="Discord"></a>
</p>

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

# Find items with filters
shov where users -f '{"age":25}'

# Find all items in a collection
shov where users
```

## Commands

### Project Management

- `shov new` - Create a new Shov project and API key
- `shov config` - Show current project configuration

### Data Operations

- `shov set <key> <value>` - Set a key-value pair
- `shov get <key>` - Get a value by key
- `shov forget <key>` - Delete a key-value pair
- `shov add <collection> <value>` - Add an item to a collection
- `shov where <collection>` - Find items in a collection (returns all if no filter)
- `shov add-many <collection> <json_array>` - Add multiple items to a collection at once
- `shov update <collection> <id> <value>` - Update an item by collection and ID
- `shov remove <collection> <id>` - Remove an item from a collection by ID
- `shov clear <collection>` - Clear all items from a collection
- `shov contents` - List all memory contents (keys, collections, files)
- `shov search <query>` - Perform a semantic search across keys and collections

### File Operations
- `shov upload <file_path>` - Upload a file
- `shov upload-url <file_name>` - Generate a pre-signed URL for client-side uploads
- `shov forget-file <filename>` - Delete a file by filename

### Authentication
- `shov send-otp <email>` - Send a verification code to an email
- `shov verify-otp <email> <code>` - Verify an email with a code

### Options

All data commands support these options:
- `-p, --project <name>` - Specify project name
- `-k, --key <apikey>` - Specify API key
- `--json` - Output structured JSON for scripting (available on get, search, where commands)

Search-specific options:
- `--top-k <number>` - Maximum number of results (default: 10)
- `--topK <number>` - Alias for --top-k (backward compatibility)
- `--min-score <number>` - Minimum similarity score (0.0-1.0, default: 0.5)
- `--minScore <number>` - Alias for --min-score (backward compatibility)
- `--filters <json>` - JSON object to filter results by specific fields
- `--limit <number>` - Alias for --top-k (pagination)
- `--offset <number>` - Skip results for pagination

If project/key not provided, values are read from `.shov` configuration file.

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

# Add multiple users at once
shov add-many users '[
  {"id":3,"name":"Charlie","role":"user"},
  {"id":4,"name":"Diana","role":"admin"}
]'

# Find users with specific roles
shov where users -f '{"role":"admin"}'

# Get all users (no filter)
shov where users

# Update a user by collection and ID
shov update users user-id-123 '{"name":"Alice Smith","role":"super-admin"}'

# Remove a user by collection and ID
shov remove users user-id-123

# View all contents
shov contents

# Clear all users
shov clear users
```

### File Operations

```bash
# Upload a file directly
shov upload ./document.pdf

# Generate a pre-signed URL for client-side uploads
shov upload-url document.pdf

# Delete a file
shov forget-file document.pdf
```

### Vector Search

```bash
# Add some searchable content
shov add-many products '[
  {"name":"Fender Stratocaster","type":"Electric Guitar","description":"Classic electric guitar"},
  {"name":"Roland TD-27KV","type":"Electronic Drums","description":"Professional drum kit"}
]'

# Search with natural language
shov search "stringed instrument" -c products

# Search with filters and options
shov search "musical equipment" --top-k 5 --min-score 0.7 --filters '{"type":"Electric Guitar"}'

# Search across all collections in project
shov search "musical equipment"

# Get structured JSON output for scripting
shov search "stringed instrument" -c products --json
```

**⚠️ Important Note**: Vector search has eventual consistency. There is a small delay between adding data and it becoming searchable. Newly added items may not appear in search results immediately.

### Authentication

```bash
# Get a login code
shov send-otp user@example.com

# Verify the code
shov verify-otp user@example.com 123456
```

### JSON Output & Scripting

Use `--json` flag for structured output suitable for automation:

```bash
# Get structured JSON output
shov get config --json
# Output: {"success": true, "key": "config", "value": {...}, "project": "my-project"}

# Search with JSON output for parsing
shov search "electronics" --json | jq '.items[].value.name'

# Pipe results to other tools
shov where users --json | jq '.items | length'  # Count users

# Use in shell scripts
RESULT=$(shov get user_count --json)
if echo "$RESULT" | jq -e '.success' > /dev/null; then
  COUNT=$(echo "$RESULT" | jq -r '.value')
  echo "Current user count: $COUNT"
fi
```

### Integration with Existing Projects

```bash
# Initialize in existing project (less common)
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
npm install shov-js
```

```javascript
import { Shov } from 'shov-js'

const shov = new Shov({
  project: 'my-project',
  apiKey: 'shov_live_...'
})

// Key-value operations
await shov.set('hello', 'world')
const value = await shov.get('hello')
await shov.forget('hello')

// Collections
await shov.add('users', { name: 'Alice', age: 25 })
const users = await shov.where('users', { filter: { age: 25 } })
```

## Next.js Integration

Create a new Next.js app with Shov pre-configured:

```bash
npx create-next-app@latest my-app --use-npm
cd my-app
shov init
npm install shov-js
```

Then use in your app:

```javascript
// lib/shov.js
import { Shov } from 'shov-js'

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
    // Example: find users matching a query parameter
    const users = await shov.where('users', { filter: req.query })
    res.json(users)
  }
}
```

## Support

- **Issues**: [GitHub Issues](https://github.com/shovdev/shov-cli/issues)

## License

MIT
