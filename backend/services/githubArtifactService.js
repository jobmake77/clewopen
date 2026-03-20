import fs from 'fs/promises'
import crypto from 'crypto'
import path from 'path'

function resolveGithubToken() {
  return String(process.env.GITHUB_PUBLISH_TOKEN || process.env.GITHUB_TOKEN || '').trim()
}

function resolveArtifactRepo() {
  const configured = String(process.env.CUSTOM_ORDER_ARTIFACT_REPO || '').trim()
  if (configured) return configured

  const owner = String(process.env.GITHUB_PUBLISH_OWNER || 'jobmake77').trim() || 'jobmake77'
  return `${owner}/clewopen-repo`
}

function buildGithubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'clewopen-custom-order-artifact',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
}

function normalizeZipName(name = '') {
  const base = path.basename(String(name || 'submission.zip'))
  const safe = base
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return safe.toLowerCase().endsWith('.zip') ? safe : `${safe || 'submission'}.zip`
}

export async function computeFileSha256(filePath) {
  const buffer = await fs.readFile(filePath)
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

export async function uploadCustomOrderArtifactToGithub({
  orderId,
  submissionIdHint,
  originalName,
  localFilePath,
  manifest,
}) {
  const token = resolveGithubToken()
  if (!token) {
    throw new Error('GITHUB_PUBLISH_TOKEN 未配置，无法上传交付包到 GitHub 仓库')
  }

  const repo = resolveArtifactRepo()
  if (!repo.includes('/')) {
    throw new Error(`CUSTOM_ORDER_ARTIFACT_REPO 配置无效: ${repo}`)
  }

  const fileName = normalizeZipName(originalName)
  const fileBuffer = await fs.readFile(localFilePath)
  const fileSizeBytes = fileBuffer.byteLength
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex')
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const suffix = sha256.slice(0, 12)
  const gitPath = `artifacts/custom-orders/${orderId}/${yyyy}${mm}${dd}-${submissionIdHint}-${suffix}-${fileName}`

  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(gitPath)}`
  const payload = {
    message: `chore(custom-order): upload artifact ${orderId}/${submissionIdHint}`,
    content: fileBuffer.toString('base64'),
    committer: {
      name: 'ClewOpen Bot',
      email: 'noreply@clewopen.local',
    },
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: buildGithubHeaders(token),
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub artifact upload failed (${response.status}): ${body}`)
  }

  const data = await response.json()
  return {
    repository: repo,
    git_path: gitPath,
    git_sha: data?.content?.sha || '',
    file_name: fileName,
    file_size_bytes: fileSizeBytes,
    sha256,
    manifest: manifest || null,
    metadata: {
      html_url: data?.content?.html_url || null,
      download_url: data?.content?.download_url || null,
    },
  }
}

export async function downloadGithubArtifact({ repository, gitPath }) {
  const token = resolveGithubToken()
  if (!token) {
    throw new Error('GITHUB_PUBLISH_TOKEN 未配置，无法下载交付包')
  }

  const url = `https://api.github.com/repos/${repository}/contents/${encodeURIComponent(gitPath)}`
  const response = await fetch(url, {
    method: 'GET',
    headers: buildGithubHeaders(token),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub artifact fetch failed (${response.status}): ${body}`)
  }

  const data = await response.json()
  if (!data?.content) {
    throw new Error('GitHub 返回内容为空')
  }

  const normalized = String(data.content || '').replace(/\n/g, '')
  return Buffer.from(normalized, 'base64')
}
