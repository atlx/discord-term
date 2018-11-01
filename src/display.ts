import {TextChannel, Guild, Client, Message, Channel, Snowflake, User, DMChannel} from "discord.js";
import Utils from "./utils";
import blessed, {Widgets} from "blessed";
import chalk from "chalk";
import fs from "fs";

export type IAppNodes = {
    readonly messages: Widgets.BoxElement;
    readonly channels: Widgets.BoxElement;
    readonly input: Widgets.TextboxElement;
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
    wordPins: string[]
}

export type IAppOptions = {
    readonly maxMessages: number;
    readonly screen: Widgets.Screen
    readonly nodes: IAppNodes;
    readonly commandPrefix: string;
    readonly stateFilePath: string;
}

const defaultAppState: IAppState = {
    globalMessages: false,
    ignoreBots: false,
    ignoreEmptyMessages: true,
    muted: false,
    messageFormat: "<{sender}>: {message}",
    trackList: [],
    wordPins: []
};

const defaultAppOptions: IAppOptions = {
    maxMessages: 50,
    commandPrefix: "/",
    stateFilePath: "state.json",

    screen: blessed.screen({
        // TODO:
    }),

    nodes: {
        messages: blessed.box({
            top: "0%",
            left: "0%",
            width: "100%",
            height: "100%-3",

            style: {
                fg: "white",
                bg: "gray"
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
                item: {
                    bg: "gray",
                    fg: "white"
                },

                selected: {
                    bg: "gray",
                    fg: "white"
                },

                fg: "white",
                bg: "black"
            } as any
        }),

        input: blessed.textbox({
            style: {
                fg: "gray",
                bg: "lightgray"
            },

            left: "0%",
            bottom: "0",
            width: "100%",
            inputOnFocus: true,
            height: "shrink",
            padding: 1
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
            this.appendSystemMessage(`Successfully connected as {bold}${this.client.user.tag}{/bold}`);

            const firstGuild: Guild = this.client.guilds.first();

            if (firstGuild) {
                this.setActiveGuild(firstGuild);
            }

            this.showChannels();
        });

        this.client.on("message", this.handleMessage.bind(this));
        this.client.on("messageUpdate", this.handleMessage.bind(this));

        // Append Nodes
        this.options.screen.append(this.options.nodes.input);
        this.options.screen.append(this.options.nodes.messages);
        this.options.screen.append(this.options.nodes.channels);

        // Sync State
        await this.syncState();

        if (init) {
            this.init();
        }

        return this;
    }

    private handleMessage(msg: Message): void {
        if (msg.author.id === this.client.user.id) {
            this.state.lastMessage = msg;
        }

        if (this.state.trackList.includes(msg.author.id)) {
            this.appendSpecialMessage("Track", msg.author.tag, msg.content);
        }
        else if (this.state.ignoreBots && msg.author.bot && msg.author.id !== this.client.user.id) {
            return;
        }
        else if (this.state.ignoreEmptyMessages && !msg.content) {
            return;
        }
        else if (msg.author.id === this.client.user.id) {
            if (msg.channel.type === "text") {
                this.appendSelfMessage(this.client.user.tag, msg.content);
            }
            else if (msg.channel.type === "dm") {
                this.appendSpecialMessage(`${chalk.green("=>")} DM`, (msg.channel as DMChannel).recipient.tag, msg.content, "blue");
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
            const messageContent = msg.content.replace(/{\/?([a-zA-Z-]+)}/g, (_____, p) => {
                return `{ ${p}}`;
            });
            this.appendUserMessage(msg.author.tag, messageContent, modifiers);
        }
        else if (msg.channel.type === "dm") {
            this.appendSpecialMessage(`${chalk.green("<=")} DM`, msg.author.tag, msg.content, "blue");
        }
        else if (this.state.globalMessages) {
            this.appendSpecialMessage("Global", msg.author.tag, msg.content);
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
                        channel: this.state.channel
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
            this.options.nodes.messages.width = "75%+2";
            this.options.nodes.messages.left = "25%";
            this.options.nodes.input.width = "75%+2";
            this.options.nodes.input.left = "25%";
            this.options.nodes.channels.show();
            this.render();
        }

        return this;
    }

    public hideChannels(): this {
        if (!this.options.nodes.channels.hidden) {
            this.options.nodes.messages.width = "100%";
            this.options.nodes.messages.left = "0%";
            this.options.nodes.input.width = "100%";
            this.options.nodes.input.left = "0%";
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
            const input: string = this.getInput(true);

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
                    this.state.channel.send(input).catch((error: Error) => {
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
            if (this.client.user.lastMessage && this.client.user.lastMessage.deletable) {
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

    public async shutdown(code: number = 0): Promise<void> {
        this.stopTyping();
        await this.client.destroy();
        this.saveStateSync();
        process.exit(code);
    }

    public renderChannels(): this {
        if (this.state.guild) {
            this.options.nodes.channels.children = [];

            const channels: TextChannel[] = this.state.guild.channels.array().filter((channel: Channel) => channel.type === "text") as TextChannel[];

            for (let i: number = 0; i < channels.length; i++) {
                const channelNode: Widgets.BoxElement = blessed.box({
                    style: {
                        bg: "black",
                        fg: "white",

                        // TODO: Not working
                        bold: this.state.channel !== undefined && this.state.channel.id === channels[i].id,

                        hover: {
                            bg: "gray"
                        }
                    },

                    content: `#${channels[i].name}`,
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

            this.render();
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
            else if (this.state.trackList.includes(args[0])) {
                this.state.trackList.splice(this.state.trackList.indexOf(args[0]), 1);
                this.appendSystemMessage(`No longer tracking @{bold}${args[0]}{/bold}`);
            }
            else if (this.client.users.has(args[0])) {
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
                this.appendSystemMessage(`Such channel does not exist in guild '${this.state.guild.name}'`);
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

    public saveStateSync(): this {
        this.appendSystemMessage("Saving application state ...");

        fs.writeFileSync(this.options.stateFilePath, JSON.stringify({
            ...this.state,
            guild: undefined,
            channel: undefined,
            lastMessage: undefined,
            typingTimeout: undefined
        }));

        this.appendSystemMessage(`Application state saved @ '${this.options.stateFilePath}'`);

        return this;
    }

    public login(token: string): this {
        this.client.login(token).catch((error: Error) => {
            this.appendSystemMessage(`Login failed: ${error.message}`);
        });

        return this;
    }

    public init(): this {
        if (process.env.TOKEN !== undefined) {
            this.appendSystemMessage("Attempting to login using environment token");
            this.login(process.env.TOKEN);
        }
        else {
            this.options.nodes.input.setValue(`${this.options.commandPrefix}login `);
            this.appendSystemMessage("Welcome! Please login using {bold}/login <token>{/bold}")
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
        this.renderChannels();

        return this;
    }

    public setActiveChannel(channel: TextChannel): this {
        this.stopTyping();
        this.state.channel = channel;
        this.updateTitle();
        this.appendSystemMessage(`Switched to channel '{bold}${this.state.channel.name}{/bold}'`);

        return this;
    }

    // TODO: Also include time
    public appendMessage(sender: string, message: string, color = "white"): this {
        let line: string = this.state.messageFormat
            .replace("{sender}", ((chalk as any)[color] as any)(sender))
            .replace("{message}", message);

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

    public render(hard: boolean = false): this {
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