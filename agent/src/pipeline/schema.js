/**
 * Infer a JSON-Schema-ish fragment from a body *shape* sample
 * (produced by packages/shared shapeBody).
 */

export function inferSchemaFromShape(shape) {
  if (!shape || typeof shape !== 'object') return null;

  if (shape.type === 'truncated' || shape.type === 'undefined') {
    return { type: 'null' };
  }

  if (shape.type === 'string' || shape.type === 'integer' || shape.type === 'number' || shape.type === 'boolean' || shape.type === 'null') {
    return { type: shape.type };
  }

  if (shape.type === 'array') {
    const itemSchemas = (shape.items || [])
      .map(inferSchemaFromShape)
      .filter(Boolean);
    return {
      type: 'array',
      items: itemSchemas.length ? mergeSchemas(itemSchemas) : {},
    };
  }

  if (shape.type === 'object') {
    const properties = {};
    const required = [];
    for (const [key, child] of Object.entries(shape.properties || {})) {
      const childSchema = inferSchemaFromShape(child);
      if (childSchema) {
        properties[key] = childSchema;
        required.push(key);
      }
    }
    return {
      type: 'object',
      properties,
      required,
      additionalProperties: true,
    };
  }

  return { type: 'unknown' };
}

/**
 * Merge multiple schemas into one that converges (union types, optional fields).
 * Caps property fan-out to avoid unbounded growth.
 */
const MAX_PROPERTIES = 80;

export function mergeSchemas(schemas) {
  const list = (Array.isArray(schemas) ? schemas : [schemas]).filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1) return structuredClone(list[0]);

  let acc = structuredClone(list[0]);
  for (let i = 1; i < list.length; i += 1) {
    acc = mergeTwo(acc, list[i]);
  }
  return acc;
}

function typeSet(schema) {
  if (!schema) return new Set();
  if (Array.isArray(schema.type)) return new Set(schema.type);
  if (schema.type) return new Set([schema.type]);
  return new Set();
}

function mergeTwo(a, b) {
  if (!a) return structuredClone(b);
  if (!b) return structuredClone(a);

  const types = new Set([...typeSet(a), ...typeSet(b)]);

  // Prefer object merge when both are objects
  if (types.has('object') && a.type === 'object' && b.type === 'object') {
    const props = { ...(a.properties || {}) };
    const aKeys = new Set(Object.keys(a.properties || {}));
    const bKeys = new Set(Object.keys(b.properties || {}));
    const allKeys = new Set([...aKeys, ...bKeys]);

    for (const key of allKeys) {
      if (Object.keys(props).length >= MAX_PROPERTIES && !props[key]) {
        continue;
      }
      if (a.properties?.[key] && b.properties?.[key]) {
        props[key] = mergeTwo(a.properties[key], b.properties[key]);
      } else if (a.properties?.[key]) {
        props[key] = structuredClone(a.properties[key]);
      } else {
        props[key] = structuredClone(b.properties[key]);
      }
    }

    // Required = intersection of previous required sets (fields always present)
    const aReq = new Set(a.required || []);
    const bReq = new Set(b.required || []);
    const required = [...aReq].filter((k) => bReq.has(k) && props[k]);

    return {
      type: 'object',
      properties: props,
      required,
      additionalProperties: true,
    };
  }

  if (types.has('array') && (a.type === 'array' || b.type === 'array')) {
    const items = mergeTwo(
      a.type === 'array' ? a.items : null,
      b.type === 'array' ? b.items : null,
    );
    return { type: 'array', items: items || {} };
  }

  // Scalar / mixed → union
  const typeArr = [...types].filter((t) => t !== 'unknown');
  if (typeArr.length === 1) {
    return { type: typeArr[0] };
  }
  if (typeArr.length > 1) {
    return { type: typeArr.sort() };
  }
  return { type: 'unknown' };
}
