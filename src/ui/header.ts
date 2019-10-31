import blessed from "blessed";
import {AtomEvent} from "./atom";
import {defaultState} from "../state/stateConstants";
import UiManager from "./uiManager";
import {updatePreset} from "../constant";
import TextBasedAtom from "./textAtom";
import {AppEvent} from "../app";

export default class Header extends TextBasedAtom<blessed.Widgets.BoxElement> {
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

        // Abstract theme info. for short access alias.
        const themeData = this.state.get().themeData.header;

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
        return this.element.content;
    }

    public setText(text: string): void {
        this.element.content = text;
        this.render();
    }

    public display(text: string, autoHide: boolean = false): void {
        if (!text) {
            throw new Error("Text cannot be empty or null");
        }

        this.setText(`[!] ${text}`);

        if (autoHide) {
            if (this.state.get().autoHideHeaderTimeout) {
                clearTimeout(this.state.get().autoHideHeaderTimeout);
            }

            this.state.update({
                autoHideHeaderTimeout: setTimeout(
                    () => this.hide(),
                    text.length * this.app.options.headerAutoHideTimeoutPerChar
                )
            });
        }

        this.show();
    }
}
