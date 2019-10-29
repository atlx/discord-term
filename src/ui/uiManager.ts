import blessed from "blessed";
import {EventEmitter} from "events";
import Channels from "./channels";
import Composer from "./composer";
import Header from "./header";
import Messages from "./messages";
import {defaultAppOptions} from "../constant";
import Atom, {AtomEvent} from "./atom";

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

export default class UiManager extends EventEmitter {
    public readonly atoms: IUiAtoms;

    public readonly screen: blessed.Widgets.Screen;

    public readonly allAtoms: Set<Atom>;

    public constructor(atoms: IUiAtoms, screenOptions: any = defaultAppOptions.screenOptions, allAtoms: Set<Atom> = new Set()) {
        super();

        this.screen = new blessed.Widgets.Screen(screenOptions);
        this.atoms = atoms;
        this.allAtoms = allAtoms;

        // Attach built-in atoms.
        this.attachAtoms(
            atoms.channels,
            atoms.composer,
            atoms.header,
            atoms.messages
        );
    }

    // TODO: Add a way to access attached atoms (non-built-in atoms).
    public attachAtoms(...atoms: Atom[]): void {
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
     * Renders all attached atoms.
     */
    public async render(): Promise<void> {
        // Loop through and render all attached atoms.
        for (const atom of this.allAtoms) {
            await atom.render();
        }

        // Emit the corresponding event.
        this.emit(UiManagerEvent.Render);
    }
}
