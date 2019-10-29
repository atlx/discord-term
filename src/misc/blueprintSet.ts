import {Newable} from "./helpers";
import Blueprint from "./blueprint";

export default class BlueprintSet<T extends Newable = any> {
    public readonly items: Blueprint<T>[];

    public constructor(items: Blueprint<T>[]) {
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
