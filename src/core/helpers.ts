export type PromiseOr<T> = Promise<T> | T;

export type LockCallback = () => PromiseOr<void>;
