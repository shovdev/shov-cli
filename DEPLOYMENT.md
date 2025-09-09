# Deployment Setup

This document outlines the setup required for automatic deployment and NPM publishing.

## GitHub Repository Setup

This package is automatically synced from a private monorepo to the public `shovdev/shov-cli` repository.

### Required Secrets

The following secrets need to be configured in the `shovdev/shov-cli` repository:

1. **NPM_TOKEN**: An NPM automation token with publish permissions
   - Go to https://www.npmjs.com/settings/tokens
   - Create a new "Automation" token
   - Add it as a repository secret named `NPM_TOKEN`

### Required Variables

The following variables need to be configured in the private monorepo repository:

1. **PUBLIC_GITHUB_OWNER**: Set to `shovdev`
2. **PUBLIC_REPO_ACCESS_TOKEN**: A GitHub Personal Access Token with repo permissions

## Publishing Process

1. Changes are made in the private monorepo
2. On push to master, the sync workflow copies files to `shovdev/shov-cli`
3. The publish workflow in `shovdev/shov-cli` checks if the version is new
4. If new, it publishes to NPM and creates a GitHub release

## Version Management

- The package starts at version 2.0.0 (taking over from previous package)
- Version bumps should be done in the private monorepo's `packages/shov-cli/package.json`
- The sync will copy the new version to the public repo
- Publishing happens automatically when a new version is detected

## Manual Publishing

If needed, you can manually trigger publishing by:

1. Going to the `shovdev/shov-cli` repository
2. Going to Actions → Publish to NPM
3. Clicking "Run workflow"

## Troubleshooting

- Check that all secrets and variables are properly configured
- Ensure the NPM token has the correct permissions
- Verify the GitHub token can push to the public repositories
- Check workflow logs for specific error messages
