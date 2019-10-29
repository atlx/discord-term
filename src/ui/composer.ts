import blessed from "blessed";
import {AtomEvent} from "./atom";
import {defaultState} from "../state/stateConstants";
import UiManager from "./uiManager";
import {updatePreset} from "../constant";
import TextAtom, {TextAtomEvent} from "./textAtom";
import {AppEvent} from "../app";

export enum ComposerEvent {
    FocusChanged = "focusChanged"
}

export default class Composer extends TextAtom<blessed.Widgets.TextboxElement> {
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

        // Abstract theme info. for short access alias.
        const themeData = this.state.get().themeData.input;

        this.updateOn(
            this.app,
            AppEvent.ThemeChanged,
            {
                style: {
                    fg: themeData.foregroundColor,
                    bg: themeData.backgroundColor
                }
            }
        );
    }

    public get text(): string {
        return this.element.getText();
    }

    public setText(text: string): void {
        // Do not continue if provided text is already set.
        if (this.element.getText() === text) {
            return;
        }

        this.element.setText(text);
        this.emit(TextAtomEvent.TextChanged, text);
    }

    public focus(): void {
        this.element.focus();
        this.emit(ComposerEvent.FocusChanged);
    }
}
