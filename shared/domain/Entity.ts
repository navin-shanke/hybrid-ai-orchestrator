import { UniqueEntityID } from './UniqueEntityID.js';
import { IdGenerator } from './IdGenerator.js';

export abstract class Entity<T extends object> {
  protected readonly _id: UniqueEntityID;
  protected readonly props: T;

  constructor(props: T, idOrGenerator?: UniqueEntityID | IdGenerator) {
    if (idOrGenerator instanceof UniqueEntityID) {
      this._id = idOrGenerator;
    } else {
      this._id = new UniqueEntityID(undefined, idOrGenerator);
    }
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