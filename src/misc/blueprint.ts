import {Newable} from "./helpers";

export default class Blueprint<T extends Newable = any> {
    protected readonly type: any;

    public constructor(type: any) {
        this.type = type;
    }

    public instanceOf(other: any): boolean {
        return other instanceof this.type;
    }

    public is(other: any): boolean {
        return this.type === other;
    }

    public activate(...args: any[]): T {
        return new this.type(args);
    }
}
