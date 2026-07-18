import { Entity } from '../../../shared/domain/Entity';
import { UniqueEntityID } from '../../../shared/domain/UniqueEntityID';

class TestEntity extends Entity<{ name: string }> {
  get name(): string {
    return this.props.name;
  }
}

describe('Entity', () => {
  it('creates an entity with a UniqueEntityID', () => {
    const id = new UniqueEntityID('123');
    const entity = new TestEntity({ name: 'test' }, id);
    expect(entity.id).toBe(id);
    expect(entity.id.toString()).toBe('123');
  });

  it('generates a new ID when none provided', () => {
    const entity = new TestEntity({ name: 'test' });
    expect(entity.id).toBeInstanceOf(UniqueEntityID);
    expect(entity.id.toString().length).toBeGreaterThan(0);
  });

  it('considers entities equal when IDs match', () => {
    const id = new UniqueEntityID('same-id');
    const entity1 = new TestEntity({ name: 'first' }, id);
    const entity2 = new TestEntity({ name: 'second' }, id);
    expect(entity1.equals(entity2)).toBe(true);
  });

  it('considers entities unequal when IDs differ', () => {
    const entity1 = new TestEntity({ name: 'first' }, new UniqueEntityID('1'));
    const entity2 = new TestEntity({ name: 'second' }, new UniqueEntityID('2'));
    expect(entity1.equals(entity2)).toBe(false);
  });

  it('returns false when comparing to null or different type', () => {
    const entity = new TestEntity({ name: 'test' });
    expect(entity.equals(null as any)).toBe(false);
    expect(entity.equals({ id: entity.id } as any)).toBe(false);
  });

  it('does not mutate props', () => {
    const props = { name: 'original' };
    const entity = new TestEntity(props);
    props.name = 'mutated';
    expect(entity.name).toBe('original');
  });
});