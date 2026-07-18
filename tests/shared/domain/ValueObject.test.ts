import { ValueObject } from '../../../shared/domain/ValueObject';

class Address extends ValueObject<{ street: string; city: string; zip: string }> {
  get street(): string { return this.props.street; }
  get city(): string { return this.props.city; }
  get zip(): string { return this.props.zip; }
}

describe('ValueObject', () => {
  it('considers two value objects equal when all props match', () => {
    const addr1 = new Address({ street: '123 Main St', city: 'NYC', zip: '10001' });
    const addr2 = new Address({ street: '123 Main St', city: 'NYC', zip: '10001' });
    expect(addr1.equals(addr2)).toBe(true);
  });

  it('considers value objects unequal when any prop differs', () => {
    const addr1 = new Address({ street: '123 Main St', city: 'NYC', zip: '10001' });
    const addr2 = new Address({ street: '456 Oak Ave', city: 'NYC', zip: '10001' });
    expect(addr1.equals(addr2)).toBe(false);
  });

  it('returns false for null or undefined', () => {
    const addr = new Address({ street: '123 Main St', city: 'NYC', zip: '10001' });
    expect(addr.equals(null as any)).toBe(false);
    expect(addr.equals(undefined as any)).toBe(false);
  });

  it('returns false for different class', () => {
    const addr = new Address({ street: '123 Main St', city: 'NYC', zip: '10001' });
    expect(addr.equals({ street: '123 Main St', city: 'NYC', zip: '10001' } as any)).toBe(false);
  });

  it('handles nested value objects in equality', () => {
    class Person extends ValueObject<{ name: string; address: Address }> {
      get name(): string { return this.props.name; }
      get address(): Address { return this.props.address; }
    }
    const person1 = new Person({ name: 'John', address: new Address({ street: '123 Main', city: 'NYC', zip: '10001' }) });
    const person2 = new Person({ name: 'John', address: new Address({ street: '123 Main', city: 'NYC', zip: '10001' }) });
    expect(person1.equals(person2)).toBe(true);
  });

  it('freezes props to prevent mutation', () => {
    const props = { street: '123 Main', city: 'NYC', zip: '10001' };
    const addr = new Address(props);
    props.street = 'mutated';
    expect(addr.street).toBe('123 Main');
  });
});