import blessed from "blessed";
import Atom from "./atom";
import {defaultState} from "../state/stateConstants";
import UiManager from "./uiManager";
import {TextChannel, Channel} from "discord.js";
import {AppEvent} from "../app";

export default class Channels extends Atom<blessed.Widgets.BoxElement> {
    public constructor(manager: UiManager) {
        super(manager, blessed.box({
            top: "0%",
            left: "0%",
            height: "100%",
            width: "25%",
            scrollable: true,
            padding: 1,
            hidden: true,

            style: {
                fg: defaultState.themeData.channels.foregroundColor,
                bg: defaultState.themeData.channels.backgroundColor
            }
        }));
    }

    public init(): void {
        // Abstract theme info. for short access alias.
        const themeData = this.state.get().themeData.channels;

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

    public updateChannelList(): void {
        if (!this.state.get().guild) {
            return;
        }

        // Fixes "ghost" children bug.
        for (let i: number = 0; i < this.element.children.length; i++) {
            this.element.remove(this.element.children[i]);
        }

        const channels: TextChannel[] = this.state.get().guild.channels.array().filter((channel: Channel) => channel.type === "text") as TextChannel[];

        for (let i: number = 0; i < channels.length; i++) {
            let channelName: string = channels[i].name;

            // TODO: Use a constant for the pattern.
            // This fixes UI being messed up due to channel names containing unicode emojis.
            while (/[^a-z0-9-_?]+/gm.test(channelName)) {
                channelName = channelName.replace(/[^a-z0-9-_]+/gm, "?");
            }

            if (channelName.length > 25) {
                channelName = channelName.substring(0, 21) + " ...";
            }

            const channelNode: blessed.Widgets.BoxElement = blessed.box({
                style: {
                    bg: this.state.get().themeData.channels.backgroundColor,
                    fg: this.state.get().themeData.channels.foregroundColor,

                    // TODO: Not working
                    bold: this.state.get().channel !== undefined && this.state.get().channel.id === channels[i].id,

                    hover: {
                        bg: this.state.get().themeData.channels.backgroundColorHover,
                        fg: this.state.get().themeData.channels.foregroundColorHover
                    }
                },

                content: `#${channelName}`,
                width: "100%-2",
                height: "shrink",
                top: i,
                left: "0%",
                clickable: true
            });

            channelNode.on("click", () => {
                if (this.state.get().guild && this.state.get().channel && channels[i].id !== this.state.get().channel.id && this.state.get().guild.channels.has(channels[i].id)) {
                    this.setActiveChannel(channels[i]);
                }
            });

            this.element.append(channelNode);
        }
    }

    public setActiveChannel(channel: TextChannel): void {
        this.app.stopTyping();

        this.state.update({
            channel
        });

        this.manager.updateTitle();
        this.app.message.system(`Switched to channel '{bold}${this.state.get().channel.name}{/bold}'`);
    }
}
