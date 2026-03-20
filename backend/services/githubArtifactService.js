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

function buildGithubBinaryHeaders(token) {
  return {
    Accept: 'application/octet-stream',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'clewopen-custom-order-artifact',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function parseRepo(repository) {
  const normalized = String(repository || '').trim()
  const parts = normalized.split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`无效 repository: ${repository}`)
  }
  return {
    owner: parts[0],
    repo: parts[1],
    full: normalized,
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

function buildReleaseTag(orderId) {
  return `custom-order-${orderId}`
}

async function getContentShaIfExists({ token, repository, filePath }) {
  const url = `https://api.github.com/repos/${repository}/contents/${encodeURIComponent(filePath)}`
  const response = await fetch(url, {
    method: 'GET',
    headers: buildGithubHeaders(token),
  })
  if (response.status === 404) return null
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub get content failed (${response.status}): ${body}`)
  }
  const data = await response.json()
  return data?.sha || null
}

async function upsertRepoJsonFile({
  token,
  repository,
  filePath,
  payload,
  message,
}) {
  const existingSha = await getContentShaIfExists({
    token,
    repository,
    filePath,
  })
  const body = {
    message,
    content: Buffer.from(JSON.stringify(payload, null, 2), 'utf8').toString('base64'),
    committer: {
      name: 'ClewOpen Bot',
      email: 'noreply@clewopen.local',
    },
  }
  if (existingSha) body.sha = existingSha

  const url = `https://api.github.com/repos/${repository}/contents/${encodeURIComponent(filePath)}`
  const response = await fetch(url, {
    method: 'PUT',
    headers: buildGithubHeaders(token),
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`GitHub upsert json failed (${response.status}): ${text}`)
  }
  const data = await response.json()
  return {
    path: filePath,
    sha: data?.content?.sha || '',
    html_url: data?.content?.html_url || null,
  }
}

async function getOrCreateRelease({ token, repository, orderId }) {
  const { owner, repo } = parseRepo(repository)
  const tag = buildReleaseTag(orderId)
  const getUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`
  const getResponse = await fetch(getUrl, {
    method: 'GET',
    headers: buildGithubHeaders(token),
  })

  if (getResponse.ok) {
    const data = await getResponse.json()
    return {
      id: data.id,
      tag: data.tag_name,
      uploadUrl: String(data.upload_url || '').replace(/\{.*$/, ''),
      htmlUrl: data.html_url || null,
    }
  }

  if (getResponse.status !== 404) {
    const body = await getResponse.text()
    throw new Error(`GitHub get release failed (${getResponse.status}): ${body}`)
  }

  const createUrl = `https://api.github.com/repos/${owner}/${repo}/releases`
  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: buildGithubHeaders(token),
    body: JSON.stringify({
      tag_name: tag,
      name: `Custom Order ${orderId}`,
      body: `Managed release assets for custom order ${orderId}`,
      draft: false,
      prerelease: false,
      make_latest: 'false',
    }),
  })
  if (!createResponse.ok) {
    const body = await createResponse.text()
    throw new Error(`GitHub create release failed (${createResponse.status}): ${body}`)
  }
  const data = await createResponse.json()
  return {
    id: data.id,
    tag: data.tag_name,
    uploadUrl: String(data.upload_url || '').replace(/\{.*$/, ''),
    htmlUrl: data.html_url || null,
  }
}

function buildAssetName({ submissionIdHint, sha256, originalName }) {
  const prefix = String(submissionIdHint || 'submission').replace(/[^a-zA-Z0-9._-]+/g, '-')
  return `${prefix}-${sha256.slice(0, 12)}-${normalizeZipName(originalName)}`
}

async function deleteReleaseAsset({ token, repository, assetId }) {
  const { owner, repo } = parseRepo(repository)
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/assets/${assetId}`
  const response = await fetch(url, {
    method: 'DELETE',
    headers: buildGithubHeaders(token),
  })
  if (!response.ok && response.status !== 404) {
    const body = await response.text()
    throw new Error(`GitHub delete release asset failed (${response.status}): ${body}`)
  }
}

async function uploadReleaseAsset({ token, repository, releaseId, assetName, fileBuffer }) {
  const { owner, repo } = parseRepo(repository)
  const listUrl = `https://api.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets`
  const listResponse = await fetch(listUrl, {
    method: 'GET',
    headers: buildGithubHeaders(token),
  })
  if (!listResponse.ok) {
    const body = await listResponse.text()
    throw new Error(`GitHub list release assets failed (${listResponse.status}): ${body}`)
  }
  const assets = await listResponse.json()
  const duplicated = Array.isArray(assets) ? assets.find((item) => item?.name === assetName) : null
  if (duplicated?.id) {
    await deleteReleaseAsset({ token, repository, assetId: duplicated.id })
  }

  const uploadUrl = `https://uploads.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'clewopen-custom-order-artifact',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/zip',
    },
    body: fileBuffer,
  })
  if (!uploadResponse.ok) {
    const body = await uploadResponse.text()
    throw new Error(`GitHub upload release asset failed (${uploadResponse.status}): ${body}`)
  }

  const data = await uploadResponse.json()
  return {
    id: data.id,
    name: data.name,
    size: data.size,
    browserDownloadUrl: data.browser_download_url || null,
  }
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
  const release = await getOrCreateRelease({
    token,
    repository: repo,
    orderId,
  })
  const assetName = buildAssetName({
    submissionIdHint,
    sha256,
    originalName: fileName,
  })
  const asset = await uploadReleaseAsset({
    token,
    repository: repo,
    releaseId: release.id,
    assetName,
    fileBuffer,
  })

  const now = new Date().toISOString()
  const basePath = `artifacts/custom-orders/${orderId}/${submissionIdHint}-${sha256.slice(0, 12)}`
  const manifestPath = `${basePath}/manifest.json`
  const indexPath = `${basePath}/index.json`

  const manifestFile = await upsertRepoJsonFile({
    token,
    repository: repo,
    filePath: manifestPath,
    payload: manifest || {},
    message: `chore(custom-order): update manifest ${orderId}/${submissionIdHint}`,
  })

  const indexPayload = {
    order_id: orderId,
    submission_id_hint: submissionIdHint,
    created_at: now,
    repository: repo,
    manifest_path: manifestPath,
    release: {
      id: release.id,
      tag: release.tag,
      url: release.htmlUrl,
    },
    asset: {
      id: asset.id,
      name: asset.name,
      size: asset.size,
      browser_download_url: asset.browserDownloadUrl,
    },
    file: {
      name: fileName,
      size_bytes: fileSizeBytes,
      sha256,
    },
  }

  const indexFile = await upsertRepoJsonFile({
    token,
    repository: repo,
    filePath: indexPath,
    payload: indexPayload,
    message: `chore(custom-order): update index ${orderId}/${submissionIdHint}`,
  })

  return {
    repository: repo,
    git_path: indexPath,
    git_sha: indexFile.sha,
    file_name: fileName,
    file_size_bytes: fileSizeBytes,
    sha256,
    manifest: manifest || null,
    metadata: {
      index_file: indexFile,
      manifest_file: manifestFile,
      release: {
        id: release.id,
        tag: release.tag,
        url: release.htmlUrl,
      },
      asset: {
        id: asset.id,
        name: asset.name,
        size: asset.size,
        browser_download_url: asset.browserDownloadUrl,
      },
    },
  }
}

export async function downloadGithubArtifact({ repository, gitPath, metadata }) {
  const token = resolveGithubToken()
  if (!token) {
    throw new Error('GITHUB_PUBLISH_TOKEN 未配置，无法下载交付包')
  }

  const assetId = Number(metadata?.asset?.id || metadata?.release_asset_id || 0)
  if (assetId > 0) {
    const { owner, repo } = parseRepo(repository)
    const assetUrl = `https://api.github.com/repos/${owner}/${repo}/releases/assets/${assetId}`
    const assetResponse = await fetch(assetUrl, {
      method: 'GET',
      headers: buildGithubBinaryHeaders(token),
      redirect: 'follow',
    })
    if (!assetResponse.ok) {
      const body = await assetResponse.text()
      throw new Error(`GitHub release asset fetch failed (${assetResponse.status}): ${body}`)
    }
    return Buffer.from(await assetResponse.arrayBuffer())
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
