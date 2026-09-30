/* Minimal JSON Schema validator (the subset FOXREX schemas use), no dependencies.
   Supports: type, const, enum, required, properties, additionalProperties:false, items,
   minItems, maxItems, minLength, maxLength, pattern, minimum, format:date-time,
   $ref (#/$defs/...), allOf, anyOf, oneOf. Returns an array of "path: message" strings. */
export function validateSchema(schema, data) {
  const root = schema;
  const resolve = ref => ref.replace(/^#\//, '').split('/').reduce((o, k) => o && o[k], root);
  const typeOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
  function check(s, v, p) {
    if (s.$ref) return check(resolve(s.$ref), v, p);
    const E = [];
    if (s.type) {
      const types = [].concat(s.type), t = typeOf(v);
      if (!types.some(x => x === t || (x === 'number' && t === 'integer'))) return [`${p}: expected ${types.join('|')}, got ${t}`];
    }
    if ('const' in s && JSON.stringify(v) !== JSON.stringify(s.const)) E.push(`${p}: must equal ${JSON.stringify(s.const)}`);
    if (s.enum && !s.enum.some(x => JSON.stringify(x) === JSON.stringify(v))) E.push(`${p}: must be one of ${s.enum.join(', ')}`);
    if (typeof v === 'string') {
      if (s.minLength != null && v.length < s.minLength) E.push(`${p}: shorter than ${s.minLength}`);
      if (s.maxLength != null && v.length > s.maxLength) E.push(`${p}: longer than ${s.maxLength}`);
      if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) E.push(`${p}: does not match ${s.pattern}`);
      if (s.format === 'date-time' && isNaN(Date.parse(v))) E.push(`${p}: invalid date-time`);
    }
    if (typeof v === 'number' && s.minimum != null && v < s.minimum) E.push(`${p}: below ${s.minimum}`);
    if (Array.isArray(v)) {
      if (s.minItems != null && v.length < s.minItems) E.push(`${p}: needs at least ${s.minItems} item(s)`);
      if (s.maxItems != null && v.length > s.maxItems) E.push(`${p}: more than ${s.maxItems} items`);
      if (s.items) v.forEach((x, i) => E.push(...check(s.items, x, `${p}[${i}]`)));
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const k of s.required || []) if (!(k in v)) E.push(`${p}: missing required "${k}"`);
      for (const [k, ps] of Object.entries(s.properties || {})) if (k in v) E.push(...check(ps, v[k], `${p}.${k}`));
      if (s.additionalProperties === false) for (const k of Object.keys(v)) if (!(s.properties || {})[k]) E.push(`${p}: unexpected property "${k}"`);
    }
    if (s.allOf) for (const sub of s.allOf) E.push(...check(sub, v, p));
    if (s.anyOf && !s.anyOf.some(sub => !check(sub, v, p).length)) E.push(`${p}: does not match any allowed shape`);
    if (s.oneOf) {
      const results = s.oneOf.map(sub => check(sub, v, p));
      const ok = results.filter(r => !r.length).length;
      if (ok !== 1) {
        if (ok > 1) E.push(`${p}: matches more than one allowed shape`);
        else { const best = results.reduce((a, b) => (b.length < a.length ? b : a)); E.push(...best); }
      }
    }
    return E;
  }
  return check(schema, data, '$');
}
