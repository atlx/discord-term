import {TextChannel, Guild, Client, Message, DMChannel, ClientOptions} from "discord.js";
import Utils from "./utils";
import blessed from "blessed";
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
import UiManager, {IUiAtoms} from "./ui/uiManager";

export interface IAppOptions extends IStateOptions {
    readonly maxMessages: number;

    readonly screenOptions: blessed.Widgets.IScreenOptions;

    readonly commandPrefix: string;

    readonly headerAutoHideTimeoutPerChar: number;

    readonly initialState: Partial<IState>;

    readonly clientOptions: ClientOptions;

    readonly pluginsPath: string;

    readonly uiAtoms: IUiAtoms;
}

export enum SpecialSenders {
    System = "System"
}

export type ICommandHandler = (args: string[], app: App) => void;

export enum AppEvent {
    ThemeChanged = "themeChanged"
}

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

    public readonly ui: UiManager;

    public constructor(options?: Partial<IAppOptions>, commands: Map<string, ICommandHandler> = new Map()) {
        super();

        this.options = {
            ...defaultAppOptions,
            ...options
        };

        this.state = new State(this, this.options, this.options.initialState);
        this.client = new Client(this.options.clientOptions);
        this.ui = new UiManager(null, this.options.uiAtoms);
        this.commands = commands;
        this.message = new MessageFactory(this);
        this.tags = new Tags(this.state);
    }

    public async setup(init: boolean = true): Promise<this> {
        // Discord events.
        this.client.on("ready", () => {
            this.ui.atoms.header.hide();

            this.state.update({
                token: this.client.token
            });

            this.message.system(`Successfully connected as {bold}${this.client.user.tag}{/bold}`);

            const firstGuild: Guild = this.client.guilds.first();

            if (firstGuild) {
                this.setActiveGuild(firstGuild);
            }

            this.ui.atoms.channels.show();
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

        this.ui.atoms.channels.updateChannelList();
        this.message.system(`Applied theme '${name}' (${length} bytes)`);

        this.emit(AppEvent.ThemeChanged, name, data);
    }

    public login(token: string): this {
        this.client.login(token).catch((error: Error) => {
            this.message.system(`Login failed: ${error.message}`);
        });

        return this;
    }

    public async init(): Promise<void> {
        const clipboard: string = clipboardy.readSync();

        if (this.state.get().token) {
            this.message.system(`Attempting to login using saved token; Use {bold}${this.options.commandPrefix}forget{/bold} to forget the token`);
            this.login(this.state.get().token);
        }
        else if (Pattern.token.test(clipboard)) {
            this.message.system("Attempting to login using token in clipboard");
            this.login(clipboard);
        }
        else if (process.env.TOKEN !== undefined) {
            this.message.system("Attempting to login using environment token");
            this.login(process.env.TOKEN);
        }
        else {
            this.ui.atoms.composer.setText(`${this.options.commandPrefix}login `);
            this.ui.atoms.header.display("{bold}Pro Tip.{/bold} Set the environment variable {bold}TOKEN{/bold} to automagically login!");
            this.message.system("Welcome! Please login using {bold}/login <token>{/bold} or {bold}/help{/bold} to view available commands");
        }

        this.setupEvents()
            .setupInternalCommands();

        // Initialize UI manager.
        await this.ui.init();
    }

    public setActiveGuild(guild: Guild): this {
        this.state.update({
            guild
        });

        this.message.system(`Switched to guild '{bold}${this.state.get().guild.name}{/bold}'`);

        const defaultChannel: TextChannel | null = Utils.findDefaultChannel(this.state.get().guild);

        if (defaultChannel !== null) {
            this.ui.atoms.channels.setActiveChannel(defaultChannel);
        }
        else {
            this.message.system(`Warning: Guild '${this.state.get().guild.name}' doesn't have any text channels`);
        }

        this.updateTitle();
        this.updateChannels(true);

        return this;
    }
}
