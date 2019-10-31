import {Newable} from "./helpers";
import Blueprint from "./blueprint";

export default class BlueprintSet<TType extends {} = any, TActivable extends Newable = any> {
    public readonly items: Blueprint<TType, TActivable>[];

    public constructor(items: Blueprint<TType, TActivable>[]) {
        this.items = items;
    }

    public instanceOf(other: any): boolean {
        for (const item of this.items) {
            if (!item.instanceOf(other)) {
                return false;
            }
        }

        return true;
    }
}
