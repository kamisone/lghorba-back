import { ipMatchesAny, ipMatchesRule, parseIpRules } from './ip-match.util';

describe('ipMatchesRule', () => {
  it('matches a single address exactly', () => {
    expect(ipMatchesRule('81.20.4.7', '81.20.4.7')).toBe(true);
    expect(ipMatchesRule('81.20.4.8', '81.20.4.7')).toBe(false);
  });

  // Express reports IPv4 peers in this form; a rule typed as plain IPv4 must
  // still match, or an admin's entry silently never fires.
  it('matches through the IPv4-mapped IPv6 form', () => {
    expect(ipMatchesRule('::ffff:81.20.4.7', '81.20.4.7')).toBe(true);
  });

  it('matches inside an IPv4 CIDR block and rejects outside it', () => {
    expect(ipMatchesRule('81.20.4.0', '81.20.4.0/24')).toBe(true);
    expect(ipMatchesRule('81.20.4.255', '81.20.4.0/24')).toBe(true);
    expect(ipMatchesRule('81.20.5.0', '81.20.4.0/24')).toBe(false);
    expect(ipMatchesRule('81.20.3.255', '81.20.4.0/24')).toBe(false);
  });

  it('handles the boundary prefixes', () => {
    // /32 is a single host.
    expect(ipMatchesRule('81.20.4.7', '81.20.4.7/32')).toBe(true);
    expect(ipMatchesRule('81.20.4.8', '81.20.4.7/32')).toBe(false);
    // /0 matches everything — shifting by 32 is a no-op in JS, so this is the
    // case a naive mask gets wrong.
    expect(ipMatchesRule('8.8.8.8', '0.0.0.0/0')).toBe(true);
  });

  it('matches a /16 across its third octet', () => {
    expect(ipMatchesRule('81.20.200.1', '81.20.0.0/16')).toBe(true);
    expect(ipMatchesRule('81.21.0.1', '81.20.0.0/16')).toBe(false);
  });

  it('does not treat a high octet as valid', () => {
    expect(ipMatchesRule('81.20.4.300', '81.20.4.0/24')).toBe(false);
  });

  it('rejects a nonsense prefix rather than matching everything', () => {
    expect(ipMatchesRule('81.20.4.7', '81.20.4.0/33')).toBe(false);
    expect(ipMatchesRule('81.20.4.7', '81.20.4.0/abc')).toBe(false);
  });

  it('matches IPv6 exactly, case-insensitively', () => {
    expect(ipMatchesRule('2A01:E0A::1', '2a01:e0a::1')).toBe(true);
    expect(ipMatchesRule('2a01:e0a::2', '2a01:e0a::1')).toBe(false);
  });
});

describe('ipMatchesAny', () => {
  const rules = ['81.20.4.0/24', '8.8.8.8'];

  it('matches on any rule in the list', () => {
    expect(ipMatchesAny('81.20.4.99', rules)).toBe(true);
    expect(ipMatchesAny('8.8.8.8', rules)).toBe(true);
    expect(ipMatchesAny('1.1.1.1', rules)).toBe(false);
  });

  // The common case by far: no rules configured must never exclude anyone.
  it('excludes nothing when the list is empty or the ip is unknown', () => {
    expect(ipMatchesAny('81.20.4.99', [])).toBe(false);
    expect(ipMatchesAny(null, rules)).toBe(false);
    expect(ipMatchesAny(undefined, rules)).toBe(false);
  });
});

describe('parseIpRules', () => {
  it('accepts newline and comma separated entries, trimming blanks', () => {
    const { rules, invalid } = parseIpRules(' 81.20.4.7 \n\n 8.8.8.8, 81.20.0.0/16 ');
    expect(rules).toEqual(['81.20.4.7', '8.8.8.8', '81.20.0.0/16']);
    expect(invalid).toEqual([]);
  });

  it('drops duplicates', () => {
    expect(parseIpRules('8.8.8.8\n8.8.8.8').rules).toEqual(['8.8.8.8']);
  });

  it('reports unparseable entries instead of silently dropping them', () => {
    const { rules, invalid } = parseIpRules('8.8.8.8\nnot-an-ip\n1.2.3.4/99');
    expect(rules).toEqual(['8.8.8.8']);
    expect(invalid).toEqual(['not-an-ip', '1.2.3.4/99']);
  });
});
