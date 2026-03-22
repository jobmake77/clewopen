export const AGENT_SENSITIVE_POLICY = {
  maxFindings: Number.parseInt(String(process.env.AGENT_SENSITIVE_MAX_FINDINGS || '60'), 10),
  maxFileBytes: Number.parseInt(String(process.env.AGENT_SENSITIVE_MAX_FILE_BYTES || `${512 * 1024}`), 10),
  textExtAllowlist: ['.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.ini', '.env', '.csv'],
  highRules: [
    {
      category: 'private_key',
      pattern: '-----BEGIN [A-Z ]*PRIVATE KEY-----',
      flags: 'g',
      message: '检测到私钥内容',
    },
    {
      category: 'api_key',
      pattern: '\\bsk-[A-Za-z0-9]{20,}\\b',
      flags: 'g',
      message: '检测到疑似 API Key',
    },
    {
      category: 'github_token',
      pattern: '\\bgh[pousr]_[A-Za-z0-9]{20,}\\b',
      flags: 'g',
      message: '检测到疑似 GitHub Token',
    },
    {
      category: 'aws_access_key',
      pattern: '\\bAKIA[0-9A-Z]{16}\\b',
      flags: 'g',
      message: '检测到疑似云平台访问密钥',
    },
    {
      category: 'id_card',
      pattern: '\\b\\d{6}(19|20)\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])\\d{3}[0-9Xx]\\b',
      flags: 'g',
      message: '检测到疑似证件号码',
    },
  ],
  mediumRules: [
    {
      category: 'email',
      pattern: '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b',
      flags: 'g',
      message: '检测到邮箱信息',
    },
    {
      category: 'phone',
      pattern: '\\b1[3-9]\\d{9}\\b',
      flags: 'g',
      message: '检测到手机号信息',
    },
    {
      category: 'bank_card',
      pattern: '\\b\\d{16,19}\\b',
      flags: 'g',
      message: '检测到疑似银行卡号',
    },
    {
      category: 'internal_url',
      pattern: '\\bhttps?:\\/\\/[^\\s]*\\b',
      flags: 'gi',
      message: '检测到链接，请确认是否包含内部地址',
    },
    {
      category: 'prompt_injection',
      pattern: '(ignore (all|previous) instructions|system prompt|越狱|绕过限制)',
      flags: 'gi',
      message: '检测到疑似恶意指令内容',
    },
  ],
}
