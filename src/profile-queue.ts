export class ProfileQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  async run<T>(profile: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(profile) ?? Promise.resolve();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const tail = previous
      .catch(() => undefined)
      .then(() => gate);

    this.tails.set(profile, tail);

    await previous.catch(() => undefined);

    try {
      return await task();
    } finally {
      release();
      if (this.tails.get(profile) === tail) {
        this.tails.delete(profile);
      }
    }
  }
}
