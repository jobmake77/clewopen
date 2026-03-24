import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import User from '../../models/User.js'
import { query } from '../../config/database.js'
import { logger } from '../../config/logger.js'
import { generateToken } from '../../middleware/auth.js'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
const EMAIL_CODE_TTL_MINUTES = Math.max(3, Number.parseInt(process.env.EMAIL_CODE_TTL_MINUTES || '10', 10))
const EMAIL_CODE_RESEND_SECONDS = Math.max(20, Number.parseInt(process.env.EMAIL_CODE_RESEND_SECONDS || '60', 10))
const EMAIL_CODE_MAX_ATTEMPTS = Math.max(3, Number.parseInt(process.env.EMAIL_CODE_MAX_ATTEMPTS || '5', 10))
const FRONTEND_BASE_URL = String(process.env.AUTH_FRONTEND_BASE_URL || 'https://clewopen.com').trim().replace(/\/+$/, '')
const PUBLIC_BASE_URL = String(process.env.AUTH_PUBLIC_BASE_URL || FRONTEND_BASE_URL).trim().replace(/\/+$/, '')
const GITHUB_CLIENT_ID = String(process.env.GITHUB_OAUTH_CLIENT_ID || '').trim()
const GITHUB_CLIENT_SECRET = String(process.env.GITHUB_OAUTH_CLIENT_SECRET || '').trim()
const GITHUB_OAUTH_REDIRECT_URI = String(
  process.env.GITHUB_OAUTH_REDIRECT_URI || `${PUBLIC_BASE_URL}/api/auth/github/callback`
).trim()
const EMAIL_FROM = String(process.env.EMAIL_LOGIN_FROM || process.env.RESEND_FROM || 'no-reply@clewopen.com').trim()
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || '').trim()
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '')
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || '').trim()
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function buildUserPayload(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    avatar: user.avatar || user.avatar_url || null,
    bio: user.bio || null,
    auth_provider: user.auth_provider || 'password',
  }
}

function hashEmailCode(email, code) {
  const secret = process.env.EMAIL_CODE_SECRET || JWT_SECRET
  return crypto.createHash('sha256').update(`${secret}:${email}:${code}`).digest('hex')
}

function generateEmailCode() {
  const value = crypto.randomInt(0, 1000000)
  return String(value).padStart(6, '0')
}

function generateStateToken(payload = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '10m' })
}

function verifyStateToken(state) {
  return jwt.verify(state, JWT_SECRET)
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim()
  }
  return req.ip || null
}

function getGithubAuthUrl(redirectPath = '/login') {
  const state = generateStateToken({
    redirectPath: redirectPath.startsWith('/') ? redirectPath : '/login',
    nonce: crypto.randomUUID(),
  })
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_OAUTH_REDIRECT_URI,
    scope: 'read:user user:email',
    state,
  })
  return `https://github.com/login/oauth/authorize?${params.toString()}`
}

async function sendEmailCode(email, code) {
  if (!RESEND_API_KEY) {
    logger.warn(`[auth] RESEND_API_KEY 未配置，验证码仅输出日志: email=${email} code=${code}`)
    return
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [email],
      subject: 'ClewOpen 登录验证码',
      text: `你的验证码是 ${code}，${EMAIL_CODE_TTL_MINUTES} 分钟内有效。`,
      html: `<p>你的 ClewOpen 登录验证码是：</p><h2 style="letter-spacing: 2px;">${code}</h2><p>${EMAIL_CODE_TTL_MINUTES} 分钟内有效。</p>`,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Resend send failed (${response.status}): ${body}`)
  }
}

async function getUserByGithubId(githubId) {
  const result = await query(
    `SELECT * FROM users WHERE github_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [githubId]
  )
  return result.rows[0] || null
}

async function createUserWithProvider({ username, email, authProvider, avatarUrl, githubId = null }) {
  const passwordRaw = crypto.randomBytes(24).toString('hex')
  const passwordHash = await bcrypt.hash(passwordRaw, 10)
  const result = await query(
    `INSERT INTO users (username, email, password_hash, role, avatar_url, auth_provider, github_id, email_verified_at)
     VALUES ($1, $2, $3, 'user', $4, $5, $6, CURRENT_TIMESTAMP)
     RETURNING *`,
    [username, email, passwordHash, avatarUrl || null, authProvider, githubId]
  )
  return result.rows[0]
}

async function generateUniqueUsername(baseUsername) {
  const base = String(baseUsername || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'user'

  for (let i = 0; i < 20; i += 1) {
    const suffix = i === 0 ? '' : `_${crypto.randomInt(100, 999)}`
    const candidate = `${base}${suffix}`
    // eslint-disable-next-line no-await-in-loop
    const existed = await User.findByUsername(candidate)
    if (!existed) return candidate
  }
  return `user_${Date.now()}_${crypto.randomInt(100, 999)}`
}

function respondWithSession(res, user, status = 200) {
  const token = generateToken(user.id)
  return res.status(status).json({
    success: true,
    data: {
      user: buildUserPayload(user),
      token,
    },
  })
}

/**
 * 用户注册
 */
export const register = async (req, res) => {
  try {
    const { username, email, password, role = 'user' } = req.body

    if (!username || !email || !password) {
      return res.status(400).json({ success: false, error: 'Username, email and password are required' })
    }

    const normalizedEmail = normalizeEmail(email)
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' })
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' })
    }

    const existingUsername = await User.findByUsername(username)
    if (existingUsername) {
      return res.status(400).json({ success: false, error: 'Username already exists' })
    }

    const existingEmail = await User.findByEmail(normalizedEmail)
    if (existingEmail) {
      return res.status(400).json({ success: false, error: 'Email already exists' })
    }

    const user = await User.create({ username, email: normalizedEmail, password, role })
    await query(
      `UPDATE users
       SET auth_provider = 'password'
       WHERE id = $1`,
      [user.id]
    )

    return respondWithSession(res, { ...user, auth_provider: 'password' }, 201)
  } catch (error) {
    logger.error(`Register error: ${error.message}`)
    return res.status(500).json({ success: false, error: 'Registration failed' })
  }
}

/**
 * 用户密码登录
 */
export const login = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email)
    const { password } = req.body

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' })
    }

    const user = await User.findByEmail(email)
    if (!user || !user.password_hash) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash)
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' })
    }

    await User.updateLastLogin(user.id)
    return respondWithSession(res, user)
  } catch (error) {
    logger.error(`Login error: ${error.message}`)
    return res.status(500).json({ success: false, error: 'Login failed' })
  }
}

/**
 * 发送邮箱验证码（登录）
 */
export const sendEmailLoginCode = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email)
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' })
    }

    const recent = await query(
      `SELECT created_at
       FROM auth_email_login_codes
       WHERE email = $1
         AND consumed_at IS NULL
         AND created_at > NOW() - ($2::text || ' seconds')::interval
       ORDER BY created_at DESC
       LIMIT 1`,
      [email, EMAIL_CODE_RESEND_SECONDS]
    )

    if (recent.rows.length > 0) {
      return res.status(429).json({
        success: false,
        error: `发送过于频繁，请 ${EMAIL_CODE_RESEND_SECONDS} 秒后重试`,
      })
    }

    const code = generateEmailCode()
    const codeHash = hashEmailCode(email, code)
    const ip = getClientIp(req)

    await query(
      `UPDATE auth_email_login_codes
       SET consumed_at = CURRENT_TIMESTAMP
       WHERE email = $1 AND consumed_at IS NULL`,
      [email]
    )

    await query(
      `INSERT INTO auth_email_login_codes (email, code_hash, expires_at, created_ip)
       VALUES ($1, $2, NOW() + ($3::text || ' minutes')::interval, $4)`,
      [email, codeHash, EMAIL_CODE_TTL_MINUTES, ip]
    )

    await sendEmailCode(email, code)

    return res.json({
      success: true,
      data: { expiresInSeconds: EMAIL_CODE_TTL_MINUTES * 60 },
    })
  } catch (error) {
    logger.error(`Send email login code error: ${error.message}`)
    return res.status(500).json({ success: false, error: 'Failed to send login code' })
  }
}

/**
 * 邮箱验证码登录
 */
export const verifyEmailLoginCode = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email)
    const code = String(req.body.code || '').trim()
    const requestedUsername = String(req.body.username || '').trim()

    if (!email || !EMAIL_REGEX.test(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, error: 'Email or verification code is invalid' })
    }

    const result = await query(
      `SELECT *
       FROM auth_email_login_codes
       WHERE email = $1 AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [email]
    )

    const row = result.rows[0]
    if (!row) {
      return res.status(400).json({ success: false, error: 'Verification code not found, please request again' })
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      await query(`UPDATE auth_email_login_codes SET consumed_at = CURRENT_TIMESTAMP WHERE id = $1`, [row.id])
      return res.status(400).json({ success: false, error: 'Verification code expired, please request again' })
    }

    const codeHash = hashEmailCode(email, code)
    if (codeHash !== row.code_hash) {
      const nextAttempts = (row.attempt_count || 0) + 1
      if (nextAttempts >= EMAIL_CODE_MAX_ATTEMPTS) {
        await query(
          `UPDATE auth_email_login_codes
           SET attempt_count = $2, consumed_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [row.id, nextAttempts]
        )
      } else {
        await query(
          `UPDATE auth_email_login_codes
           SET attempt_count = $2
           WHERE id = $1`,
          [row.id, nextAttempts]
        )
      }
      return res.status(400).json({ success: false, error: 'Verification code is incorrect' })
    }

    await query(`UPDATE auth_email_login_codes SET consumed_at = CURRENT_TIMESTAMP WHERE id = $1`, [row.id])

    let user = await User.findByEmail(email)
    if (!user) {
      const preferred = requestedUsername || email.split('@')[0]
      const username = await generateUniqueUsername(preferred)
      user = await createUserWithProvider({
        username,
        email,
        authProvider: 'email_code',
      })
    } else {
      await query(
        `UPDATE users
         SET auth_provider = 'email_code',
             email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP),
             last_login_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [user.id]
      )
      user = await User.findById(user.id)
    }

    return respondWithSession(res, user)
  } catch (error) {
    logger.error(`Verify email login code error: ${error.message}`)
    return res.status(500).json({ success: false, error: 'Email login failed' })
  }
}

/**
 * 获取 GitHub OAuth 登录链接
 */
export const getGithubLoginUrl = async (req, res) => {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return res.status(400).json({
      success: false,
      error: 'GitHub OAuth is not configured',
    })
  }
  const redirectPath = String(req.query.redirect || '/login')
  const url = getGithubAuthUrl(redirectPath)
  return res.json({ success: true, data: { url } })
}

/**
 * 直接重定向到 GitHub 授权页
 */
export const startGithubLogin = async (req, res) => {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return res.status(400).send('GitHub OAuth is not configured')
  }
  const redirectPath = String(req.query.redirect || '/login')
  return res.redirect(getGithubAuthUrl(redirectPath))
}

async function exchangeGithubToken(code) {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: GITHUB_OAUTH_REDIRECT_URI,
    }),
  })
  if (!response.ok) {
    throw new Error(`GitHub token exchange failed (${response.status})`)
  }
  const data = await response.json()
  if (!data.access_token) throw new Error('GitHub access_token not found')
  return data.access_token
}

async function fetchGithubProfile(accessToken) {
  const profileResp = await fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'clewopen-auth',
    },
  })
  if (!profileResp.ok) {
    throw new Error(`GitHub user api failed (${profileResp.status})`)
  }
  const profile = await profileResp.json()

  const emailResp = await fetch('https://api.github.com/user/emails', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'clewopen-auth',
    },
  })

  let email = profile.email || null
  if (emailResp.ok) {
    const emails = await emailResp.json()
    const primary = emails.find(item => item.primary && item.verified)
    const fallback = emails.find(item => item.verified) || emails.find(Boolean)
    email = primary?.email || fallback?.email || email
  }

  if (!email) {
    email = `${profile.login}@users.noreply.github.com`
  }

  return {
    githubId: String(profile.id),
    login: profile.login || `github_user_${profile.id}`,
    email: normalizeEmail(email),
    avatarUrl: profile.avatar_url || null,
  }
}

async function fetchSupabaseUser(accessToken) {
  const apiKey = SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !apiKey) {
    throw new Error('Supabase Auth is not configured on backend')
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: apiKey,
    },
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Supabase user fetch failed (${response.status}): ${body}`)
  }
  return response.json()
}

/**
 * GitHub OAuth 回调
 */
export const githubCallback = async (req, res) => {
  const fallbackRedirect = `${FRONTEND_BASE_URL}/login?oauth_error=github_failed`
  try {
    const code = String(req.query.code || '')
    const state = String(req.query.state || '')
    if (!code || !state) return res.redirect(fallbackRedirect)

    let redirectPath = '/login'
    try {
      const decoded = verifyStateToken(state)
      redirectPath = String(decoded.redirectPath || '/login')
    } catch {
      return res.redirect(`${FRONTEND_BASE_URL}/login?oauth_error=invalid_state`)
    }

    const accessToken = await exchangeGithubToken(code)
    const githubUser = await fetchGithubProfile(accessToken)

    let user = await getUserByGithubId(githubUser.githubId)
    if (!user) {
      user = await User.findByEmail(githubUser.email)
      if (user) {
        await query(
          `UPDATE users
           SET github_id = $2,
               auth_provider = 'github',
               avatar_url = COALESCE($3, avatar_url),
               email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP),
               last_login_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [user.id, githubUser.githubId, githubUser.avatarUrl]
        )
        user = await User.findById(user.id)
      }
    }

    if (!user) {
      const username = await generateUniqueUsername(githubUser.login)
      user = await createUserWithProvider({
        username,
        email: githubUser.email,
        authProvider: 'github',
        avatarUrl: githubUser.avatarUrl,
        githubId: githubUser.githubId,
      })
    }

    const token = generateToken(user.id)
    const redirectBase = `${FRONTEND_BASE_URL}${redirectPath.startsWith('/') ? redirectPath : '/login'}`
    const redirectUrl = new URL(redirectBase)
    redirectUrl.searchParams.set('oauth', 'github')
    redirectUrl.searchParams.set('token', token)
    return res.redirect(redirectUrl.toString())
  } catch (error) {
    logger.error(`GitHub callback error: ${error.message}`)
    return res.redirect(fallbackRedirect)
  }
}

/**
 * Supabase session -> local JWT
 */
export const exchangeSupabaseSession = async (req, res) => {
  try {
    const accessToken = String(req.body?.accessToken || '').trim()
    if (!accessToken) {
      return res.status(400).json({ success: false, error: 'accessToken is required' })
    }

    const profile = await fetchSupabaseUser(accessToken)
    const email = normalizeEmail(profile.email)
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: 'Supabase user email is invalid' })
    }

    const metadata = profile.user_metadata || {}
    const appMeta = profile.app_metadata || {}
    const providers = Array.isArray(appMeta.providers) ? appMeta.providers : []
    const isGithub = providers.includes('github')
    const githubIdentity = Array.isArray(profile.identities)
      ? profile.identities.find((item) => item.provider === 'github')
      : null
    const githubId = githubIdentity?.id ? String(githubIdentity.id) : null

    let user = null
    if (githubId) {
      user = await getUserByGithubId(githubId)
    }
    if (!user) {
      user = await User.findByEmail(email)
    }

    if (!user) {
      const baseUsername =
        metadata.user_name ||
        metadata.preferred_username ||
        metadata.full_name ||
        email.split('@')[0]
      const username = await generateUniqueUsername(baseUsername)
      user = await createUserWithProvider({
        username,
        email,
        authProvider: isGithub ? 'github' : 'email_code',
        avatarUrl: metadata.avatar_url || metadata.picture || null,
        githubId,
      })
    } else {
      await query(
        `UPDATE users
         SET auth_provider = $2,
             github_id = COALESCE($3, github_id),
             avatar_url = COALESCE($4, avatar_url),
             email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP),
             last_login_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [
          user.id,
          isGithub ? 'github' : 'email_code',
          githubId,
          metadata.avatar_url || metadata.picture || null,
        ]
      )
      user = await User.findById(user.id)
    }

    return respondWithSession(res, user)
  } catch (error) {
    logger.error(`exchangeSupabaseSession error: ${error.message}`)
    return res.status(401).json({ success: false, error: 'Supabase session exchange failed' })
  }
}

/**
 * 获取当前用户信息
 */
export const getCurrentUser = async (req, res) => {
  try {
    const user = req.user
    return res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar || user.avatar_url || null,
        bio: user.bio,
        auth_provider: user.auth_provider || 'password',
        created_at: user.created_at,
      },
    })
  } catch (error) {
    logger.error(`Get current user error: ${error.message}`)
    return res.status(500).json({ success: false, error: 'Failed to get user info' })
  }
}

/**
 * 更新用户信息
 */
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id
    const { username, bio, avatar } = req.body

    if (username && username !== req.user.username) {
      const existingUser = await User.findByUsername(username)
      if (existingUser) {
        return res.status(400).json({ success: false, error: 'Username already exists' })
      }
    }

    const updatedUser = await User.update(userId, { username, bio, avatar })
    return res.json({
      success: true,
      data: buildUserPayload(updatedUser),
    })
  } catch (error) {
    logger.error(`Update profile error: ${error.message}`)
    return res.status(500).json({ success: false, error: 'Failed to update profile' })
  }
}

/**
 * 修改密码
 */
export const changePassword = async (req, res) => {
  try {
    const userId = req.user.id
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required',
      })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters',
      })
    }

    const user = await User.findById(userId)
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash)
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' })
    }

    await User.updatePassword(userId, newPassword)
    await query(`UPDATE users SET auth_provider = 'password' WHERE id = $1`, [userId])
    return res.json({ success: true, message: 'Password changed successfully' })
  } catch (error) {
    logger.error(`Change password error: ${error.message}`)
    return res.status(500).json({ success: false, error: 'Failed to change password' })
  }
}
