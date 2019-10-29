import blessed from "blessed";
import {EventEmitter} from "events";
import Channels from "./channels";
import Composer from "./composer";
import Header from "./header";
import Messages from "./messages";
import {defaultAppOptions} from "../constant";
import Atom from "./atom";

export interface IUiAtoms {
    readonly channels: Channels;

    readonly composer: Composer;

    readonly header: Header;

    readonly messages: Messages;
}

export default class UiManager extends EventEmitter {
    public readonly atoms: IUiAtoms;

    public readonly screen: blessed.Widgets.Screen;

    public constructor(atoms: IUiAtoms, screenOptions: any = defaultAppOptions.screenOptions) {
        super();

        this.screen = new blessed.Widgets.Screen(screenOptions);
        this.atoms = atoms;

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
            this.screen.append(atom.unwrap());
            this.emit("atomAttach", atom);
        }
    }

    public render(): void {
        this.emit("render");
    }
}
