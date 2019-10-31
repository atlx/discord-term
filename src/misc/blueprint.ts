import {Newable} from "./helpers";

export default class Blueprint<TType extends {} = any, TActivable extends Newable = any> {
    public readonly type: TActivable;

    public constructor(type: TActivable) {
        this.type = type;
    }

    public instanceOf(type: any): boolean {
        return type instanceof this.type;
    }

    public is(type: any): boolean {
        return this.type === type;
    }

    /**
     * Activate the blueprint without providing type
     * support of the constructor signature.
     */
    public activate(...args: any[]): TType {
        return new this.type(args);
    }
}
