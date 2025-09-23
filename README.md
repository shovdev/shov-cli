# Shov CLI

Instant Serverless Backends with vector search and real-time streaming. Create projects, store data, and build apps with zero setup.

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
# Create an anonymous project
shov new

# Create a named project
shov new my-project

# Create a project with email verification (for account management)
shov new my-project --email user@example.com
```

This will:
- Create a new Shov project (anonymous by default)
- Generate an API key
- Save configuration locally to `.shov` file
- Add environment variables to your `.env` file
- If email is provided, send a verification code for account linking

### Claiming Anonymous Projects

If you created a project anonymously, you can claim it later to manage it from your dashboard:

```bash
# Claim an anonymous project
shov claim my-anonymous-project user@example.com

# The CLI will:
# 1. Send a verification code to your email
# 2. Prompt you to enter the code
# 3. Complete the claim process
```

This allows you to:
- Access the project from the Shov dashboard
- Manage team members and permissions
- View usage analytics and billing

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
shov add users '{"name":"Alice","age":25,"role":"admin"}'
shov add users '{"name":"Bob","age":30,"role":"user"}'

# Find items with advanced filters
shov where users -f '{"age":25}'
shov where users -f '{"age": {"$gte": 18}, "role": {"$in": ["admin", "moderator"]}}'
shov where users -f '{"name": {"$like": "A%"}, "age": {"$between": [20, 35]}}'

# Count items in collections
shov count users
shov count users -f '{"role": "admin"}'
shov count users -f '{"age": {"$gte": 18}, "status": "active"}'

# Find all items in a collection
shov where users
```

## Commands

### Project Management

- `shov new [projectName]` - Create a new Shov project and API key
  - `--email <email>` - Link project to your email (requires verification)
- `shov claim <projectName> <email>` - Claim an anonymous project by associating it with your email
- `shov config` - Show current project configuration

### Data Operations

- `shov set <key> <value>` - Set a key-value pair
- `shov get <key>` - Get a value by key
- `shov forget <key>` - Delete a key-value pair
- `shov add <collection> <value>` - Add an item to a collection
- `shov where <collection>` - Find items in a collection (returns all if no filter)
- `shov count <collection>` - Count items in a collection with optional filtering
- `shov add-many <collection> <json_array>` - Add multiple items to a collection at once
- `shov update <collection> <id> <value>` - Update an item by collection and ID
- `shov remove <collection> <id>` - Remove an item from a collection by ID
- `shov clear <collection>` - Clear all items from a collection
- `shov batch <operations>` - Execute multiple operations atomically in a single transaction
- `shov contents` - List all memory contents (keys, collections, files)
- `shov search <query>` - Perform a semantic search across keys and collections

### File Operations
- `shov upload <file_path>` - Upload a file
- `shov upload-url <file_name>` - Generate a pre-signed URL for client-side uploads
- `shov forget-file <filename>` - Delete a file by filename

### Authentication
- `shov send-otp <email>` - Send a verification code to an email
- `shov verify-otp <email> <code>` - Verify an email with a code

### Real-time Streaming
- `shov token streaming <subscriptions>` - Create a streaming token for browser-side connections
- `shov subscribe <subscriptions>` - Subscribe to real-time updates via Server-Sent Events
- `shov broadcast <subscription> <message>` - Broadcast a message to active subscribers

### Edge Functions
- `shov edge list` - List all deployed edge functions
- `shov edge create <name> <file>` - Deploy a JavaScript function to the global edge network
- `shov edge update <name> <file>` - Update an existing edge function with new code
- `shov edge delete <name>` - Delete an edge function from the global network
- `shov edge rollback <name> [version]` - Rollback an edge function to a previous version
- `shov edge logs [name]` - View real-time logs from your edge functions

### Secrets Management
- `shov secrets list` - List all secret names (values never shown for security)
- `shov secrets set <name> <value>` - Set a secret for edge functions
- `shov secrets set-many <secrets-json>` - Set multiple secrets at once (bulk operation)
- `shov secrets delete <name>` - Delete a secret from edge functions

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

# Search with advanced filters and options
shov search "musical equipment" --top-k 5 --min-score 0.7 --filters '{"type":"Electric Guitar"}'
shov search "affordable instruments" --filters '{"price": {"$between": [100, 500]}, "type": {"$in": ["Guitar", "Drums"]}}'
shov search "professional gear" --filters '{"brand": {"$like": "Roland%"}, "price": {"$gte": 1000}}'

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

### Atomic Transactions

```bash
# Execute multiple operations atomically
shov batch '[
  {"type": "set", "name": "user:123", "value": {"name": "John", "email": "john@example.com"}},
  {"type": "add", "collection": "orders", "value": {"userId": "123", "total": 99.99}},
  {"type": "update", "collection": "inventory", "id": "item-456", "value": {"stock": 10}}
]'

# E-commerce checkout example (atomic transaction)
shov batch '[
  {"type": "add", "collection": "orders", "value": {"userId": "123", "items": [{"id": "prod-1", "qty": 2}], "total": 199.98}},
  {"type": "update", "collection": "inventory", "id": "prod-1", "value": {"stock": 8}},
  {"type": "set", "name": "user:123:last_order", "value": "order-abc123"}
]'

# Read-your-writes consistency
shov batch '[
  {"type": "set", "name": "counter", "value": 1},
  {"type": "get", "name": "counter"},
  {"type": "set", "name": "counter", "value": 2}
]' --json
```

**Supported operation types in batch:**
- `set` - Set key-value pairs
- `get` - Read values (for read-your-writes consistency)
- `add` - Add items to collections
- `update` - Update collection items by ID
- `remove` - Remove collection items by ID
- `forget` - Delete keys
- `clear` - Clear entire collections

**⚠️ Important**: All operations in a batch are executed atomically. If any operation fails, the entire batch is rolled back and no changes are made.

### Real-time Streaming

```bash
# Create a streaming token for browser-side connections
shov token streaming '[
  {"collection": "users", "filters": {"status": "active"}},
  {"key": "config"},
  {"channel": "notifications"}
]' --expires 3600

# Subscribe to real-time updates (keeps connection open)
shov subscribe '[
  {"collection": "users"},
  {"key": "config"},
  {"channel": "chat"}
]'
# This will show live updates as they happen. Press Ctrl+C to stop.

# In another terminal, broadcast messages to subscribers
shov broadcast '{"channel": "chat"}' '{"user": "Alice", "message": "Hello everyone!"}'

# Broadcast to collection subscribers
shov broadcast '{"collection": "users", "filters": {"role": "admin"}}' '{"type": "alert", "text": "System maintenance"}'

# Broadcast to key subscribers
shov broadcast '{"key": "config"}' '{"theme": "dark", "updated_at": "2024-01-15T10:30:00Z"}'
```

**Real-time Features:**
- **Collection Subscriptions**: Get notified when items are added, updated, or removed
- **Key Subscriptions**: Real-time updates when specific keys change
- **Custom Channels**: Send and receive custom messages for chat, notifications, etc.
- **Filtered Subscriptions**: Only receive updates matching your criteria
- **Auto-broadcasts**: All data writes (set, add, update, remove) automatically notify subscribers

### Edge Functions

```bash
# List all deployed edge functions
shov edge list

# Deploy a simple edge function
echo 'export default async function(req) { 
  return new Response(JSON.stringify({ message: "Hello from edge!" })); 
}' > hello.js
shov edge create hello-world hello.js

# Update an edge function
shov edge update hello-world hello-v2.js

# View real-time logs
shov edge logs hello-world

# Rollback to previous version
shov edge rollback hello-world

# Delete an edge function
shov edge delete hello-world
```

### Secrets Management

```bash
# List all secret names
shov secrets list

# Set a secret for all functions
shov secrets set DATABASE_URL "postgresql://user:pass@localhost:5432/db"

# Set a secret for specific functions
shov secrets set API_KEY "sk_live_abc123" --functions "user-auth,payment-api"

# Set multiple secrets at once
shov secrets set-many '[
  {"name": "DATABASE_URL", "value": "postgresql://user:pass@localhost:5432/db"},
  {"name": "REDIS_URL", "value": "redis://localhost:6379"},
  {"name": "JWT_SECRET", "value": "super-secret-jwt-key"}
]'

# Delete a secret
shov secrets delete OLD_API_KEY
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

// Vector search
const results = await shov.search('find Alice', { collection: 'users' })

// Atomic transactions
const batchResult = await shov.batch([
  { type: 'set', name: 'user:123', value: { name: 'John', email: 'john@example.com' } },
  { type: 'add', collection: 'orders', value: { userId: '123', total: 99.99 } },
  { type: 'update', collection: 'inventory', id: 'item-456', value: { stock: 10 } }
])

// Real-time streaming
const { eventSource, close } = await shov.subscribe([
  { collection: 'users' },
  { channel: 'notifications' }
], {
  onMessage: (data) => console.log('Update:', data),
  onError: (error) => console.error('Stream error:', error)
})

// Broadcast messages
await shov.broadcast(
  { channel: 'notifications' },
  { text: 'Hello from the app!' }
)

// Close stream when done
// close()
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
