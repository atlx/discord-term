import Channels from "./ui/channels";
import Composer from "./ui/composer";
import Header from "./ui/header";
import Messages from "./ui/messages";
import Blueprint from "./misc/blueprint";
import BlueprintSet from "./misc/blueprintSet";

export default abstract class Bootstrap {
    public static get uiAtomBlueprints(): BlueprintSet {
        return Bootstrap.blueprintSet(
            Channels,
            Composer,
            Header,
            Messages
        );
    }

    public static blueprintSet(...types: any[]): BlueprintSet {
        const result: Blueprint[] = [];

        for (const type of types) {
            result.push(new Blueprint(type));
        }

        return new BlueprintSet(result);
    }
}
