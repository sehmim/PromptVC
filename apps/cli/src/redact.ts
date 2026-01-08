const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]'],
  [/\bsk-[A-Za-z0-9]{20,}\b/g, '[REDACTED_OPENAI_KEY]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, '[REDACTED_SLACK_TOKEN]'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, '[REDACTED_GOOGLE_KEY]'],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '[REDACTED_AWS_ACCESS_KEY]'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]'],
  [/(authorization\s*:\s*bearer)\s+[^\s]+/gi, '$1 [REDACTED]'],
  [/(\b(?:postgres|mysql|mongodb|redis|amqp)s?:\/\/)([^:\s/@]+):([^\s/@]+)@/gi, '$1$2:[REDACTED]@'],
  [/(\b(?:api[_-]?key|secret|password|passwd|token|access[_-]?key|client[_-]?secret|private[_-]?key|auth[_-]?token)\b)(\s*[=:]\s*)(['"]?)([^'"\r\n]+)\3/gi, '$1$2[REDACTED]'],
  [/(\b(?:api[_-]?key|secret|password|passwd|token|access[_-]?key|client[_-]?secret|private[_-]?key|auth[_-]?token)\b)\s+([A-Za-z0-9+/_=-]{8,})/gi, '$1 [REDACTED]'],
  [/(\bssh-(?:rsa|ed25519)\b|\becdsa-[^\s]+)\s+[A-Za-z0-9+/=]{40,}/g, '$1 [REDACTED_SSH_KEY]'],
];

export function redactSensitive(value: string): string {
  if (!value) {
    return value;
  }

  let redacted = value.replace(PRIVATE_KEY_BLOCK, (match) => {
    const lines = match.split('\n');
    if (lines.length >= 2) {
      return `${lines[0]}\n[REDACTED_PRIVATE_KEY]\n${lines[lines.length - 1]}`;
    }
    return '[REDACTED_PRIVATE_KEY]';
  });

  for (const [pattern, replacement] of REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }

  return redacted;
}
