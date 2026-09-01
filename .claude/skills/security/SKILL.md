---
name: security
description: Security best practices and validation patterns
---

# Security Skill

## Overview

This skill defines security patterns required for all code in the Zero-Touch Protocol.

## Pre-Commit Security Check

Run before every commit:
```bash
# Check for staged .env files
git status --porcelain | grep "^A.*\.env" && echo "❌ .env staged!" && exit 1

# Check for API keys in diff
git diff --cached | grep -E "(AIzaSy[A-Za-z0-9_-]{33}|sk-[A-Za-z0-9]{32,})" && echo "❌ API key detected!" && exit 1

# Check for hardcoded credentials
git diff --cached | grep -E "(password|secret|api_key)\s*[:=]\s*['\"][^'\"]+['\"]" && echo "❌ Hardcoded credential!" && exit 1

echo "✅ Security check passed"
```

## Environment Variables

### DO:
```typescript
// ✅ Use environment variables
const apiKey = process.env.API_KEY;
if (!apiKey) {
  throw new Error('API_KEY environment variable required');
}
```

### DON'T:
```typescript
// ❌ NEVER hardcode secrets
const apiKey = "sk-abc123...";  // NEVER DO THIS

// ❌ NEVER log secrets
console.log('API Key:', apiKey);  // NEVER DO THIS
```

## Input Validation

### User Input
Always validate and sanitize user input:

```typescript
import { z } from 'zod';

// Define schema
const userInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().positive().max(150)
});

// Validate
function handleUserInput(data: unknown) {
  const result = userInputSchema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(result.error);
  }
  return result.data;
}
```

### API Input
```typescript
// Validate request body
export async function POST(request: Request) {
  const body = await request.json();

  // Validate against schema
  const validated = schema.parse(body);

  // Now safe to use
  return processData(validated);
}
```

## SQL Injection Prevention

### DO:
```typescript
// ✅ Use parameterized queries
const { data } = await supabase
  .from('users')
  .select('*')
  .eq('id', userId);  // Parameterized

// ✅ Use ORM/Query builder
await prisma.user.findUnique({
  where: { id: userId }
});
```

### DON'T:
```typescript
// ❌ NEVER interpolate user input
const query = `SELECT * FROM users WHERE id = '${userId}'`;  // SQL INJECTION!
```

## XSS Prevention

### DO:
```typescript
// ✅ React escapes by default
<div>{userContent}</div>

// ✅ Use sanitization for HTML
import DOMPurify from 'dompurify';
const clean = DOMPurify.sanitize(dirtyHTML);
```

### DON'T:
```typescript
// ❌ NEVER use dangerouslySetInnerHTML with unsanitized content
<div dangerouslySetInnerHTML={{ __html: userInput }} />  // XSS RISK!
```

## Authentication Checks

```typescript
// ✅ Always verify authentication
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Proceed with authenticated user
}

// ✅ Check authorization for resources
const resource = await getResource(id);
if (resource.ownerId !== session.userId) {
  return new Response('Forbidden', { status: 403 });
}
```

## CORS Configuration

```typescript
// ✅ Restrict origins in production
const allowedOrigins = [
  'https://yourdomain.com',
  process.env.NODE_ENV === 'development' && 'http://localhost:3000'
].filter(Boolean);

// ❌ NEVER allow all origins in production
// Access-Control-Allow-Origin: *  // DANGEROUS IN PRODUCTION
```

## Rate Limiting

```typescript
import { Ratelimit } from '@upstash/ratelimit';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s')
});

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for');
  const { success } = await ratelimit.limit(ip);

  if (!success) {
    return new Response('Too Many Requests', { status: 429 });
  }
}
```

## Sensitive Data Handling

### Logging
```typescript
// ❌ NEVER log sensitive data
console.log('User:', { email, password });  // NEVER!

// ✅ Redact sensitive fields
console.log('User:', { email, password: '[REDACTED]' });
```

### Error Messages
```typescript
// ❌ NEVER expose internal errors
catch (error) {
  return new Response(error.message);  // Leaks info!
}

// ✅ Return generic errors
catch (error) {
  console.error('Internal error:', error);  // Log internally
  return new Response('An error occurred', { status: 500 });  // Generic to user
}
```

## Security Headers

```typescript
// next.config.js
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }
];
```

## OWASP Top 10 Checklist

- [ ] Injection (SQL, NoSQL, Command)
- [ ] Broken Authentication
- [ ] Sensitive Data Exposure
- [ ] XML External Entities (XXE)
- [ ] Broken Access Control
- [ ] Security Misconfiguration
- [ ] Cross-Site Scripting (XSS)
- [ ] Insecure Deserialization
- [ ] Using Components with Known Vulnerabilities
- [ ] Insufficient Logging & Monitoring
