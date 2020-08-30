import {TextChannel, Guild, Client, Message, Channel, DMChannel, ClientOptions, GuildChannel} from "discord.js";
import Utils from "./utils";
import blessed, {Widgets} from "blessed";
import chalk from "chalk";
import fs from "fs";
import clipboardy from "clipboardy";
import path from "path";
import Encryption from "./encryption";
import {defaultAppOptions} from "./constant";
import Pattern from "./pattern";
import setupEvents from "./events";
import setupInternalCommands from "./commands/internal";
import {EventEmitter} from "events";
import State, {IState, IStateOptions} from "./state/state";
import {defaultState} from "./state/stateConstants";
import MessageFactory from "./core/messageFactory";
import Tags from "./tags";

export type IAppNodes = {
    readonly messages: Widgets.BoxElement;

    readonly channels: Widgets.BoxElement;

    readonly input: Widgets.TextboxElement;

    readonly header: Widgets.BoxElement;
}

export interface IAppOptions extends IStateOptions {
    readonly maxMessages: number;

    readonly screen: Widgets.Screen

    readonly nodes: IAppNodes;

    readonly commandPrefix: string;

    readonly headerAutoHideTimeoutPerChar: number;

    readonly initialState: Partial<IState>;

    readonly clientOptions: ClientOptions;

    readonly pluginsPath: string;
}

export enum SpecialSenders {
    System = "System"
}

export type ICommandHandler = (args: string[], app: App) => void;

export default class App extends EventEmitter {
    /**
     * Instance options for the application.
     */
    public readonly options: IAppOptions;

    /**
     * The Discord client class instance.
     */
    public readonly client: Client;

    /**
     * Registered commands usable by the client.
     */
    public readonly commands: Map<string, ICommandHandler>;

    public readonly state: State;

    public readonly message: MessageFactory;

    public readonly tags: Tags;

    public constructor(options?: Partial<IAppOptions>, commands: Map<string, ICommandHandler> = new Map()) {
        super();

        this.options = {
            ...defaultAppOptions,
            ...options
        };

        this.state = new State(this, this.options, this.options.initialState);
        this.client = new Client(this.options.clientOptions);
        this.commands = commands;
        this.message = new MessageFactory(this);
        this.tags = new Tags(this.state);
    }

    public async setup(init: boolean = true): Promise<this> {
        // Discord events.
        this.client.on("ready", () => {
            this.hideHeader();

            this.state.update({
                token: this.client.token
            });

            this.message.system(`Successfully connected as {bold}${this.client.user.tag}{/bold}`);

            const firstGuild: Guild = this.client.guilds.cache.first();

            if (firstGuild) {
                this.setActiveGuild(firstGuild);
            }

            this.showChannels();
            this.state.saveSync();
        });

        this.client.on("message", this.handleMessage.bind(this));
        this.client.on("messageUpdate", this.handleMessage.bind(this));

        this.client.on("error", (error: Error) => {
            this.message.system(`An error occurred within the client: ${error.message}`);
        });

        this.client.on("guildCreate", (guild: Guild) => {
            this.message.system(`Joined guild '{bold}${guild.name}{/bold}' (${guild.memberCount} members)`);
        });

        this.client.on("guildDelete", (guild: Guild) => {
            this.message.system(`Left guild '{bold}${guild.name}{/bold}' (${guild.memberCount} members)`);
        });

        // Append nodes.
        this.options.screen.append(this.options.nodes.input);
        this.options.screen.append(this.options.nodes.messages);
        this.options.screen.append(this.options.nodes.channels);
        this.options.screen.append(this.options.nodes.header);

        // Sync state.
        await this.state.sync();

        // Load & apply saved theme.
        this.loadTheme(this.state.get().theme);

        if (init) {
            this.init();
        }

        return this;
    }

    private handleMessage(msg: Message): void {
        if (msg.author.id === this.client.user.id) {
            this.state.update({
                lastMessage: msg
            });
        }

        if (this.state.get().ignoredUsers.includes(msg.author.id)) {
            return;
        }
        else if (this.state.get().trackList.includes(msg.author.id)) {
            this.message.special("Track", msg.author.tag, msg.content);

            return;
        }
        else if (this.state.get().ignoreBots && msg.author.bot && msg.author.id !== this.client.user.id) {
            return;
        }
        else if (this.state.get().ignoreEmptyMessages && !msg.content) {
            return;
        }

        let content: string = msg.cleanContent;

        if (content.startsWith("$dt_")) {
            try {
                content = Encryption.decrypt(content.substr(4), this.state.get().decriptionKey);
            }
            catch (error) {
                // Don't show the error.
                //this.appendSystemMessage(`Could not decrypt message: ${error.message}`);
            }
        }

        if (msg.author.id === this.client.user.id) {
            if (msg.channel.type === "text") {
                this.message.self(this.client.user.tag, content);
            }
            else if (msg.channel.type === "dm") {
                this.message.special(`${chalk.green("=>")} DM`, (msg.channel as DMChannel).recipient.tag, content, "blue");
            }
        }
        else if (this.state.get().guild && this.state.get().channel && msg.channel.id === this.state.get().channel.id) {
            // TODO: Turn this into a function
            const modifiers: string[] = [];

            if (msg.guild && msg.member) {
                if (msg.member.hasPermission("MANAGE_MESSAGES")) {
                    modifiers.push(chalk.red("+"));
                }

                if (msg.author.bot) {
                    modifiers.push(chalk.blue("&"));
                }
                if (msg.member.hasPermission("MANAGE_GUILD")) {
                    modifiers.push(chalk.green("$"));
                }
            }

            this.message.user(msg.author.tag, content, modifiers);
        }
        else if (msg.channel.type === "dm") {
            this.message.special(`${chalk.green("<=")} DM`, msg.author.tag, content, "blue");
        }
        else if (this.state.get().globalMessages) {
            this.message.special("Global", msg.author.tag, content);
        }
    }

    public showChannels(): this {
        if (this.options.nodes.channels.hidden) {
            // Messages.
            this.options.nodes.messages.width = "75%+2";
            this.options.nodes.messages.left = "25%";

            // Input.
            this.options.nodes.input.width = "75%+2";
            this.options.nodes.input.left = "25%";

            // Header.
            this.options.nodes.header.width = "75%+2";
            this.options.nodes.header.left = "25%";

            this.options.nodes.channels.show();
            this.render();
        }

        return this;
    }

    public hideChannels(): this {
        if (!this.options.nodes.channels.hidden) {
            // Messages.
            this.options.nodes.messages.width = "100%";
            this.options.nodes.messages.left = "0%";

            // Input.
            this.options.nodes.input.width = "100%";
            this.options.nodes.input.left = "0%";

            // Header.
            this.options.nodes.header.width = "100%";
            this.options.nodes.header.left = "0%";

            this.options.nodes.channels.hide();
            this.render();
        }

        return this;
    }

    public toggleChannels(): this {
        this.options.nodes.channels.visible ? this.hideChannels() : this.showChannels();

        return this;
    }

    private setupEvents(): this {
        setupEvents(this);

        return this;
    }

    /**
     * Show the client as typing in the currently
     * active channel.
     */
    public startTyping(): this {
        if (!this.state.get().muted && this.state.get().guild && this.state.get().channel && this.state.get().typingTimeout === undefined) {
            this.state.get().channel.startTyping();

            this.state.update({
                typingTimeout: setTimeout(() => {
                    this.stopTyping();
                }, 10000)
            });
        }

        return this;
    }

    /**
     * Stop the client from typing in the currently
     * active channel if applicable.
     */
    public stopTyping(): this {
        if (this.state.get().guild && this.state.get().channel && this.state.get().typingTimeout !== undefined) {
            clearTimeout(this.state.get().typingTimeout);

            this.state.update({
                typingTimeout: undefined
            });

            this.state.get().channel.stopTyping();
        }

        return this;
    }

    public getInput(clear: boolean = false): string {
        const value: string = this.options.nodes.input.getValue();

        if (clear) {
            this.clearInput();
        }

        return value.trim();
    }

    public clearInput(newValue: string = ""): this {
        this.options.nodes.input.setValue(newValue);

        if (this.options.screen.focused !== this.options.nodes.input) {
            this.options.nodes.input.focus();
        }

        this.render();

        return this;
    }

    public appendInput(value: string): this {
        this.clearInput(this.getInput() + value);

        return this;
    }

    /**
     * Destroy the client, save the state and exit
     * the application.
     */
    public async shutdown(exitCode: number = 0): Promise<void> {
        this.stopTyping();
        await this.client.destroy();
        this.state.saveSync();
        process.exit(exitCode);
    }

    public updateChannels(render: boolean = false): this {
        if (!this.state.get().guild) {
            return this;
        }

        // Fixes "ghost" children bug.
        while(true){
            try {
              this.options.nodes.channels.remove(this.options.nodes.channels.children[0]);
            }

            catch (error) {
              break;
            }
        }

        const channels: TextChannel[] = this.state.get().guild.channels.cache.array().filter((channel: GuildChannel) => channel.type === "text") as TextChannel[];

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

            const channelNode: Widgets.BoxElement = blessed.box({
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
                if (this.state.get().guild && this.state.get().channel && channels[i].id !== this.state.get().channel.id && this.state.get().guild.channels.cache.has(channels[i].id)) {
                    this.setActiveChannel(channels[i]);
                }
            });

            this.options.nodes.channels.append(channelNode);
        }

        if (render) {
            this.render(false, false);
        }

        return this;
    }

    private setupInternalCommands(): this {
        setupInternalCommands(this);

        return this;
    }

    public loadTheme(name: string): this {
        if (!name) {
            return;
        }
        // TODO: Trivial expression.
        /*else if (this.state.theme === name) {
            return this;
        }*/

        // TODO: Allow to change themes folder path (by option).
        const themePath: string = path.join(__dirname, "../", "themes", `${name}.json`);

        if (name === defaultState.theme) {
            this.setTheme(defaultState.theme, defaultState.themeData, 0);
        }
        else if (fs.existsSync(themePath)) {
            this.message.system(`Loading theme '{bold}${name}{/bold}' ...`);

            // TODO: Verify schema.
            const theme: any = fs.readFileSync(themePath).toString();

            // TODO: Catch possible parsing errors.
            this.setTheme(name, JSON.parse(theme), theme.length);
        }
        else {
            this.message.system("Such theme file could not be found (Are you sure thats under the {bold}themes{/bold} folder?)");
        }

        return this;
    }

    public setTheme(name: string, data: any, length: number): this {
        if (!data) {
            this.message.system("Error while setting theme: No data was provided for the theme");

            return this;
        }

        this.state.update({
            theme: name,
            themeData: data
        });

        // Messages.
        this.options.nodes.messages.style.fg = this.state.get().themeData.messages.foregroundColor;
        this.options.nodes.messages.style.bg = this.state.get().themeData.messages.backgroundColor;

        // Input.
        this.options.nodes.input.style.fg = this.state.get().themeData.input.foregroundColor;
        this.options.nodes.input.style.bg = this.state.get().themeData.input.backgroundColor;

        // Channels.
        this.options.nodes.channels.style.fg = this.state.get().themeData.channels.foregroundColor;
        this.options.nodes.channels.style.bg = this.state.get().themeData.channels.backgroundColor;

        // Header.
        this.options.nodes.header.style.fg = this.state.get().themeData.header.foregroundColor;
        this.options.nodes.header.style.bg = this.state.get().themeData.header.backgroundColor;

        this.updateChannels();
        this.message.system(`Applied theme '${name}' (${length} bytes)`);

        return this;
    }

    private updateTitle(): this {
        if (this.state.get().guild && this.state.get().channel) {
            this.options.screen.title = `Discord Terminal @ ${this.state.get().guild.name} # ${this.state.get().channel.name}`;
        }
        else if (this.state.get().guild) {
            this.options.screen.title = `Discord Terminal @ ${this.state.get().guild.name}`;
        }
        else {
            this.options.screen.title = "Discord Terminal";
        }

        return this;
    }

    public login(token: string): this {
        this.client.login(token).catch((error: Error) => {
            this.message.system(`Login failed: ${error.message}`);
        });

        return this;
    }

    public init(): this {
        const clipboard: string = clipboardy.readSync();

        if (this.state.get().token) {
            this.message.system(`Attempting to login using saved token; Use {bold}${this.options.commandPrefix}forget{/bold} to forget the token`);
            this.login(this.state.get().token);
        }
        else if (Pattern.token.test(clipboard)) {
            this.message.system("Attempting to login using token in clipboard");
            this.login(clipboard);
        }
        else if (process.env.DTERM_TOKEN !== undefined) {
            this.message.system("Attempting to login using environment token");
            this.login(process.env.DTERM_TOKEN);
        }
        else {
            this.options.nodes.input.setValue(`${this.options.commandPrefix}login `);
            this.showHeader("{bold}Pro Tip.{/bold} Set the environment variable {bold}DTERM_TOKEN{/bold} to automagically login!");
            this.message.system("Welcome! Please login using {bold}/login <token>{/bold} or {bold}/help{/bold} to view available commands");
        }

        this.setupEvents()
            .setupInternalCommands();

        return this;
    }

    public setActiveGuild(guild: Guild): this {
        this.state.update({
            guild
        });

        this.message.system(`Switched to guild '{bold}${this.state.get().guild.name}{/bold}'`);

        const defaultChannel: TextChannel | null = Utils.findDefaultChannel(this.state.get().guild);

        if (defaultChannel !== null) {
            this.setActiveChannel(defaultChannel);
        }
        else {
            this.message.system(`Warning: Guild '${this.state.get().guild.name}' doesn't have any text channels`);
        }

        this.updateTitle();
        this.updateChannels(true);

        return this;
    }

    public showHeader(text: string, autoHide: boolean = false): boolean {
        if (!text) {
            throw new Error("[App.showHeader] Expecting header text");
        }

        this.options.nodes.header.content = `[!] ${text}`;

        if (!this.options.nodes.header.visible) {
            // Messages.
            this.options.nodes.messages.top = "0%+3";
            this.options.nodes.messages.height = "100%-6";

            // Header.
            this.options.nodes.header.hidden = false;
        }

        if (autoHide) {
            if (this.state.get().autoHideHeaderTimeout) {
                clearTimeout(this.state.get().autoHideHeaderTimeout);
            }

            this.state.update({
                autoHideHeaderTimeout: setTimeout(this.hideHeader.bind(this), text.length * this.options.headerAutoHideTimeoutPerChar)
            });
        }

        this.render();

        return true;
    }

    public hideHeader(): boolean {
        if (!this.options.nodes.header.visible) {
            return false;
        }

        // Messages.
        this.options.nodes.messages.top = "0%";
        this.options.nodes.messages.height = "100%-3";

        // Header.
        this.options.nodes.header.hidden = true;

        this.render();

        return true;
    }

    public setActiveChannel(channel: TextChannel): this {
        this.stopTyping();

        this.state.update({
            channel
        });


        this.updateTitle();
        this.message.system(`Switched to channel '{bold}${this.state.get().channel.name}{/bold}'`);

        return this;
    }

    public render(hard: boolean = false, updateChannels: boolean = false): this {
        if (updateChannels) {
            this.updateChannels(false);
        }

        if (!hard) {
            this.options.screen.render();
        }
        else {
            this.options.screen.realloc();
        }

        return this;
    }
}
