# Super-Modular-Discord-Bot

*Kriz_cold's custom all-purpose Typescript ready Discord bot*

This bot is designed to work with self-contained commands and events, automating the process of adding/removing features to the bot. Once set up, it should be as simple as adding a new file to the commands or events folder, and restarting the bot.

# Registering the bot
*(If you already have a registered bot account, you can skip this)*

**1)** First, you need to create a new application in the Discord Developer Portal:
- Make sure you are logged in to your Discord account on your browser
- Go to https://discord.com/developers/applications and click on "New Application"

![New Application](readmeAssets/img0.png)

**2)** Give your bot a name, and click on "Create"

![Create Bot](readmeAssets/img1.png)

**3)** In the left menu, click on "Bot", here you can set the bot's icon, name, and token

![Bot Tab](readmeAssets/img2.png)

**4)** Enable Privileged Gateway Intents
- Scroll down in the "Bot" section.
- Enable the following options under "Privileged Gateway Intents":
  - ✅ **Presence Intent**
  - ✅ **Server Members Intent**
  - ✅ **Message Content Intent**
- Click **Save Changes**.

--------------------------------------------

# Adding the Bot to Your Server

1. In the Discord Developer Portal, go to **OAuth2** → **URL Generator**.

![OAuth2](readmeAssets/img3.png)

2. Select the following **Scopes**:
   - `bot`
   - `applications.commands`

   <span style="color:gray;">[ i ] *Other scopes for Advanced features can be found in the documentation:* https://discord.com/developers/docs/topics/oauth2#shared-resources-oauth2-scopes
3. Scroll down and select **Bot permissions** based on what your bot needs. *(**Or Administrator** if you aren't sure)*
4. Copy the generated URL and paste it into your browser.
5. Select a server and authorize the bot.

--------------------------------------------

# For hosting

You will need to the bot's **Discord Token**, **Client ID**, and **Guild ID** to **TEST** the bot.

**Client ID**:

- **1)** In the Discord Developer Portal, go to the **[General Information]** tab.

  ![Bot Id](readmeAssets/img5.png)

- **2)** Copy the **APPLICATION ID** and save it for later.

  ![Bot Id 2](readmeAssets/img6.png)


**Discord Token**:

- **1)** In the Discord Developer Portal, go to the **[Bot]** tab.

  ![Bot Tab](readmeAssets/img2.png)
  
- **2)** Then click the [RESET TOKEN] button to generate a new token, and save it for later.

  ![Bot Token](readmeAssets/img4.png)

**Guild ID**:

- **1)** Ensure you have Developer Mode enabled in Discord.
  
  ![Dev Mode](readmeAssets/img7.png)

- **2)** In Discord, go to the server you want to test the bot in.

- **3)** Right-click on the server name and click on "Copy ID".

![Guild Id](readmeAssets/img8.png)



## Host Using Yundera
[ ! ] Work in progress
- Go to the Credentials tab in the Discord bot App, and copy the tokens:
  - **Client ID**
  - **Discord Token**
  - **Test Guild ID**

## Self-Hosting
- To Do
- Create a .env file in the root folder of the bot, and add the following:
```env
DISCORD_TOKEN=*******************
GUILD_ID=*************
CLIENT_ID=************
```
- Replace the asterisks with the respective values

--------------------------------------------

# Running the Bot

## Using Yundera
[ ! ] Work in progress

## Self-Hosting
- To Do

--------------------------------------------

# For Development

## First steps
1) To run the bot, you need to have node.js installed on your computer.
You can download it from https://nodejs.org/en/download/

2) After installing node.js, you need to install the dependencies.
To do that, open the terminal in the bot's folder and install npm:
```bash
cd path/to/bot
npm install
```
*For example:*
```bash
cd C:/GitHub/projects/waterflame-bot
npm install
```
3) To start hosting the bot locally, run:
```bash
npm run dev
```

## Modular environment system
*You can ctrl + click on the following links to go directly to that file inside VSCode*
1) The bot will first run [index.js](./src/index.js)
2) Here the bot will log in, setting up its "intents" (it's permissions)
3) This file will then run [eventHandler.js](./src/handlers/eventHandler.js) to handle events
4) The eventHandler will register all files inside the [events](./src/events) folder, in alphabetical order

*All scripts will use the **name of the folder** as the event name*

*For example, the script [/src/events/**messageCreate**/autoReact.js](./src/events/messageCreate/autoReact.js) will trigger whenever a user sends a message*

5) Once the bot is ready, it will run all **events** inside the [ready](./src/events/ready) folder
6) One of these events is [01registerCommands.js](./src/events/ready/01registerCommands.js), which will register all commands. *(The name of the folders inside the [commands](./src/commands) folder is mostly aesthetic, to keep the code organized)*

**Important! Note that this script's name starts with "01" to ensure it runs first!**

7) [interactionCreate](./src/events/interactionCreate) events will trigger whenever a user interacts with the bot, like sending a command, or clicking a button
8) [handleCommands.js](./src/events/interactionCreate/handleCommands.js) will trigger whenever a user sends a command, this will first validate the existance and permissions of the command, and then run it, for this, command scripts need to be inside the [commands](./src/commands) folder

**Note that we build command as a class "package", to make it easier to manage and add new commands**
```javscript
const commandData = {
  name: "commandName",                    // Required. 1-32 characters, lowercase.
  description: "Command description",     // Required. 1-100 characters. Ignored for context menu commands.
  type: 1,                                // Optional. 1 = Slash command, 2 = User context menu, 3 = Message context menu, 4 Invoke app activity
  options: [],                            // Optional. Command options (subcommands, choices, etc.).
  default_member_permissions: null,       // Optional. Set specific permissions for the command. Use permission bitfields (or `null` for everyone).
  nsfw: false,                            // Optional. Mark command as NSFW (default is false).
};
```
*These are all defined in their respective command files, and is the result of our custom conversion to Discord's API*

*Fore more details, check the [Discord API documentation](https://discord.com/developers/docs/interactions/application-commands)*

## Adding new commands
- As explained in the previous section, commands follow a Per-Folder structure, so, you'll have to add a script inside the [commands](./src/commands) folder, you can use [ping.js](./src/commands/misc/ping.js) as a template:
```javascript
export = {
  name: 'ping',                  // Required. The name of the command (/ping)
  description: 'Pong!',          // Required. The description of the command
  permissionsRequired: [],       // Recommended. Specific permissions required to use the command
  devOnly: false,                // Optional. If true, only the bot owner can use the command
  testOnly: true,                // Optional. If true, the command will only be available in the test server
  options: [],                   // Optional. Command options (subcommands, choices, etc.)


  /*
    Your command initialization code here
    This will run when the bot starts
  */

  const message = "Pong!";

  callback: (client, interaction) => {

    /*
      Your command code here
      This will run when the command is called
    */

    const fullMessage = `${message} ${client.ws.ping}ms.`;
    interaction.reply(fullMessage);
  },
};
```

## Adding new events
- To Do
