import { base32Decode, base32Encode, decryptSecret, encryptSecret, hashRecoveryCode, hotp, newRecoveryCodes, newSecret, otpauthUrl, totp, verifyTotp } from './totp.js';
import { adminCan, asRole, keepsAnOwner } from '../admin/roles.js';

// RFC 6238 test secret ("12345678901234567890", SHA-1)
const KEY = Buffer.from('12345678901234567890', 'ascii');

describe('two-step sign-in (TOTP)', () => {
  it('matches the RFC 4226 / RFC 6238 test vectors', () => {
    expect(hotp(KEY, 0)).toBe('755224');
    expect(hotp(KEY, 1)).toBe('287082');
    expect(hotp(KEY, 9)).toBe('520489');
    expect(totp(KEY, 59_000, 8)).toBe('94287082');
    expect(totp(KEY, 1_111_111_109_000, 8)).toBe('07081804');
    expect(totp(KEY, 2_000_000_000_000, 8)).toBe('69279037');
  });

  it('round-trips base32 secrets', () => {
    expect(base32Encode(KEY)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('gezd gnbv-gy3tqojq gezdgnbvgy3tqojq').equals(KEY)).toBe(true);
    const s = newSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(s).length).toBe(20);
  });

  it('accepts the current code and one step of clock drift only', () => {
    const now = 1_700_000_000_000;
    const code = totp(KEY, now);
    expect(verifyTotp(KEY, code, now)).toBe(true);
    expect(verifyTotp(KEY, ` ${code.slice(0, 3)} ${code.slice(3)} `, now)).toBe(true);
    expect(verifyTotp(KEY, totp(KEY, now - 30_000), now)).toBe(true);
    expect(verifyTotp(KEY, totp(KEY, now + 30_000), now)).toBe(true);
    expect(verifyTotp(KEY, totp(KEY, now - 90_000), now)).toBe(false);
    expect(verifyTotp(KEY, '12345', now)).toBe(false);
    expect(verifyTotp(KEY, '', now)).toBe(false);
  });

  it('builds the authenticator link', () => {
    expect(otpauthUrl('AqarTech', 'a@b.om', 'ABC')).toBe('otpauth://totp/AqarTech%3Aa%40b.om?secret=ABC&issuer=AqarTech&algorithm=SHA1&digits=6&period=30');
  });

  it('makes one-time recovery codes and hashes them loosely', () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const c of codes) expect(c).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    expect(hashRecoveryCode('abcde-fghij')).toBe(hashRecoveryCode('ABCDEFGHIJ'));
  });

  it('keeps the secret encrypted at rest', () => {
    const stored = encryptSecret('GEZDGNBV', 'key-material');
    expect(stored).not.toContain('GEZDGNBV');
    expect(decryptSecret(stored, 'key-material')).toBe('GEZDGNBV');
    expect(() => decryptSecret(stored, 'other-key')).toThrow();
  });
});

describe('platform team roles', () => {
  it('lets owners do everything, managers all but the team', () => {
    expect(adminCan('OWNER', 'POST', '/admin/team')).toBe(true);
    expect(adminCan('MANAGER', 'GET', '/admin/team')).toBe(false);
    expect(adminCan('MANAGER', 'PATCH', '/admin/fields/x')).toBe(true);
    expect(adminCan('SUPPORT', 'GET', '/admin/team/')).toBe(false);
  });

  it('keeps support read-only except subscribers and their own security', () => {
    expect(adminCan('SUPPORT', 'GET', '/admin/plans')).toBe(true);
    expect(adminCan('SUPPORT', 'POST', '/admin/plans')).toBe(false);
    expect(adminCan('SUPPORT', 'DELETE', '/admin/custom-sections/1')).toBe(false);
    expect(adminCan('SUPPORT', 'PATCH', '/admin/companies/1/subscription')).toBe(true);
    expect(adminCan('SUPPORT', 'POST', '/admin/auth/2fa/setup')).toBe(true);
    expect(adminCan('SUPPORT', 'POST', '/admin/companiesX')).toBe(false);
  });

  it('treats unknown roles as the most limited one', () => {
    expect(asRole('OWNER')).toBe('OWNER');
    expect(asRole('ROOT')).toBe('SUPPORT');
    expect(asRole(undefined)).toBe('SUPPORT');
  });

  it('never leaves the team without an active owner', () => {
    const team = [
      { id: 'a', role: 'OWNER', isActive: true },
      { id: 'b', role: 'MANAGER', isActive: true },
    ];
    expect(keepsAnOwner(team, { id: 'a', role: 'MANAGER' })).toBe(false);
    expect(keepsAnOwner(team, { id: 'a', isActive: false })).toBe(false);
    expect(keepsAnOwner(team, { id: 'b', role: 'OWNER' })).toBe(true);
    expect(keepsAnOwner([...team, { id: 'c', role: 'OWNER', isActive: true }], { id: 'a', isActive: false })).toBe(true);
  });
});
