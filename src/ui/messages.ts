import blessed from "blessed";
import Atom, {AtomEvent} from "./atom";
import {defaultState} from "../state/stateConstants";
import {PromiseOr} from "../core/helpers";
import UiManager from "./uiManager";
import {updatePreset} from "../constant";

export default class Messages extends Atom<blessed.Widgets.BoxElement> {
    public constructor(manager: UiManager) {
        super(manager, blessed.box({
            top: "0%",
            left: "0%",
            width: "100%",
            height: "100%-3",
            scrollable: true,
            tags: true,
            padding: 1,

            style: {
                fg: defaultState.themeData.messages.foregroundColor,
                bg: defaultState.themeData.messages.backgroundColor
            }
        }));
    }

    public init(): PromiseOr<void> {
        // Shrink once channels atom is shown.
        this.updateOn(
            this.manager.atoms.channels,
            AtomEvent.Shown,
            updatePreset.shrink
        );

        // Expand once channels atom is hidden.
        this.updateOn(
            this.manager.atoms.channels,
            AtomEvent.Hidden,
            updatePreset.expand
        );
    }
}
