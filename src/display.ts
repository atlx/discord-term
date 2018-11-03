import {TextChannel, Guild, Client, Message, Channel, Snowflake, User, DMChannel, Collection} from "discord.js";
import Utils from "./utils";
import blessed, {Widgets} from "blessed";
import chalk from "chalk";
import fs from "fs";
import clipboardy from "clipboardy";
import path from "path";
import Encryption from "./encryption";

const tokenPattern: RegExp = /ND[a-z0-9]{22}\.D[a-z]{2}[a-z0-9-]{3}\.[-a-z0-9_]{27}/gmi;

const tips: string[] = [
    "You can use the {bold}{prefix}sync{/bold} command to discard unsaved changes and reload saved state",
    "You can use the {bold}{prefix}format{/bold} command to change the message format style",
    "Toggle full-screen chat using the {bold}{prefix}fullscreen{/bold} command",
    "Command autocomplete is supported, type {bold}{prefix}he{/bold} then press tab to try it!",
    "Press {bold}ESC{/bold} anytime to clear the current input",
    "Press {bold}UP{/bold} to edit your last message",
    "Exiting with {bold}CTRL + C{/bold} is recommended since it will automatically save state",
    "Press {bold}CTRL + X{/bold} to force exit without saving state"
];

export type IAppNodes = {
    readonly messages: Widgets.BoxElement;
    readonly channels: Widgets.BoxElement;
    readonly input: Widgets.TextboxElement;
    readonly header: Widgets.BoxElement;
}

export type IPlugin = {
    readonly name: string;
    readonly description?: string;
    readonly version: string;
    readonly author?: string;

    enabled(display: Display): void;
    disabled(display: Display): void;
}

export type IAppState = {
    channel?: TextChannel;
    guild?: Guild;
    globalMessages: boolean;
    ignoreBots: boolean;
    ignoreEmptyMessages: boolean;
    muted: boolean;
    messageFormat: string;
    lastMessage?: Message;
    typingTimeout?: NodeJS.Timeout;
    trackList: Snowflake[];
    wordPins: string[];
    ignoredUsers: Snowflake[];
    autoHideHeaderTimeout?: NodeJS.Timer;
    tags: any;
    theme: string;
    themeData: any;
    decriptionKey: string;
    encrypt: boolean;
    token?: string;
}

export type IAppOptions = {
    readonly maxMessages: number;
    readonly screen: Widgets.Screen
    readonly nodes: IAppNodes;
    readonly commandPrefix: string;
    readonly stateFilePath: string;
    readonly headerAutoHideTimeoutPerChar: number;
}

const defaultAppState: IAppState = {
    globalMessages: false,
    ignoreBots: false,
    ignoreEmptyMessages: true,
    muted: false,
    messageFormat: "<{sender}> {message}",
    trackList: [],
    wordPins: [],
    ignoredUsers: [],
    tags: {},
    theme: "default",
    decriptionKey: "discord-term",
    encrypt: false,

    themeData: {
        messages: {
            foregroundColor: "white",
            backgroundColor: "gray"
        },

        channels: {
            foregroundColor: "white",
            backgroundColor: "black",
            foregroundColorHover: "white",
            backgroundColorHover: "gray"
        },

        input: {
            foregroundColor: "gray",
            backgroundColor: "lightgray"
        },

        header: {
            foregroundColor: "black",
            backgroundColor: "white"
        }
    }
};

const defaultAppOptions: IAppOptions = {
    maxMessages: 50,
    commandPrefix: "/",
    stateFilePath: "state.json",
    headerAutoHideTimeoutPerChar: 100,

    screen: blessed.screen({
        smartCSR: true,
        fullUnicode: true
    }),

    nodes: {
        messages: blessed.box({
            top: "0%",
            left: "0%",
            width: "100%",
            height: "100%-3",

            style: {
                fg: defaultAppState.themeData.messages.foregroundColor,
                bg: defaultAppState.themeData.messages.backgroundColor
            },

            scrollable: true,
            tags: true,
            padding: 1
        }),

        channels: blessed.box({
            top: "0%",
            left: "0%",
            height: "100%",
            width: "25%",
            scrollable: true,
            padding: 1,
            hidden: true,

            style: {
                fg: defaultAppState.themeData.channels.foregroundColor,
                bg: defaultAppState.themeData.channels.backgroundColor
            } as any
        }),

        input: blessed.textbox({
            style: {
                fg: defaultAppState.themeData.input.foregroundColor,
                bg: defaultAppState.themeData.input.backgroundColor
            },

            left: "0%",
            bottom: "0",
            width: "100%",
            inputOnFocus: true,
            height: "shrink",
            padding: 1
        }),

        header: blessed.box({
            style: {
                fg: defaultAppState.themeData.header.foregroundColor,
                bg: defaultAppState.themeData.header.backgroundColor
            },

            top: "0%",
            left: "0%",
            height: "0%+3",
            padding: 1,
            width: "100%",
            hidden: true,
            tags: true
        })
    }
};

export enum SpecialSenders {
    System = "System"
}

export type ICommandHandler = (args: string[], display: Display) => void;

export default class Display {
    public readonly options: IAppOptions;
    public readonly client: Client;
    public readonly commands: Map<string, ICommandHandler>;

    private state: IAppState;

    public constructor(options: Partial<IAppOptions> = defaultAppOptions, commands: Map<string, ICommandHandler> = new Map(), state: Partial<IAppState> = defaultAppState) {
        this.options = {
            ...defaultAppOptions,
            ...options
        };

        this.state = {
            ...defaultAppState,
            ...state
        };

        this.client = new Client;
        this.commands = commands;
    }

    public async setup(init: boolean = true): Promise<this> {
        // Discord Events
        this.client.on("ready", () => {
            this.hideHeader();
            this.state.token = this.client.token;
            this.appendSystemMessage(`Successfully connected as {bold}${this.client.user.tag}{/bold}`);

            const firstGuild: Guild = this.client.guilds.first();

            if (firstGuild) {
                this.setActiveGuild(firstGuild);
            }

            this.showChannels();
            this.saveStateSync();
        });

        this.client.on("message", this.handleMessage.bind(this));
        this.client.on("messageUpdate", this.handleMessage.bind(this));

        this.client.on("error", (error: Error) => {
            this.appendSystemMessage(`An error occurred within the client: ${error.message}`);
        });

        this.client.on("guildCreate", (guild: Guild) => {
            this.appendSystemMessage(`Joined guild '{bold}${guild.name}{/bold}' (${guild.memberCount} members)`);
        });

        this.client.on("guildDelete", (guild: Guild) => {
            this.appendSystemMessage(`Left guild '{bold}${guild.name}{/bold}' (${guild.memberCount} members)`);
        });

        // Append Nodes
        this.options.screen.append(this.options.nodes.input);
        this.options.screen.append(this.options.nodes.messages);
        this.options.screen.append(this.options.nodes.channels);
        this.options.screen.append(this.options.nodes.header);

        // Sync State
        await this.syncState();

        // Load & apply saved theme
        this.loadTheme(this.state.theme);

        if (init) {
            this.init();
        }

        return this;
    }

    private handleMessage(msg: Message): void {
        if (msg.author.id === this.client.user.id) {
            this.state.lastMessage = msg;
        }

        if (this.state.ignoredUsers.includes(msg.author.id)) {
            return;
        }
        else if (this.state.trackList.includes(msg.author.id)) {
            this.appendSpecialMessage("Track", msg.author.tag, msg.content);

            return;
        }
        else if (this.state.ignoreBots && msg.author.bot && msg.author.id !== this.client.user.id) {
            return;
        }
        else if (this.state.ignoreEmptyMessages && !msg.content) {
            return;
        }

        let content: string = msg.cleanContent;

        if (content.startsWith("$dt_")) {
            try {
                content = Encryption.decrypt(content.substr(4), this.state.decriptionKey);
            }
            catch (error) {
                this.appendSystemMessage(`Could not decrypt message: ${error.message}`);
            }
        }

        if (msg.author.id === this.client.user.id) {
            if (msg.channel.type === "text") {
                this.appendSelfMessage(this.client.user.tag, content);
            }
            else if (msg.channel.type === "dm") {
                this.appendSpecialMessage(`${chalk.green("=>")} DM`, (msg.channel as DMChannel).recipient.tag, content, "blue");
            }
        }
        else if (this.state.guild && this.state.channel && msg.channel.id === this.state.channel.id) {
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

            this.appendUserMessage(msg.author.tag, content, modifiers);
        }
        else if (msg.channel.type === "dm") {
            this.appendSpecialMessage(`${chalk.green("<=")} DM`, msg.author.tag, content, "blue");
        }
        else if (this.state.globalMessages) {
            this.appendSpecialMessage("Global", msg.author.tag, content);
        }
    }

    private async syncState(): Promise<boolean> {
        if (fs.existsSync(this.options.stateFilePath)) {
            return new Promise<boolean>((resolve) => {
                fs.readFile(this.options.stateFilePath, (error: Error, data: Buffer) => {
                    if (error) {
                        this.appendSystemMessage(`There was an error while reading the state file: ${error.message}`);

                        resolve(false);

                        return;
                    }

                    this.state = {
                        ...JSON.parse(data.toString()),
                        guild: this.state.guild,
                        channel: this.state.channel,
                        themeData: this.state.themeData
                    };

                    this.appendSystemMessage(`Synced state @ ${this.options.stateFilePath} (${data.length} bytes)`);

                    resolve(true);
                });
            });
        }

        return false;
    }

    public showChannels(): this {
        if (this.options.nodes.channels.hidden) {
            // Messages
            this.options.nodes.messages.width = "75%+2";
            this.options.nodes.messages.left = "25%";

            // Input
            this.options.nodes.input.width = "75%+2";
            this.options.nodes.input.left = "25%";

            // Header
            this.options.nodes.header.width = "75%+2";
            this.options.nodes.header.left = "25%";

            this.options.nodes.channels.show();
            this.render();
        }

        return this;
    }

    public hideChannels(): this {
        if (!this.options.nodes.channels.hidden) {
            // Messages
            this.options.nodes.messages.width = "100%";
            this.options.nodes.messages.left = "0%";

            // Input
            this.options.nodes.input.width = "100%";
            this.options.nodes.input.left = "0%";

            // Header
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
        // Screen
        this.options.screen.key("C-c", async () => {
            await this.shutdown();
        });

        this.options.screen.key("C-x", () => {
            process.exit(0);
        });

        this.options.screen.key("space", () => {
            this.options.nodes.input.focus();
        });

        // Input
        this.options.nodes.input.on("keypress", this.startTyping.bind(this));

        this.options.nodes.input.key("tab", () => {
            const rawInput: string = this.getInput();
            const input: string = rawInput.substr(this.options.commandPrefix.length);

            if (rawInput.startsWith(this.options.commandPrefix) && input.length >= 2 && input.indexOf(" ") === -1) {
                for (let [name, handler] of this.commands) {
                    if (name.startsWith(input)) {
                        this.clearInput(`${this.options.commandPrefix}${name} `);

                        break;
                    }
                }
            }
        });

        this.options.nodes.input.key("enter", () => {
            let input: string = this.getInput(true);

            const splitInput: string[] = input.split(" ");
            const tags: string[] = this.getTags();

            for (let i: number = 0; i < tags.length; i++) {
                while (splitInput.includes(`$${tags[i]}`)) {
                    splitInput[splitInput.indexOf(`$${tags[i]}`)] = this.getTag(tags[i]);
                }
            }

            input = splitInput.join(" ").trim();

            if (input === "") {
                return;
            }
            else if (input.startsWith(this.options.commandPrefix)) {
                const args: string[] = input.substr(this.options.commandPrefix.length).split(" ");
                const base: string = args[0];

                if (this.commands.has(base)) {
                    args.splice(0, 1);
                    (this.commands.get(base) as ICommandHandler)(args, this);
                }
                else {
                    this.appendSystemMessage(`Unknown command: ${base}`);
                }
            }
            else {
                if (this.state.muted) {
                    this.appendSystemMessage(`Message not sent; Muted mode is active. Please use {bold}${this.options.commandPrefix}mute{/bold} to toggle`);
                }
                else if (this.state.guild && this.state.channel) {
                    let msg: string = input;

                    if (this.state.encrypt) {
                        msg = "$dt_" + Encryption.encrypt(msg, this.state.decriptionKey);
                    }

                    this.state.channel.send(msg).catch((error: Error) => {
                        this.appendSystemMessage(`Unable to send message: ${error.message}`);
                    });
                }
                else {
                    this.appendSystemMessage("No active text channel");
                }
            }

            this.clearInput();
        });

        this.options.nodes.input.key("escape", () => {
            if (this.getInput().startsWith(this.options.commandPrefix)) {
                this.clearInput(this.options.commandPrefix);
            }
            else {
                this.clearInput();
            }
        });

        this.options.nodes.input.key("up", () => {
            if (this.state.lastMessage) {
                this.clearInput(`${this.options.commandPrefix}edit ${this.state.lastMessage.id} ${this.state.lastMessage.content}`);
            }
        });

        this.options.nodes.input.key("down", () => {
            if (this.client.user && this.client.user.lastMessage && this.client.user.lastMessage.deletable) {
                this.client.user.lastMessage.delete();
            }
        });

        this.options.nodes.input.key("C-c", async () => {
            await this.shutdown();
        });

        this.options.nodes.input.key("C-x", () => {
            process.exit(0);
        });

        return this;
    }

    public startTyping(): this {
        if (!this.state.muted && this.state.guild && this.state.channel && this.state.typingTimeout === undefined) {
            this.state.channel.startTyping();

            this.state.typingTimeout = setTimeout(() => {
                this.stopTyping();
            }, 10000);
        }

        return this;
    }

    public stopTyping(): this {
        if (this.state.guild && this.state.channel && this.state.typingTimeout !== undefined) {
            clearTimeout(this.state.typingTimeout);
            this.state.typingTimeout = undefined;
            this.state.channel.stopTyping();
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

    public async shutdown(code: number = 0): Promise<void> {
        this.stopTyping();
        await this.client.destroy();
        this.saveStateSync();
        process.exit(code);
    }

    public updateChannels(render: boolean = false): this {
        if (!this.state.guild) {
            return this;
        }

        // Fixes "ghost" children bug
        for (let i: number = 0; i < this.options.nodes.channels.children.length; i++) {
            this.options.nodes.channels.remove(this.options.nodes.channels.children[i]);
        }

        const channels: TextChannel[] = this.state.guild.channels.array().filter((channel: Channel) => channel.type === "text") as TextChannel[];

        for (let i: number = 0; i < channels.length; i++) {
            let channelName: string = channels[i].name;

            // TODO: Use a constant for the pattern
            // This fixes UI being messed up due to channel names containing unicode emojis
            while (/[^a-z0-9-_?]+/gm.test(channelName)) {
                channelName = channelName.replace(/[^a-z0-9-_]+/gm, "?");
            }

            if (channelName.length > 25) {
                channelName = channelName.substring(0, 21) + " ...";
            }

            const channelNode: Widgets.BoxElement = blessed.box({
                style: {
                    bg: this.state.themeData.channels.backgroundColor,
                    fg: this.state.themeData.channels.foregroundColor,

                    // TODO: Not working
                    bold: this.state.channel !== undefined && this.state.channel.id === channels[i].id,

                    hover: {
                        bg: this.state.themeData.channels.backgroundColorHover,
                        fg: this.state.themeData.channels.foregroundColorHover
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
                if (this.state.guild && this.state.channel && channels[i].id !== this.state.channel.id && this.state.guild.channels.has(channels[i].id)) {
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
        this.commands.set("login", (args: string[]) => {
            this.login(args[0]);
        });

        this.commands.set("logout", async () => {
            await this.shutdown();
        });

        this.commands.set("now", () => {
            if (this.state.guild && this.state.channel) {
                this.appendSystemMessage(`Currently on guild '{bold}${this.state.guild.name}{/bold}' # '{bold}${this.state.channel.name}{/bold}'`)
            }
            else if (this.state.guild) {
                this.appendSystemMessage(`Currently on guild '{bold}${this.state.guild.name}{/bold}`);
            }
            else {
                this.appendSystemMessage("No active guild");
            }
        });

        this.commands.set("mute", () => {
            this.state.muted = !this.state.muted;

            if (this.state.muted) {
                this.appendSystemMessage("Muted mode activated");
            }
            else {
                this.appendSystemMessage("Muted mode is no longer activated");
            }
        });

        this.commands.set("ignore", (args: string[]) => {
            if (!args[0]) {
                if (this.state.ignoredUsers.length === 0) {
                    this.appendSystemMessage("Not ignoring anyone");

                    return;
                }

                const usersString: string = this.state.ignoredUsers.map((userId: Snowflake) => `@{bold}${userId}{/bold}`).join(", ");

                this.appendSystemMessage(`Currently ignoring messages from: ${usersString}`);
            }
            else if (this.client.user && this.client.user.id === args[0]) {
                this.appendSystemMessage("You can't ignore yourself, silly");
            }
            else if (this.state.ignoredUsers.includes(args[0])) {
                this.state.ignoredUsers.splice(this.state.ignoredUsers.indexOf(args[0]), 1);
                this.appendSystemMessage(`Removed user @{bold}${args[0]}{/bold} from the ignore list`);
            }
            else {
                if (this.state.trackList.includes(args[0])) {
                    this.state.trackList.splice(this.state.trackList.indexOf(args[0]), 1);
                    this.appendSystemMessage(`No longer tracking @{bold}${args[0]}{/bold}`);
                }

                this.state.ignoredUsers.push(args[0]);
                this.appendSystemMessage(`Added user @{bold}${args[0]}{/bold} to the ignore list`);
            }
        });

        this.commands.set("edit", async (args: string[]) => {
            // TODO: Display message
            if (!args[0] || !args[1] || !this.state.channel) {
                return;
            }

            const message: Message = await this.state.channel.fetchMessage(args[0]) as Message;

            if (message && message.editable) {
                await message.edit(args.slice(1).join(" "));
            }
            else {
                this.appendSystemMessage("That message doesn't exist or it is not editable");
            }
        });

        this.commands.set("save", () => {
            this.saveStateSync();
        });

        this.commands.set("format", (args: string[]) => {
            this.state.messageFormat = args.join(" ");
            this.appendSystemMessage(`Successfully changed format to '${this.state.messageFormat}'`);
        });

        this.commands.set("forget", () => {
            if (this.state.token) {
                this.state.token = undefined;
                this.saveStateSync();
            }
        });

        this.commands.set("encrypt", (args: string[]) => {
            if (!args[0]) {
                this.appendSystemMessage("You must provide a password");

                return;
            }

            this.state.decriptionKey = args[0];
            this.appendSystemMessage(`Using decryption key '{bold}${args[0]}{/bold}'`);
        });

        this.commands.set("doencrypt", () => {
            this.state.encrypt = !this.state.encrypt;

            if (this.state.encrypt) {
                this.appendSystemMessage("Now encrypting messages");
            }
            else {
                this.appendSystemMessage("No longer encrypting messages");
            }
        });

        this.commands.set("theme", (args: string[]) => {
            if (!args[0]) {
                this.appendSystemMessage(`The current theme is '{bold}${this.state.theme}{/bold}'`)

                return;
            }

            this.loadTheme(args[0]);
        });

        this.commands.set("themes", () => {
            const themesPath: string = path.join(__dirname, "../", "themes");

            if (fs.existsSync(themesPath)) {
                let files: string[] = fs.readdirSync(themesPath);

                for (let i: number = 0; i < files.length; i++) {
                    files[i] = files[i].replace(".json", "");
                }

                const themesString: string = files.join("\n");

                this.appendSystemMessage(themesString);
            }
            else {
                this.appendSystemMessage("Themes directory does not exist");
            }
        });

        this.commands.set("tag", (args: string[]) => {
            if (!args[0]) {
                const tags: string[] = this.getTags();

                if (tags.length === 0) {
                    this.appendSystemMessage("No tags have been set");

                    return;
                }

                const tagsString: string = tags.map((tag: string) => `{bold}${tag}{/bold}`).join(", ");

                this.appendSystemMessage(`Tags: ${tagsString}`);
            }
            else if (args.length === 2) {
                this.setTag(args[0], args[1]);
                this.appendSystemMessage(`Successfully saved tag '{bold}${args[0]}{/bold}'`);
            }
            else if (args.length === 1 && this.hasTag(args[0])) {
                this.deleteTag(args[0]);
                this.appendSystemMessage(`Successfully deleted tag '{bold}${args[0]}{/bold}'`);
            }
            else {
                this.appendSystemMessage("Such tag does not exist");
            }
        });

        this.commands.set("tip", () => {
            // TODO: Replace all
            const tip: string = tips[Utils.getRandomInt(0, tips.length - 1)]
                .replace("{prefix}", this.options.commandPrefix);

            this.showHeader(tip, true);
        });

        this.commands.set("dm", async (args: string[]) => {
            if (!args[0] || !args[1]) {
                this.appendSystemMessage("Expecting both recipient and message arguments");

                return;
            }

            if (this.client.users.has(args[0])) {
                const recipient: User = this.client.users.get(args[0]) as User;

                (await recipient.createDM()).send(args.slice(1).join(" ")).catch((error: Error) => {
                    this.appendSystemMessage(`Unable to send message: ${error.message}`);
                });
            }
            else {
                this.appendSystemMessage("Such user does not exist or has not been cached");
            }
        });

        this.commands.set("fullscreen", () => {
            this.toggleChannels();
        });

        this.commands.set("me", () => {
            // TODO: Add valid method to check if logged in
            if (this.client.user) {
                this.appendSystemMessage(`Logged in as {bold}${this.client.user.tag}{/bold} | {bold}${Math.round(this.client.ping)}{/bold}ms`);
            }
            else {
                this.appendSystemMessage("Not logged in");
            }
        });

        this.commands.set("sync", () => {
            this.syncState();
        });

        this.commands.set("pin", (args: string[]) => {
            if (!args[0]) {
                if (this.state.wordPins.length === 0) {
                    this.appendSystemMessage("No set word pins");

                    return;
                }

                const wordPinsString: string = this.state.wordPins.map((pin: string) => `{bold}${pin}{/bold}`).join(", ");

                this.appendSystemMessage(`Word pins: ${wordPinsString}`);
            }
            else if (this.state.wordPins.includes(args[0])) {
                this.state.wordPins.splice(this.state.wordPins.indexOf(args[0]), 1);
                this.appendSystemMessage(`Removed word '{bold}${args[0]}{/bold}' from pins`);
            }
            else {
                this.state.wordPins.push(args[0]);
                this.appendSystemMessage(`Added word '{bold}${args[0]}{/bold}' to pins`);
            }
        });

        this.commands.set("track", (args: string[]) => {
            if (!args[0]) {
                if (this.state.trackList.length === 0) {
                    this.appendSystemMessage("Not tracking anyone");

                    return;
                }

                const usersString: string = this.state.trackList.map((userId: Snowflake) => `@{bold}${userId}{/bold}`).join(", ");

                this.appendSystemMessage(`Tracking users: ${usersString}`);
            }
            else if (this.client.user && this.client.user.id === args[0]) {
                this.appendSystemMessage("You can't track yourself, silly");
            }
            else if (this.state.trackList.includes(args[0])) {
                this.state.trackList.splice(this.state.trackList.indexOf(args[0]), 1);
                this.appendSystemMessage(`No longer tracking @{bold}${args[0]}{/bold}`);
            }
            else if (this.client.users.has(args[0])) {
                if (this.state.ignoredUsers.includes(args[0])) {
                    this.appendSystemMessage("You must first stop ignoring that user");

                    return;
                }

                this.state.trackList.push(args[0]);
                this.appendSystemMessage(`Now tracking @{bold}${args[0]}{/bold}`);
            }
            else {
                this.appendSystemMessage("No such user cached");
            }
        });

        this.commands.set("help", () => {
            let helpString: string = "";

            for (let [name, handler] of this.commands) {
                helpString += `\n\t${name}`;
            }

            this.appendSystemMessage(`Commands available: \n${helpString}\n`);
        });

        this.commands.set("global", () => {
            this.state.globalMessages = !this.state.globalMessages;

            if (this.state.globalMessages) {
                this.appendSystemMessage("Displaying global messages");
            }
            else {
                this.appendSystemMessage("No longer displaying global messages");
            }
        });

        this.commands.set("bots", () => {
            this.state.ignoreBots = !this.state.ignoreBots;

            if (this.state.ignoreBots) {
                this.appendSystemMessage("No longer displaying bot messages");
            }
            else {
                this.appendSystemMessage("Displaying bot messages");
            }
        });

        this.commands.set("clear", () => {
            this.options.nodes.messages.setContent("");
            this.render();
        });

        this.commands.set("c", (args: string[]) => {
            if (!this.state.guild) {
                this.appendSystemMessage("No active guild");
            }
            else if (this.state.guild.channels.has(args[0])) {
                // TODO: Verify that it's a text channel
                this.setActiveChannel(this.state.guild.channels.get(args[0]) as TextChannel);
            }
            else {
                const channel: TextChannel = this.state.guild.channels.array().find((channel) => channel.type === "text" && (channel.name === args[0] || "#" + channel.name === args[0])) as TextChannel;

                if (channel) {
                    this.setActiveChannel(channel as TextChannel);
                }
                else {
                    this.appendSystemMessage(`Such channel does not exist in guild '${this.state.guild.name}'`);
                }
            }
        });

        this.commands.set("g", (args: string[]) => {
            if (this.client.guilds.has(args[0])) {
                this.setActiveGuild(this.client.guilds.get(args[0]) as Guild);
            }
            else {
                this.appendSystemMessage("Such guild does not exist");
            }
        });

        this.commands.set("reset", () => {
            this.render(true);
        });

        return this;
    }

    public loadTheme(name: string): this {
        if (!name) {
            return;
        }
        // TODO: Trivial expression
        /*else if (this.state.theme === name) {
            return this;
        }*/

        // TODO: Allow to change themes folder path (by option)
        const themePath: string = path.join(__dirname, "../", "themes", `${name}.json`);

        if (name === defaultAppState.theme) {
            this.setTheme(defaultAppState.theme, defaultAppState.themeData, 0);
        }
        else if (fs.existsSync(themePath)) {
            this.appendSystemMessage(`Loading theme '{bold}${name}{/bold}' ...`);

            // TODO: Verify schema
            const theme: any = fs.readFileSync(themePath).toString();

            // TODO: Catch possible parsing errors
            this.setTheme(name, JSON.parse(theme), theme.length);
        }
        else {
            this.appendSystemMessage("Such theme file could not be found (Are you sure thats under the {bold}themes{/bold} folder?)");
        }

        return this;
    }

    public setTheme(name: string, data: any, length: number): this {
        if (!data) {
            this.appendSystemMessage("Error while setting theme: No data was provided for the theme");

            return this;
        }

        this.state.theme = name;
        this.state.themeData = data;

        // Messages
        this.options.nodes.messages.style.fg = this.state.themeData.messages.foregroundColor;
        this.options.nodes.messages.style.bg = this.state.themeData.messages.backgroundColor;

        // Input
        this.options.nodes.input.style.fg = this.state.themeData.input.foregroundColor;
        this.options.nodes.input.style.bg = this.state.themeData.input.backgroundColor;

        // Channels
        this.options.nodes.channels.style.fg = this.state.themeData.channels.foregroundColor;
        this.options.nodes.channels.style.bg = this.state.themeData.channels.backgroundColor;

        // Header
        this.options.nodes.header.style.fg = this.state.themeData.header.foregroundColor;
        this.options.nodes.header.style.bg = this.state.themeData.header.backgroundColor;

        this.updateChannels();
        this.appendSystemMessage(`Applied theme '${name}' (${length} bytes)`);

        return this;
    }

    private updateTitle(): this {
        if (this.state.guild && this.state.channel) {
            this.options.screen.title = `Discord Terminal @ ${this.state.guild.name} # ${this.state.channel.name}`;
        }
        else if (this.state.guild) {
            this.options.screen.title = `Discord Terminal @ ${this.state.guild.name}`;
        }
        else {
            this.options.screen.title = "Discord Terminal";
        }

        return this;
    }

    public getTags(): string[] {
        return Object.keys(this.state.tags);
    }

    public hasTag(name: string): boolean {
        return this.getTags().includes(name);
    }

    public getTag(name: string): string | null {
        const keys: string[] = this.getTags();

        if (!keys.includes(name)) {
            return name;
        }

        return this.state.tags[name];
    }

    public setTag(name: string, value: string): this {
        this.state.tags[name] = value;

        return this;
    }

    public deleteTag(name: string): boolean {
        if (this.hasTag(name)) {
            delete this.state.tags[name];

            return true;
        }

        return false;
    }

    public saveStateSync(): this {
        this.appendSystemMessage("Saving application state ...");

        const data: string = JSON.stringify({
            ...this.state,
            guild: undefined,
            channel: undefined,
            lastMessage: undefined,
            typingTimeout: undefined,
            autoHideHeaderTimeout: undefined,
            themeData: undefined
        });

        fs.writeFileSync(this.options.stateFilePath, data);
        this.appendSystemMessage(`Application state saved @ '${this.options.stateFilePath}' (${data.length} bytes)`);

        return this;
    }

    public login(token: string): this {
        this.client.login(token).catch((error: Error) => {
            this.appendSystemMessage(`Login failed: ${error.message}`);
        });

        return this;
    }

    public init(): this {
        const clipboard: string = clipboardy.readSync();

        if (this.state.token) {
            this.appendSystemMessage(`Attempting to login using saved token; Use {bold}${this.options.commandPrefix}forget{/bold} to forget the token`);
            this.login(this.state.token);
        }
        else if (tokenPattern.test(clipboard)) {
            this.appendSystemMessage("Attempting to login using token in clipboard");
            this.login(clipboard);
        }
        else if (process.env.TOKEN !== undefined) {
            this.appendSystemMessage("Attempting to login using environment token");
            this.login(process.env.TOKEN);
        }
        else {
            this.options.nodes.input.setValue(`${this.options.commandPrefix}login `);
            this.showHeader("{bold}Pro Tip.{/bold} Set the environment variable {bold}TOKEN{/bold} to automagically login!");
            this.appendSystemMessage("Welcome! Please login using {bold}/login <token>{/bold} or {bold}/help{/bold} to view available commands");
        }

        this.setupEvents()
            .setupInternalCommands();

        return this;
    }

    public setActiveGuild(guild: Guild): this {
        this.state.guild = guild;
        this.appendSystemMessage(`Switched to guild '{bold}${this.state.guild.name}{/bold}'`);

        const defaultChannel: TextChannel | null = Utils.findDefaultChannel(this.state.guild);

        if (defaultChannel !== null) {
            this.setActiveChannel(defaultChannel);
        }
        else {
            this.appendSystemMessage(`Warning: Guild '${this.state.guild.name}' doesn't have any text channels`);
        }

        this.updateTitle();
        this.updateChannels(true);

        return this;
    }

    public showHeader(text: string, autoHide: boolean = false): boolean {
        if (!text) {
            throw new Error("[Display.showHeader] Expecting header text");
        }

        this.options.nodes.header.content = `[!] ${text}`;

        if (!this.options.nodes.header.visible) {
            // Messages
            this.options.nodes.messages.top = "0%+3";
            this.options.nodes.messages.height = "100%-6";

            // Header
            this.options.nodes.header.hidden = false;
        }

        if (autoHide) {
            if (this.state.autoHideHeaderTimeout) {
                clearTimeout(this.state.autoHideHeaderTimeout);
            }

            this.state.autoHideHeaderTimeout = setTimeout(this.hideHeader.bind(this), text.length * this.options.headerAutoHideTimeoutPerChar);
        }

        this.render();

        return true;
    }

    public hideHeader(): boolean {
        if (!this.options.nodes.header.visible) {
            return false;
        }

        // Messages
        this.options.nodes.messages.top = "0%";
        this.options.nodes.messages.height = "100%-3";

        // Header
        this.options.nodes.header.hidden = true;

        this.render();

        return true;
    }

    public setActiveChannel(channel: TextChannel): this {
        this.stopTyping();
        this.state.channel = channel;
        this.updateTitle();
        this.appendSystemMessage(`Switched to channel '{bold}${this.state.channel.name}{/bold}'`);
        this.loadMessages(10);

        return this;
    }

    public loadMessages(count: number): this {
        const channel: TextChannel = this.state.channel;

        channel.fetchMessages({limit: count}).then((messages: Collection<Snowflake, Message>) => {
            for (let msg of messages.array()) {
                this.handleMessage(msg);
            }
        }).catch((error: Error) => {
            // can't read messages :thonk:
            // the program will log this for us iirc
        });

        return this;
    }

    // TODO: Also include time
    public appendMessage(sender: string, message: string, senderColor: string = "white", messageColor: string = this.state.themeData.messages.foregroundColor): this {
        let messageString: string = message;

        if (messageColor.startsWith("#")) {
            messageString = chalk.hex(messageColor)(messageString);
        }
        else if (chalk[messageColor] === undefined || typeof chalk[messageColor] !== "function") {
            this.appendSystemMessage("Refusing to append message: An invalid color was provided");

            return this;
        }
        else {
            messageString = ((chalk as any)[messageColor] as any)(message);
        }

        let line: string = this.state.messageFormat
            // TODO: Catch error if sender color doesn't exist
            .replace("{sender}", chalk[senderColor](sender))
            .replace("{message}", messageString);

        if (sender !== `{bold}${SpecialSenders.System}{/bold}`) {
            const splitLine: string[] = line.split(" ");

            for (let i: number = 0; i < this.state.wordPins.length; i++) {
                while (splitLine.includes(this.state.wordPins[i])) {
                    splitLine[splitLine.indexOf(this.state.wordPins[i])] = chalk.bgGreen.white(this.state.wordPins[i]);
                }
            }

            line = splitLine.join(" ");
        }

        this.options.nodes.messages.pushLine(line);
        this.options.nodes.messages.setScrollPerc(100);
        this.render();

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

    public appendUserMessage(sender: string, message: string, modifiers: string[] = []): this {
        let name: string = `@${sender}`;

        if (modifiers.length > 0) {
            for (let i: number = 0; i < modifiers.length; i++) {
                name = modifiers[i] + name;
            }
        }

        this.appendMessage(name, message, "cyan");

        return this;
    }

    public appendSelfMessage(name: string, message: string): this {
        this.appendMessage(`@{bold}${name}{/bold}`, message, "cyan");

        return this;
    }

    public appendSpecialMessage(prefix: string, sender: string, message: string, color: string = "yellow"): this {
        this.appendMessage(`${prefix} ~> @{bold}${sender}{/bold}`, message, color);

        return this;
    }

    public appendSystemMessage(message: string): this {
        this.appendMessage(`{bold}${SpecialSenders.System}{/bold}`, message, "green");

        return this;
    }
}
