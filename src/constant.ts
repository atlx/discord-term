import {IAppOptions} from "./app";
import Channels from "./ui/channels";
import Composer from "./ui/composer";
import Header from "./ui/header";
import Messages from "./ui/messages";

export const tips: string[] = [
    "You can use the {bold}{prefix}sync{/bold} command to discard unsaved changes and reload saved state",
    "You can use the {bold}{prefix}format{/bold} command to change the message format style",
    "Toggle full-screen chat using the {bold}{prefix}fullscreen{/bold} command",
    "Command autocomplete is supported, type {bold}{prefix}he{/bold} then press tab to try it!",
    "Press {bold}ESC{/bold} anytime to clear the current input",
    "Press {bold}UP{/bold} to edit your last message",
    "Exiting with {bold}CTRL + C{/bold} is recommended since it will automatically save state",
    "Press {bold}CTRL + X{/bold} to force exit without saving state"
];

export const defaultAppOptions: IAppOptions = {
    clientOptions: {},
    initialState: {},
    maxMessages: 50,
    commandPrefix: "/",
    stateFilePath: "state.json",
    pluginsPath: "plugins",
    headerAutoHideTimeoutPerChar: 100,

    screenOptions: {
        smartCSR: true,
        fullUnicode: true
    },

    uiAtoms: {
        channels: new Channels(),
        composer: new Composer(),
        header: new Header(),
        messages: new Messages()
    }
};

export const updatePreset = {
    expand: {
        width: "100%",
        left: "0%"
    },

    shrink: {
        width: "75%+2",
        left: "25%"
    }
};
