/**
 * Sensitive-field heuristics on body shapes and header names.
 */

const NAME_RULES = [
  { re: /password|passwd|pwd/i, category: 'password', severity: 'high' },
  { re: /secret|api[_-]?key|private[_-]?key/i, category: 'secret', severity: 'high' },
  { re: /ssn|social[_-]?security/i, category: 'ssn', severity: 'high' },
  { re: /cvv|cvc|card[_-]?number|credit[_-]?card|pan\b/i, category: 'card', severity: 'high' },
  { re: /email|e[_-]?mail/i, category: 'email', severity: 'medium' },
  { re: /phone|mobile|tel\b/i, category: 'phone', severity: 'medium' },
  { re: /token|jwt|access[_-]?token|refresh[_-]?token/i, category: 'token', severity: 'medium' },
  { re: /dob|date[_-]?of[_-]?birth|birth[_-]?date/i, category: 'pii', severity: 'medium' },
  { re: /address|street|zipcode|postal/i, category: 'pii', severity: 'low' },
];

const VALUE_RULES = [
  {
    category: 'email',
    severity: 'medium',
    test: (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  },
  {
    category: 'phone',
    severity: 'medium',
    test: (v) => typeof v === 'string' && /^\+?[\d\s().-]{10,}$/.test(v) && /\d{7,}/.test(v),
  },
  {
    category: 'ssn',
    severity: 'high',
    test: (v) => typeof v === 'string' && /^\d{3}-\d{2}-\d{4}$/.test(v),
  },
  {
    category: 'jwt',
    severity: 'medium',
    test: (v) =>
      typeof v === 'string' &&
      /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(v),
  },
  {
    category: 'card',
    severity: 'high',
    test: (v) => typeof v === 'string' && /^(?:\d[ -]*?){13,19}$/.test(v.replace(/\s/g, '')),
  },
];

/**
 * Walk a body shape and emit signal descriptors.
 * @returns {Array<{ type: string, fieldPath: string, category: string, severity: string }>}
 */
export function detectSensitiveFields(shape, prefix = 'body') {
  const signals = [];
  if (!shape || typeof shape !== 'object') return signals;

  if (shape.type === 'object' && shape.properties) {
    for (const [key, child] of Object.entries(shape.properties)) {
      const path = `${prefix}.${key}`;
      for (const rule of NAME_RULES) {
        if (rule.re.test(key)) {
          signals.push({
            type: 'sensitive_field',
            fieldPath: path,
            category: rule.category,
            severity: rule.severity,
          });
          break;
        }
      }
      if (child?.sample !== undefined) {
        for (const rule of VALUE_RULES) {
          if (rule.test(child.sample)) {
            signals.push({
              type: 'sensitive_field',
              fieldPath: path,
              category: rule.category,
              severity: rule.severity,
            });
            break;
          }
        }
      }
      signals.push(...detectSensitiveFields(child, path));
    }
  }

  if (shape.type === 'array' && Array.isArray(shape.items)) {
    shape.items.forEach((item, i) => {
      signals.push(...detectSensitiveFields(item, `${prefix}[${i}]`));
    });
  }

  return dedupeSignals(signals);
}

export function detectAuthSignals(sample) {
  const signals = [];
  const mode = sample.authObserved || 'none';
  signals.push({
    type: 'auth_observed',
    fieldPath: 'request',
    category: mode,
    severity: mode === 'none' ? 'low' : 'info',
    metadata: { mode },
  });

  const headerNames = sample.request?.headerNames || [];
  if (headerNames.includes('authorization')) {
    signals.push({
      type: 'sensitive_field',
      fieldPath: 'header.authorization',
      category: 'token',
      severity: 'medium',
    });
  }
  if (headerNames.includes('cookie')) {
    signals.push({
      type: 'sensitive_field',
      fieldPath: 'header.cookie',
      category: 'token',
      severity: 'medium',
    });
  }
  return signals;
}

function dedupeSignals(signals) {
  const seen = new Set();
  const out = [];
  for (const s of signals) {
    const key = `${s.type}|${s.fieldPath}|${s.category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
