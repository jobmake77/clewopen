import crypto from 'crypto'
import path from 'path'
import dotenv from 'dotenv'
import { buildSessionWorkspace } from '../runtime/trial/sessionBuilder.js'
import { installSessionAgent, runContainerSession } from '../runtime/trial/containerRunner.js'
import { getTrialRuntimeConfig } from '../runtime/trial/config.js'
import {
  buildTrialSandboxLlmMetadata,
  resolveTrialSandboxLlmConfig,
} from '../runtime/trial/llmSandboxConfig.js'
import {
  createContainerWorkspace,
  destroyContainerWorkspace,
} from '../runtime/trial/sandbox/containerWorkspace.js'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

function parseArgs(argv) {
  const args = {
    message: '请用中文简单介绍一下你是谁，以及你能帮我做什么。',
    packageUrl: '/storage/agents/example-session-agent-1.0.0.zip',
    keepOnFailure: false,
    keepAlways: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]

    if (current === '--message' && argv[index + 1]) {
      args.message = argv[index + 1]
      index += 1
      continue
    }

    if (current === '--package' && argv[index + 1]) {
      args.packageUrl = argv[index + 1]
      index += 1
      continue
    }

    if (current === '--keep-on-failure') {
      args.keepOnFailure = true
      continue
    }

    if (current === '--keep') {
      args.keepAlways = true
    }
  }

  return args
}

function previewText(value, maxLength = 500) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function buildSyntheticAgent(packageUrl) {
  return {
    id: 'trial-smoke-agent',
    name: 'Trial Sandbox Smoke Agent',
    description: 'Validates the containerized OpenClaw trial runtime end-to-end.',
    package_url: packageUrl,
    manifest: {
      name: 'trial-smoke-agent',
      version: '1.0.0',
      purpose: 'trial-sandbox-smoke-test',
    },
  }
}

async function main() {
  process.env.TRIAL_RUNTIME_MODE = 'container'

  const args = parseArgs(process.argv.slice(2))
  const runtimeConfig = getTrialRuntimeConfig()
  const sessionId = `smoke-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`
  const agent = buildSyntheticAgent(args.packageUrl)

  let workspace = null
  let session = null
  let keepArtifacts = args.keepAlways

  try {
    const llmConfig = await resolveTrialSandboxLlmConfig()
    const llmMetadata = buildTrialSandboxLlmMetadata(llmConfig)

    console.log(
      JSON.stringify(
        {
          phase: 'bootstrap',
          runtime: {
            mode: runtimeConfig.mode,
            image: runtimeConfig.containerImage,
            network: runtimeConfig.network,
            workspaceRoot: runtimeConfig.workspaceRoot,
            openclawNodeOptions: runtimeConfig.openclawNodeOptions,
          },
          llm: llmMetadata,
        },
        null,
        2
      )
    )

    workspace = await createContainerWorkspace(sessionId, {
      cleanupManaged: false,
      labels: {
        'openclew.trial.smoke': 'true',
      },
    })
    await buildSessionWorkspace(agent, workspace.workspacePath)

    session = {
      id: sessionId,
      agent_id: agent.id,
      agent_name: agent.name,
      agent_description: agent.description,
      sandbox_ref: workspace.sandboxRef,
      workspace_path: workspace.workspacePath,
      runtime_type: 'container',
      metadata: {},
    }

    const install = await installSessionAgent(session)
    console.log(
      JSON.stringify(
        {
          phase: 'install',
          status: install.status,
          llm: install.llm,
          stdout: previewText(install.stdout),
          stderr: previewText(install.stderr),
          workspacePath: workspace.workspacePath,
          container: workspace.containerName,
        },
        null,
        2
      )
    )

    const run = await runContainerSession(session, [], args.message)
    console.log(
      JSON.stringify(
        {
          phase: 'run',
          response: run.response,
          usage: run.usage,
          metadata: run.metadata,
        },
        null,
        2
      )
    )

    if (!run.response || run.response === 'No reply from agent.') {
      throw new Error('Smoke test completed transport, but the agent did not return user-facing text')
    }
  } catch (error) {
    const summary = {
      phase: 'error',
      message: error.message,
      workspacePath: workspace?.workspacePath || null,
      container: workspace?.containerName || null,
    }

    if (error.stdout || error.stderr) {
      summary.stdout = previewText(error.stdout, 1000)
      summary.stderr = previewText(error.stderr, 1000)
    }

    console.error(JSON.stringify(summary, null, 2))

    if (args.keepOnFailure || args.keepAlways) {
      keepArtifacts = true
      console.error('Smoke test artifacts were kept for inspection.')
    }

    throw error
  } finally {
    if (session && !keepArtifacts) {
      try {
        await destroyContainerWorkspace(session)
      } catch (cleanupError) {
        console.error(
          JSON.stringify(
            {
              phase: 'cleanup-error',
              message: cleanupError.message,
              workspacePath: workspace?.workspacePath || null,
              container: workspace?.containerName || null,
            },
            null,
            2
          )
        )
      }
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
