import blessed from "blessed";
import {EventEmitter} from "events";
import {PromiseOr, LockCallback} from "../misc/helpers";
import UiManager from "./uiManager";
import State from "../state/state";
import App from "../app";

export interface IAtomActivable<T extends blessed.Widgets.BlessedElement = blessed.Widgets.BlessedElement> {
    new(manager: UiManager): IAtom<T>;
}

export interface IAtomUpdateProperties {
    readonly width: string;

    readonly left: string;

    readonly top: string;

    readonly height: string;

    readonly style: any;
}

export enum AtomEvent {
    VisibilityChanged = "visibilityChanged",

    Shown = "shown",

    Hidden = "hidden",

    Destroy = "destroy",

    Render = "render",

    PropertyUpdate = "propertyUpdate",

    LockChanged = "lockChanged"
}

export interface IAtom<T extends blessed.Widgets.BlessedElement = blessed.Widgets.BlessedElement> {
    readonly locked: boolean;

    readonly visible: boolean;

    init(): PromiseOr<void>;

    setVisibility(visible: boolean): void;

    show(): void;

    hide(): void;

    toggleVisibility(): void;

    destroy(): void;

    setLocked(locked: boolean): void;

    lock(): void;

    unlock(): void;

    lockUntil(callback: LockCallback): void;

    render(): PromiseOr<void>;

    unwrap(): T;

    update(properties: Partial<IAtomUpdateProperties>): void;

    updateOn(eventSource: EventEmitter, event: AtomEvent | string, properties: Partial<IAtomUpdateProperties>): void;
}

export default abstract class Atom<T extends blessed.Widgets.BlessedElement = blessed.Widgets.BlessedElement> extends EventEmitter implements IAtom<T> {
    protected readonly element: T;

    protected readonly manager: UiManager;

    protected _locked: boolean;

    public constructor(manager: UiManager, element: T) {
        super();

        this.manager = manager;
        this.element = element;
        this._locked = false;
    }

    public abstract init(): PromiseOr<void>;

    protected get app(): App {
        return this.manager.app;
    }

    protected get state(): State {
        return this.app.state;
    }

    /**
     * Whether the atom is locked and will refuse to render.
     */
    public get locked(): boolean {
        return this._locked;
    }

    public get visible(): boolean {
        return !this.element.hidden;
    }

    public setVisibility(visible: boolean): void {
        if (this.element.visible === visible) {
            // Do not continue if element is already in requested state.
            return;
        }
        else if (visible) {
            this.element.show();
        }
        else {
            this.element.hide();
        }

        // Emit the general visibility change event.
        this.emit(AtomEvent.VisibilityChanged, visible);

        // Emit individual visibility events afterwards (friendlier API).
        if (visible) {
            this.emit(AtomEvent.Shown);
        }
        else {
            this.emit(AtomEvent.Hidden);
        }

        this.render();
    }

    public show(): void {
        this.setVisibility(true);
    }

    public hide(): void {
        this.setVisibility(false);
    }

    public toggleVisibility(): void {
        this.setVisibility(!this.visible);
    }

    public destroy(): void {
        this.element.destroy();
        this.emit(AtomEvent.Destroy);
    }

    public setLocked(locked: boolean): void {
        // Do not continue if state is already set.
        if (this._locked === locked) {
            return;
        }

        this._locked = locked;
        this.emit(AtomEvent.LockChanged, this._locked);
    }

    /**
     * Prevents any further renders from occurring
     * while locked.
     */
    public lock(): void {
        this.setLocked(true);
    }

    /**
     * Releases the lock, allowing renders to occur.
     */
    public unlock(): void {
        this.setLocked(false);
    }

    public async lockUntil(callback: LockCallback): Promise<void> {
        this.lock();
        await callback();
        this.unlock();
    }

    /**
     * Renders the element if the atom is unlocked.
     * It is not recommended to attach event listerns
     * onto the render event.
     */
    public render(): PromiseOr<void> {
        // Do not continue if atom is locked.
        if (this._locked) {
            return;
        }

        this.element.render();
        this.emit(AtomEvent.Render);
    }

    public unwrap(): T {
        return this.element;
    }

    // TODO: Once an element updates, others may react to it and issue their own render() calls. Any way to "cache" this then bulk-execute for performance? Some sort of "lock" system?
    public update(properties: Partial<IAtomUpdateProperties>): void {
        for (const property in properties) {
            this.element[property] = properties[property];
            this.emit(AtomEvent.PropertyUpdate, property, properties[property]);
        }

        // Render after updating properties.
        this.render();
    }

    public updateOn(eventSource: EventEmitter, event: AtomEvent | string, properties: Partial<IAtomUpdateProperties>): void {
        eventSource.on(event, () => {
            this.update(properties);
        });
    }
}
