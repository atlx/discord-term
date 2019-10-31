import App from "./app";
import Encryption from "./encryption";

export default function setupEvents(app: App): void {
    // Abstract atoms & blessed elements for short access aliases.
    const screen = app.ui.screen;
    const composer = app.ui.atoms.composer;
    const composerEl = composer.unwrap();

    // Screen.
    screen.key("C-c", async () => {
        await app.shutdown();
    });

    screen.key("C-x", () => {
        process.exit(0);
    });

    screen.key("space", () => {
        composer.focus();
    });

    // Composer.
    composerEl.on("keypress", () => {
        // TODO: If logged in.
        //app.startTyping();
    });

    composerEl.key("tab", () => {
        const rawInput: string = composer.text;
        const input: string = rawInput.substr(app.options.commandPrefix.length);

        if (rawInput.startsWith(app.options.commandPrefix) && input.length >= 2 && input.indexOf(" ") === -1) {
            for (let [name, handler] of app.commands) {
                if (name.startsWith(input)) {
                    composer.setText(`${app.options.commandPrefix}${name} `);

                    break;
                }
            }
        }
    });

    composerEl.key("enter", () => {
        let input: string = app.ui.atoms.composer.text;

        app.ui.atoms.composer.clearText();

        const splitInput: string[] = input.split(" ");
        const tags: string[] = app.tags.getAll();

        for (let i: number = 0; i < tags.length; i++) {
            while (splitInput.includes(`$${tags[i]}`)) {
                splitInput[splitInput.indexOf(`$${tags[i]}`)] = app.tags.get(tags[i]);
            }
        }

        input = splitInput.join(" ").trim();

        if (input === "") {
            return;
        }
        else if (input.startsWith(app.options.commandPrefix)) {
            const args: string[] = input.substr(app.options.commandPrefix.length).split(" ");
            const base: string = args[0];

            if (app.commands.has(base)) {
                args.splice(0, 1);
                app.commands.get(base)!(args, this);
            }
            else {
                app.message.system(`Unknown command: ${base}`);
            }
        }
        else {
            if (app.state.get().muted) {
                app.message.system(`Message not sent; Muted mode is active. Please use {bold}${app.options.commandPrefix}mute{/bold} to toggle`);
            }
            else if (app.state.get().guild && app.state.get().channel) {
                let msg: string = input;

                if (app.state.get().encrypt) {
                    msg = "$dt_" + Encryption.encrypt(msg, app.state.get().decriptionKey);
                }

                app.state.get().channel.send(msg).catch((error: Error) => {
                    app.message.system(`Unable to send message: ${error.message}`);
                });
            }
            else {
                app.message.system("No active text channel");
            }
        }

        composer.clearText();
    });

    composerEl.key("escape", () => {
        if (composer.text.startsWith(app.options.commandPrefix)) {
            composer.setText(app.options.commandPrefix);
        }
        else {
            composer.clearText();
        }
    });

    composerEl.key("up", () => {
        if (app.state.get().lastMessage) {
            composer.setText(`${app.options.commandPrefix}edit ${app.state.get().lastMessage.id} ${app.state.get().lastMessage.content}`);
        }
    });

    composerEl.key("down", () => {
        if (app.client.user && app.client.user.lastMessage && app.client.user.lastMessage.deletable) {
            app.client.user.lastMessage.delete();
        }
    });

    composerEl.key("C-c", async () => {
        await app.shutdown();
    });

    composerEl.key("C-x", () => {
        process.exit(0);
    });
}
