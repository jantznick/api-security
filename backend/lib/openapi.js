/**
 * Build an OpenAPI 3.0 document from discovered inventory endpoints.
 * Only includes paths present in inventory — never invents routes.
 */

const PARAM_RE = /\{([^}/]+)\}/g;

/**
 * @param {string} pathTemplate
 * @returns {{ name: string, in: 'path', required: true, schema: object }[]}
 */
export function pathParameters(pathTemplate) {
  const seen = new Map();
  const params = [];
  let match;
  const re = new RegExp(PARAM_RE.source, 'g');
  while ((match = re.exec(pathTemplate)) !== null) {
    const base = match[1] || 'param';
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    const name = count === 1 ? base : `${base}${count}`;
    params.push({
      name,
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: `Path parameter from inventory template {${base}}`,
    });
  }
  // If we renamed duplicates, rewrite path for OpenAPI uniqueness
  return params;
}

/**
 * Ensure path param names are unique in the template string for OpenAPI.
 * e.g. /a/{id}/b/{id} → /a/{id}/b/{id2}
 */
export function uniquifyPathTemplate(pathTemplate) {
  const seen = new Map();
  return String(pathTemplate || '/').replace(PARAM_RE, (_, raw) => {
    const base = raw || 'param';
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return `{${count === 1 ? base : `${base}${count}`}}`;
  });
}

function asObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return fallback;
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === 'string' && v.length > 0);
}

function pickJsonContentType(contentTypes) {
  const types = asStringArray(contentTypes);
  const json = types.find((t) => /json/i.test(t));
  return json || 'application/json';
}

function buildSecuritySchemes(endpoints) {
  const modes = new Set();
  for (const ep of endpoints) {
    for (const m of asStringArray(ep.authModes)) modes.add(m);
  }
  const schemes = {};
  if (modes.has('bearer')) {
    schemes.bearerAuth = {
      type: 'http',
      scheme: 'bearer',
      description: 'Observed Bearer token auth on one or more endpoints',
    };
  }
  if (modes.has('cookie')) {
    schemes.cookieAuth = {
      type: 'apiKey',
      in: 'cookie',
      name: 'session',
      description: 'Observed cookie-based auth (cookie name may vary)',
    };
  }
  return schemes;
}

function securityForEndpoint(authModes, schemes) {
  const modes = asStringArray(authModes);
  const out = [];
  if (modes.includes('bearer') && schemes.bearerAuth) {
    out.push({ bearerAuth: [] });
  }
  if (modes.includes('cookie') && schemes.cookieAuth) {
    out.push({ cookieAuth: [] });
  }
  // Explicitly unauthenticated when only "none" was observed
  if (modes.includes('none') && out.length === 0) {
    return [];
  }
  return out.length ? out : undefined;
}

function buildResponses(endpoint, responseContentType) {
  const statusCodes = asObject(endpoint.statusCodes);
  const codes = Object.keys(statusCodes).filter((c) => /^\d{3}$/.test(c));
  const responses = {};

  const schema =
    endpoint.responseSchema && typeof endpoint.responseSchema === 'object'
      ? endpoint.responseSchema
      : null;

  const attachSchema = (status) => {
    const entry = {
      description: `Observed HTTP ${status}`,
    };
    if (schema && status.startsWith('2')) {
      entry.content = {
        [responseContentType]: { schema },
      };
    }
    responses[status] = entry;
  };

  if (codes.length === 0) {
    responses.default = {
      description: 'Observed response',
      ...(schema
        ? { content: { [responseContentType]: { schema } } }
        : {}),
    };
    return responses;
  }

  for (const code of codes.sort()) {
    attachSchema(code);
  }
  return responses;
}

function buildOperation(endpoint, schemes) {
  const method = String(endpoint.method || 'get').toLowerCase();
  const openApiPath = uniquifyPathTemplate(endpoint.pathTemplate);
  const requestContentType = pickJsonContentType(endpoint.contentTypes);
  const responseContentType = pickJsonContentType(endpoint.contentTypes);

  const operation = {
    summary: `${String(endpoint.method || '').toUpperCase()} ${endpoint.pathTemplate}`,
    description: [
      `Discovered by API Glimpse.`,
      endpoint.hitCount != null ? `Hit count: ${endpoint.hitCount}.` : null,
      endpoint.lastSeenAt
        ? `Last seen: ${new Date(endpoint.lastSeenAt).toISOString()}.`
        : null,
    ]
      .filter(Boolean)
      .join(' '),
    parameters: pathParameters(openApiPath),
    responses: buildResponses(endpoint, responseContentType),
  };

  if (endpoint.id) {
    operation.operationId = `ep_${String(endpoint.id).replace(/-/g, '').slice(0, 16)}`;
  }

  const security = securityForEndpoint(endpoint.authModes, schemes);
  if (security !== undefined) {
    operation.security = security;
  }

  const hasBodyMethod = ['post', 'put', 'patch', 'delete'].includes(method);
  if (
    hasBodyMethod &&
    endpoint.requestSchema &&
    typeof endpoint.requestSchema === 'object'
  ) {
    operation.requestBody = {
      required: false,
      content: {
        [requestContentType]: {
          schema: endpoint.requestSchema,
        },
      },
    };
  }

  // Surface auth modes as an extension when useful for tooling
  const authModes = asStringArray(endpoint.authModes);
  if (authModes.length) {
    operation['x-api-glimpse-auth-modes'] = authModes;
  }

  return { openApiPath, method, operation };
}

/**
 * @param {{ project: { id: string, name: string }, endpoints: object[] }} input
 * @returns {object} OpenAPI 3.0 document
 */
export function buildOpenApiDocument({ project, endpoints }) {
  const list = Array.isArray(endpoints) ? endpoints : [];
  const schemes = buildSecuritySchemes(list);
  const paths = {};

  for (const endpoint of list) {
    if (!endpoint?.pathTemplate || !endpoint?.method) continue;
    const { openApiPath, method, operation } = buildOperation(endpoint, schemes);
    if (!paths[openApiPath]) paths[openApiPath] = {};
    // Last write wins if duplicate method+path (should be unique in DB)
    paths[openApiPath][method] = operation;
  }

  const doc = {
    openapi: '3.0.3',
    info: {
      title: project?.name ? `${project.name} API` : 'API Glimpse export',
      version: '1.0.0',
      description:
        'OpenAPI 3.0 document generated from API Glimpse inventory. Paths and schemas reflect observed traffic only.',
    },
    paths,
  };

  if (Object.keys(schemes).length) {
    doc.components = { securitySchemes: schemes };
  }

  if (project?.id) {
    doc['x-api-glimpse-project-id'] = project.id;
  }

  return doc;
}
