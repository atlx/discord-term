import blessed from "blessed";
import Atom from "./atom";

export enum TextAtomEvent {
    TextChanged = "textChanged",

    TextCleared = "textCleared"
}

export default abstract class TextAtom<T extends blessed.Widgets.BlessedElement> extends Atom<T> {
    public abstract readonly text: string;

    public abstract setText(text: string): void;

    public appendText(text: string): void {
        this.setText(this.text + text);
    }

    public clearText(): void {
        this.setText("");
        this.emit(TextAtomEvent.TextCleared);
    }
}
