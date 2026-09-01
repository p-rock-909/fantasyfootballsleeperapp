---
name: testing-standards
description: TDD patterns and testing best practices for the codebase
---

# Testing Standards Skill

## Overview

This skill defines testing patterns and requirements for the Zero-Touch Protocol.

## Testing Philosophy

### TDD (Test-Driven Development)
1. **Red:** Write failing test first
2. **Green:** Write minimum code to pass
3. **Refactor:** Clean up while tests pass

### Test Pyramid
```
        /  E2E  \        <- Few, slow, high confidence
       /  Integ  \       <- Some, medium speed
      /   Unit    \      <- Many, fast, isolated
```

## Test File Organization

```
src/
├── components/
│   └── Button/
│       ├── Button.tsx
│       └── Button.test.tsx    # Co-located unit test
├── lib/
│   └── utils/
│       ├── format.ts
│       └── format.test.ts
└── __tests__/                  # Integration tests
    └── api/
        └── auth.test.ts

e2e/
└── tests/                      # End-to-end tests
    └── auth.spec.ts
```

## Unit Test Template

```typescript
import { describe, it, expect, vi } from 'vitest';
import { functionUnderTest } from './module';

describe('functionUnderTest', () => {
  // Group by behavior
  describe('when input is valid', () => {
    it('should return expected output', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe('expected');
    });
  });

  describe('when input is invalid', () => {
    it('should throw error', () => {
      expect(() => functionUnderTest(null)).toThrow();
    });
  });

  // Edge cases
  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(functionUnderTest('')).toBe('');
    });
  });
});
```

## Component Test Template

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByText('Click'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

## API Test Template

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from './route';

describe('API /api/endpoint', () => {
  describe('GET', () => {
    it('returns 200 with data', async () => {
      const { req, res } = createMocks({ method: 'GET' });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData())).toHaveProperty('data');
    });
  });

  describe('POST', () => {
    it('creates resource and returns 201', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: { name: 'test' }
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(201);
    });

    it('returns 400 for invalid body', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {}
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
    });
  });
});
```

## Test Coverage Requirements

| Type | Minimum | Target |
|------|---------|--------|
| Unit | 70% | 85% |
| Branch | 60% | 75% |
| Function | 80% | 90% |

## What to Test

### DO Test:
- Business logic
- Edge cases
- Error handling
- User interactions
- API contracts
- State changes

### DON'T Test:
- Implementation details
- Third-party libraries
- Framework internals
- Trivial getters/setters

## Mocking Guidelines

```typescript
// Mock external dependencies
vi.mock('./api', () => ({
  fetchData: vi.fn().mockResolvedValue({ data: 'test' })
}));

// Mock environment variables
vi.stubEnv('API_URL', 'http://test.com');

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
```

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific file
npm test -- Button.test.tsx

# Run in watch mode
npm test -- --watch
```

## CI/CD Integration

Tests must pass before:
- PR can be merged
- Deployment proceeds
- Visual QA runs
