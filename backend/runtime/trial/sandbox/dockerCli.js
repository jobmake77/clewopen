import { execFile, spawn } from 'child_process'
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
  const { dockerBin, env } = buildDockerExecutionContext(options)

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

function buildDockerExecutionContext(options = {}) {
  const { dockerBin, dockerHelperPath } = getTrialRuntimeConfig()
  const env = { ...(process.env || {}), ...(options.env || {}) }

  if (dockerHelperPath) {
    const currentPath = env.PATH || ''
    if (!currentPath.split(':').includes(dockerHelperPath)) {
      env.PATH = currentPath ? `${dockerHelperPath}:${currentPath}` : dockerHelperPath
    }
  }

  return {
    dockerBin,
    env,
  }
}

function appendChunk(buffer, chunk, maxBuffer) {
  const next = `${buffer}${chunk}`
  if (next.length <= maxBuffer) return next
  return next.slice(next.length - maxBuffer)
}

export async function runDockerCommandStreaming(args, options = {}) {
  const normalizedArgs = normalizeDockerArgs(args)
  const { dockerBin, env } = buildDockerExecutionContext(options)
  const maxBuffer = options.maxBuffer || 10 * 1024 * 1024

  return await new Promise((resolve, reject) => {
    const child = spawn(dockerBin, normalizedArgs, {
      cwd: options.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    let timeoutId = null

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    const settleResolve = (value) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }

    const settleReject = (error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    if (options.timeoutMs) {
      timeoutId = setTimeout(() => {
        child.kill('SIGTERM')
        const timeoutError = new Error(`docker ${normalizedArgs.join(' ')} timed out after ${options.timeoutMs}ms`)
        timeoutError.stdout = stdout
        timeoutError.stderr = stderr
        timeoutError.code = 'ETIMEDOUT'
        settleReject(normalizeError(timeoutError, normalizedArgs))
      }, options.timeoutMs)
    }

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      stdout = appendChunk(stdout, text, maxBuffer)
      options.onStdoutChunk?.(text)
    })

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr = appendChunk(stderr, text, maxBuffer)
      options.onStderrChunk?.(text)
    })

    child.on('error', (error) => {
      error.stdout = stdout
      error.stderr = stderr
      settleReject(normalizeError(error, normalizedArgs))
    })

    child.on('close', (code) => {
      if (code === 0) {
        settleResolve({ stdout, stderr })
        return
      }

      const error = new Error(`docker ${normalizedArgs.join(' ')} failed with exit code ${code}`)
      error.code = code
      error.stdout = stdout
      error.stderr = stderr
      settleReject(normalizeError(error, normalizedArgs))
    })
  })
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
