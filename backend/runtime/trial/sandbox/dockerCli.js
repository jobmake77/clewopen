import { execFile } from 'child_process'
import { promisify } from 'util'
import { getTrialRuntimeConfig } from '../config.js'

const execFileAsync = promisify(execFile)

function normalizeDockerArgs(args) {
  return args.filter((arg) => arg !== undefined && arg !== null && arg !== '')
}

function normalizeError(error, args) {
  const stdout = error.stdout || ''
  const stderr = error.stderr || ''
  const summary = stderr.trim() || stdout.trim() || error.message
  const wrapped = new Error(`docker ${args.join(' ')} failed: ${summary}`)
  wrapped.cause = error
  wrapped.stdout = stdout
  wrapped.stderr = stderr
  wrapped.exitCode = error.code
  return wrapped
}

export async function runDockerCommand(args, options = {}) {
  const normalizedArgs = normalizeDockerArgs(args)
  const { dockerBin, dockerHelperPath } = getTrialRuntimeConfig()
  const env = { ...(process.env || {}), ...(options.env || {}) }

  if (dockerHelperPath) {
    const currentPath = env.PATH || ''
    if (!currentPath.split(':').includes(dockerHelperPath)) {
      env.PATH = currentPath ? `${dockerHelperPath}:${currentPath}` : dockerHelperPath
    }
  }

  try {
    return await execFileAsync(dockerBin, normalizedArgs, {
      timeout: options.timeoutMs,
      maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
      cwd: options.cwd,
      env,
    })
  } catch (error) {
    throw normalizeError(error, normalizedArgs)
  }
}

export async function runDockerCommandQuietly(args, options = {}) {
  try {
    return await runDockerCommand(args, options)
  } catch (error) {
    if (options.ignoreExitCodes?.includes(error.exitCode)) {
      return { stdout: error.stdout || '', stderr: error.stderr || '' }
    }
    throw error
  }
}
