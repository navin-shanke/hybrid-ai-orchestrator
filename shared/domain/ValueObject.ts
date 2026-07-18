export abstract class ValueObject<T extends object> {
  protected readonly props: T;

  constructor(props: T) {
    this.props = Object.freeze({ ...props });
  }

  equals(other: ValueObject<T> | null | undefined): boolean {
    if (!other || !(other instanceof ValueObject)) {
      return false;
    }
    return this.shallowEqual(this.props, other.props);
  }

  private shallowEqual(obj1: object, obj2: object): boolean {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) return false;
    for (const key of keys1) {
      const val1 = (obj1 as Record<string, unknown>)[key];
      const val2 = (obj2 as Record<string, unknown>)[key];
      if (val1 instanceof ValueObject && val2 instanceof ValueObject) {
        if (!val1.equals(val2)) return false;
      } else if (val1 !== val2) {
        return false;
      }
    }
    return true;
  }
}