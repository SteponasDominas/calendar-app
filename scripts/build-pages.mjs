import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const packageJsonPath = new URL('../package.json', import.meta.url)
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? process.env.GH_PAGES_REPO ?? packageJson.name

if (!repositoryName) {
  throw new Error('Unable to infer repository name for GitHub Pages build.')
}

const basePath = `/${repositoryName}/`

console.log(`Building GitHub Pages bundle with base path: ${basePath}`)

execSync('vite build', {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_BASE_PATH: basePath,
  },
})
