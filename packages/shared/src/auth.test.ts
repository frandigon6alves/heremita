import { describe, expect, it } from 'vitest';
import { emailSchema, logInBodySchema, passwordSchema, signUpBodySchema } from './auth.js';

const validSignUp = {
  email: 'viajante@example.com',
  password: 'correct horse battery',
  displayName: 'Viajante',
  locale: 'pt-BR',
};

describe('emailSchema', () => {
  it('trims_and_lowercases_before_validating', () => {
    expect(emailSchema.parse(' A@b.com')).toBe('a@b.com');
  });

  it('rejects_an_address_without_domain', () => {
    expect(emailSchema.safeParse('a@').success).toBe(false);
  });

  it('accepts_254_characters_and_rejects_255', () => {
    const address = (firstLabel: number) =>
      `${'a'.repeat(64)}@${'b'.repeat(firstLabel)}.${'c'.repeat(61)}.${'d'.repeat(61)}.com`;

    expect(address(61)).toHaveLength(254);
    expect(emailSchema.safeParse(address(61)).success).toBe(true);
    expect(emailSchema.safeParse(address(62)).success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts_12_to_128_characters', () => {
    expect(passwordSchema.safeParse('a'.repeat(12)).success).toBe(true);
    expect(passwordSchema.safeParse('a'.repeat(128)).success).toBe(true);
  });

  it('rejects_11_and_129_characters', () => {
    expect(passwordSchema.safeParse('a'.repeat(11)).success).toBe(false);
    expect(passwordSchema.safeParse('a'.repeat(129)).success).toBe(false);
  });
});

describe('signUpBodySchema', () => {
  it('accepts_a_valid_sign_up_and_normalises_the_email', () => {
    const result = signUpBodySchema.parse({ ...validSignUp, email: ' Viajante@Example.com ' });

    expect(result.email).toBe('viajante@example.com');
  });

  it('rejects_a_password_equal_to_the_email', () => {
    const result = signUpBodySchema.safeParse({
      ...validSignUp,
      email: 'long.address@example.com',
      password: 'Long.Address@example.com',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['password']]);
  });

  it('rejects_a_password_equal_to_the_email_local_part', () => {
    const result = signUpBodySchema.safeParse({
      ...validSignUp,
      email: 'averylongname@example.com',
      password: 'averylongname',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['password']]);
  });

  it('cleans_the_display_name', () => {
    const result = signUpBodySchema.parse({ ...validSignUp, displayName: ' ‮Ana ' });

    expect(result.displayName).toBe('Ana');
  });

  it('rejects_a_blank_display_name', () => {
    expect(signUpBodySchema.safeParse({ ...validSignUp, displayName: ' \u0000 ' }).success).toBe(
      false,
    );
  });
});

describe('logInBodySchema', () => {
  it('accepts_any_non_empty_password', () => {
    expect(logInBodySchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });
});
