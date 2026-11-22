import { canonicalJson } from './canonical-json';

describe('canonicalJson', () => {
  it('orders object keys at every depth and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: [{ d: true, c: null }, 'x'] })).toBe(
      '{"a":[{"c":null,"d":true},"x"],"b":1}',
    );
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it('omits undefined fields and escapes strings like JSON', () => {
    expect(canonicalJson({ a: undefined, 'quote"': 'line\n' })).toBe('{"quote\\"":"line\\n"}');
    expect(canonicalJson([undefined])).toBe('[null]');
  });
});
