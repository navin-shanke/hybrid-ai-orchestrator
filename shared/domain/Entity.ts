import { UniqueEntityID } from './UniqueEntityID.js';

export abstract class Entity<T extends object> {
  protected readonly _id: UniqueEntityID;
  protected readonly props: T;

  constructor(props: T, id?: UniqueEntityID) {
    this._id = id ?? new UniqueEntityID();
    this.props = Object.freeze({ ...props });
  }

  get id(): UniqueEntityID {
    return this._id;
  }

  equals(other: Entity<T> | null | undefined): boolean {
    if (!other || !(other instanceof Entity)) {
      return false;
    }
    return this._id.equals(other._id);
  }
}