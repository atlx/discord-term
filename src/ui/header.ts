import blessed from "blessed";
import Atom, {AtomEvent} from "./atom";
import {defaultState} from "../state/stateConstants";
import UiManager from "./uiManager";
import {updatePreset} from "../constant";

export default class Header extends Atom<blessed.Widgets.BoxElement> {
    public constructor(manager: UiManager) {
        super(manager, blessed.box({
            top: "0%",
            left: "0%",
            height: "0%+3",
            padding: 1,
            width: "100%",
            hidden: true,
            tags: true,

            style: {
                fg: defaultState.themeData.header.foregroundColor,
                bg: defaultState.themeData.header.backgroundColor
            }
        }));
    }

    public init(): void {
        // Shrink once channels atom is shown.
        this.updateOn(
            this.manager.atoms.channels,
            AtomEvent.Shown,
            updatePreset.shrink
        );

        // Expand once channels atom is hidden.
        this.updateOn(
            this.manager.atoms.channels,
            AtomEvent.Shown,
            updatePreset.expand
        );
    }
}
