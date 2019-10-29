import blessed from "blessed";
import Atom, {AtomEvent} from "./atom";
import {defaultState} from "../state/stateConstants";
import UiManager from "./uiManager";
import {updatePreset} from "../constant";

export default class Composer extends Atom<blessed.Widgets.TextboxElement> {
    public constructor(manager: UiManager) {
        super(manager, blessed.textbox({
            left: "0%",
            bottom: "0",
            width: "100%",
            inputOnFocus: true,
            height: "shrink",
            padding: 1,

            style: {
                fg: defaultState.themeData.input.foregroundColor,
                bg: defaultState.themeData.input.backgroundColor
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
            AtomEvent.Hidden,
            updatePreset.expand
        );
    }

    public get text(): string {
        return this.element.getText();
    }

    public setText(text: string): void {
        this.element.setText(text);
        this.emit("textChanged", text);
    }
}
