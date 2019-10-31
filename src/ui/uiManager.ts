import blessed from "blessed";
import {EventEmitter} from "events";
import Channels from "./channels";
import Composer from "./composer";
import Header from "./header";
import Messages from "./messages";
import {defaultAppOptions} from "../constant";
import Atom, {IAtomActivable, IAtom} from "./atom";
import App from "../app";
import BlueprintSet from "../misc/blueprintSet";

export enum UiManagerEvent {
    AtomAttached = "atomAttached",

    Render = "render",

    WindowTitleChanged = "windowTitleChanged"
}

export interface IUiAtoms {
    readonly channels: Channels;

    readonly composer: Composer;

    readonly header: Header;

    readonly messages: Messages;
}

export interface IUiManagerPartialOptions {
    readonly screenOptions?: any;

    readonly allAtoms?: Set<IAtom>;
}

export interface IUiManagerOptions extends IUiManagerPartialOptions {
    readonly app: App;

    readonly atomBlueprints: BlueprintSet<IAtom, IAtomActivable>;
}

export default class UiManager extends EventEmitter {
    public static get defaultOptions(): Required<IUiManagerPartialOptions> {
        return {
            screenOptions: defaultAppOptions.screenOptions,
            allAtoms: new Set()
        };
    }

    public readonly atoms: IUiAtoms;

    public readonly screen: blessed.Widgets.Screen;

    public readonly allAtoms: Set<IAtom>;

    public readonly app: App;

    protected readonly options: Required<IUiManagerOptions>;

    public constructor(options: IUiManagerOptions) {
        super();

        this.options = {
            ...UiManager.defaultOptions,
            ...options
        };

        // Verify atom blueprints.
        if (!this.options.atomBlueprints.instanceOf(Atom)) {
            throw new Error("Expected atom blueprints' types to inherit from the base Atom class");
        }

        this.app = this.options.app;
        this.screen = new blessed.Widgets.Screen(this.options.screenOptions);
        this.allAtoms = this.options.allAtoms;

        // Activate & attach provided atom blueprint(s).
        for (const atomBlueprint of this.options.atomBlueprints.items) {
            const atom: IAtom = new atomBlueprint.type(this);

            // Attach newly created atom instance.
            this.attachAtoms(atom);
        }
    }

    public updateTitle(): void {
        if (this.app.state.get().guild && this.app.state.get().channel) {
            this.app.ui.setWindowTitle(`Discord Terminal @ ${this.app.state.get().guild.name} # ${this.app.state.get().channel.name}`);
        }
        else if (this.app.state.get().guild) {
            this.app.ui.setWindowTitle(`Discord Terminal @ ${this.app.state.get().guild.name}`);
        }
        else {
            this.app.ui.setWindowTitle("Discord Terminal");
        }
    }

    /**
     * Initialize all attached atoms.
     */
    public async init(): Promise<void> {
        // Loop through and initialize all attached atoms.
        for (const atom of this.allAtoms) {
            await atom.init();
        }
    }

    // TODO: Add a way to access attached atoms (non-built-in atoms).
    public attachAtoms(...atoms: IAtom[]): void {
        for (const atom of atoms) {
            // Atom must not be currently attached.
            if (!this.allAtoms.has(atom)) {
                // Track atom.
                this.allAtoms.add(atom);

                // Append atom to the Blessed Screen's node list.
                this.screen.append(atom.unwrap());

                // And finally emit the corresponding event.
                this.emit(UiManagerEvent.AtomAttached, atom);
            }
        }
    }

    public setWindowTitle(title: string): void {
        this.screen.title = title;
        this.emit(UiManagerEvent.WindowTitleChanged);
    }

    /**
     * Renders all child elements of the screen
     * element.
     */
    public async render(hard: boolean = false): Promise<void> {
        if (hard) {
            this.screen.realloc();
        }
        else {
            this.screen.render();
        }

        // Emit the corresponding event.
        this.emit(UiManagerEvent.Render);
    }
}
