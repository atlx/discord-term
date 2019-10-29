import blessed from "blessed";
import Atom from "./atom";
import {defaultState} from "../state/stateConstants";
import UiManager from "./uiManager";

export default class Channels extends Atom<blessed.Widgets.BoxElement> {
    public constructor(manager: UiManager) {
        super(manager, blessed.box({
            top: "0%",
            left: "0%",
            height: "100%",
            width: "25%",
            scrollable: true,
            padding: 1,
            hidden: true,

            style: {
                fg: defaultState.themeData.channels.foregroundColor,
                bg: defaultState.themeData.channels.backgroundColor
            }
        }));
    }

    public init(): void {
        //
    }
}
