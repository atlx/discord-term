import blessed from "blessed";
import Atom from "./atom";

export enum TextBasedAtomEvent {
    TextChanged = "textChanged",

    TextCleared = "textCleared"
}

export default abstract class TextBasedAtom<T extends blessed.Widgets.BlessedElement> extends Atom<T> {
    public abstract readonly text: string;

    public abstract setText(text: string): void;

    public appendText(text: string): void {
        this.setText(this.text + text);
    }

    public clearText(): void {
        this.setText("");
        this.emit(TextBasedAtomEvent.TextCleared);
    }
}
