import { createOriginValidator } from './cors';

describe('createOriginValidator', () => {
  it('allows any origin in development', () => {
    const validator = createOriginValidator([], 'development');
    expect(validator('https://evil.com')).toBe(true);
    expect(validator(undefined)).toBe(true);
  });

  it('allows when origin is in allowlist', () => {
    const validator = createOriginValidator(
      ['https://app.example.com'],
      'production'
    );
    expect(validator('https://app.example.com')).toBe(true);
  });

  it('denies when allowlist empty in production', () => {
    const validator = createOriginValidator([], 'production');
    expect(validator('https://app.example.com')).toBe(false);
  });

  it('allows requests without origin (server-to-server)', () => {
    const validator = createOriginValidator([], 'production');
    expect(validator(undefined)).toBe(true);
  });
});
