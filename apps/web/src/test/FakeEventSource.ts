export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Array<() => void>>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string) {
    this.listeners.get(type)?.forEach((listener) => listener());
  }

  close() {}
}
