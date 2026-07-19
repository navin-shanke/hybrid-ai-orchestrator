export class TopicPattern {
  readonly value: string;

  constructor(pattern: string) {
    const trimmed = pattern.trim();
    if (!trimmed) {
      throw new Error('Topic pattern cannot be empty');
    }
    this.value = trimmed;
  }

  static isValid(pattern: string): boolean {
    try {
      new TopicPattern(pattern);
      return true;
    } catch {
      return false;
    }
  }

  static fromString(pattern: string): TopicPattern {
    return new TopicPattern(pattern);
  }

  matches(eventName: string): boolean {
    return this.matchSegments(this.value.split('.'), eventName.split('.'));
  }

  private matchSegments(patternSegments: string[], eventSegments: string[]): boolean {
    if (patternSegments.length === 1 && patternSegments[0] === '#') {
      return true;
    }

    for (let i = 0; i < patternSegments.length; i++) {
      const patternSegment = patternSegments[i];
      const eventSegment = eventSegments[i];

      if (patternSegment === '#') {
        return true;
      }

      if (patternSegment === '*') {
        if (eventSegment === undefined) {
          return false;
        }
        continue;
      }

      if (eventSegment === undefined) {
        return false;
      }

      if (patternSegment !== eventSegment) {
        return false;
      }
    }

    return patternSegments.length === eventSegments.length;
  }

  equals(other: TopicPattern): boolean {
    if (!(other instanceof TopicPattern)) {
      return false;
    }
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}