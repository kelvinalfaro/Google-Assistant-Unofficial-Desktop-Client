'use strict';

const electron = require('electron');
const assistantWindow = electron.remote.getCurrentWindow();
const app = electron.remote.app;
const electronShell = electron.shell;
const dialog = electron.remote.dialog;
const ipcRenderer = electron.ipcRenderer;
const recorder = require('node-record-lpcm16');
const path = require('path');
const GoogleAssistant = require('google-assistant');
const { spawn } = require('child_process');
const fs = require('fs');

let player = new Player();
let parser = new DOMParser();

// Assistant config initialization

let userDataPath = app.getPath('userData');
let configFilePath = path.join(userDataPath, 'config.json');
let assistantConfig = {
  "keyFilePath": "",
  "savedTokensPath": "",
  "forceNewConversation": false,
  "enableAudioOutput": true,
  "enableMicOnContinousConversation": true,
  "startAsMaximized": false,
  "launchAtStartup": true,
  "alwaysCloseToTray": true,
  "enablePingSound": true,
  "enableAutoScaling": true
};

let history = [];
let historyHead = -1;
let expanded = false;
let mic;
let webMic = new p5.AudioIn();  // For Audio Visualization
let assistant_input = document.querySelector('#assistant-input');
let assistant_mic = document.querySelector('#assistant-mic');
let init_headline = document.querySelector('#init-headline');
let suggestion_area = document.querySelector('#suggestion-area');
let main_area = document.querySelector('#main-area');
const close_btn = document.querySelector('#close-btn');
const min_btn = document.querySelector('#min-btn');
const expand_collapse_btn = document.querySelector('#expand-collapse-btn');

close_btn.onclick = () => {
  player.stop();
  close();

  if (!assistantConfig["alwaysCloseToTray"]) {
    quitApp();
  }
};

min_btn.onclick = () => assistantWindow.minimize();
expand_collapse_btn.onclick = () => toggleExpandWindow();
document.querySelector('#settings-btn').onclick = openConfig;

//// ---- Status Flag Variables ---- ////

// Assuming sox is installed initially
let isSoxInstalled = true;

// Assuming as first-time user
let isFirstTimeUser = true;

// Initialize Configuration
if (fs.existsSync(configFilePath)) {
  let savedConfig = JSON.parse(fs.readFileSync(configFilePath));
  Object.assign(assistantConfig, savedConfig);

  isFirstTimeUser = false;
}
else {
  // Assuming as first-time user

  main_area.innerHTML = `
    <div class="init">
      <center id="assistant-logo-main-parent">
        <img id="first-time-logo" src="../res/meet_google_assist.svg" alt="">
      </center>

      <div id="init-headline-parent">
        <div id="init-headline">
          Meet your Google Assistant!
        </div>
      </div>

      <div id="first-time-desc-parent">
        <div id="first-time-desc">
          Ask it questions. Tell it to do things. It’s your own personal Google, always ready to help.
        </div>
      </div>
    </div>
  `;

  suggestion_area.innerHTML = '<div class="suggestion-parent"></div>';
  let suggestion_parent = document.querySelector('.suggestion-parent');

  suggestion_parent.innerHTML = `
    <div id="get-started-btn" class="suggestion" onclick="showNextScreen()">
      <span>
        <img src="../res/proceed.svg" style="
          height: 19px;
          width: 16px;
          vertical-align: top;
          padding-right: 10px;"
        >
      </span>
      Get Started
    </div>
  `;
  
  suggestion_parent.querySelector("#get-started-btn").onclick = () => {
    main_area.innerHTML = `
      <div class="init">
        <center id="assistant-logo-main-parent">
          <img id="first-time-logo" src="../res/assistant_sdk_client.svg" alt="">
        </center>

        <div id="init-headline-parent">
          <div id="init-headline">
            Before you start...
          </div>
        </div>

        <div id="first-time-desc-parent">
          <div id="first-time-desc">
            This client is based on Google Assistant SDK. This means that it is limited in its capability and might not be working the same way the official client on phones and other devices works
          </div>
        </div>
      </div>
    `;

    suggestion_area.innerHTML = '<div class="suggestion-parent"></div>';
    let suggestion_parent = document.querySelector('.suggestion-parent');

    suggestion_parent.innerHTML = `
      <div id="proceed-btn" class="suggestion">
        <span>
          <img src="../res/proceed.svg" style="
            height: 19px;
            width: 16px;
            vertical-align: top;
            padding-right: 10px;"
          >
        </span>
        Proceed
      </div>
    `;

    suggestion_area.querySelector("#proceed-btn").onclick = () => {
      // Write the config
      fs.writeFile(
        configFilePath,
        JSON.stringify(assistantConfig),
        () => console.log('Config File was added to userData path')
      );
  
      relaunchAssistant();
    };
  };

  // If the user is opening the app for the first time,
  // throw `Exception` to prevent Assistant initialization 

  if (isFirstTimeUser) throw Error("First Time User: Halting Initialization")
}

if(assistantConfig["startAsMaximized"]) {
  toggleExpandWindow();
}

const config = {
  auth: {
    keyFilePath: assistantConfig["keyFilePath"],
    // where you want the tokens to be saved
    // will create the directory if not already there
    savedTokensPath: assistantConfig["savedTokensPath"],
    tokenInput: showGetTokenScreen
  },
  // this param is optional, but all options will be shown
  conversation: {
    audio: {
      encodingIn: 'LINEAR16', // supported are LINEAR16 / FLAC (defaults to LINEAR16)
      sampleRateIn: 16000, // supported rates are between 16000-24000 (defaults to 16000)
      encodingOut: 'MP3', // supported are LINEAR16 / MP3 / OPUS_IN_OGG (defaults to LINEAR16)
      sampleRateOut: 24000, // supported are 16000 / 24000 (defaults to 24000)
    },
    lang: 'en-US', // language code for input/output (defaults to en-US)
    deviceModelId: '', // use if you've gone through the Device Registration process
    deviceId: '', // use if you've gone through the Device Registration process
    // textQuery: "", // if this is set, audio input is ignored
    isNew: assistantConfig["forceNewConversation"], // set this to true if you want to force a new conversation and ignore the old state
    screen: {
      isOn: true, // set this to true if you want to output results to a screen
    },
  },
};

let assistant;

try {
  assistant = new GoogleAssistant(config.auth);
}
catch (err) {
  if (err.message.startsWith('Cannot find module')) {
    // Auth file does not exist
    console.log("Auth does not exist!!");

    displayErrorScreen({
      title: 'Authentication Failure',
      details: 'The Key file provided either does not exist or is not accessible. Please check the path to the file.',
      subdetails: 'Error: Key file not found'
    });

    let suggestion_parent = document.querySelector('.suggestion-parent');

    suggestion_parent.innerHTML = `
      <div class="suggestion" onclick="openConfig()">
        <span>
          <img src="../res/settings.svg" style="
            height: 20px;
            width: 20px;
            vertical-align: top;
            padding-right: 10px;"
          >
        </span>
        Open Settings
      </div>
    `;
  }

  else if (err.name == 'TypeError') {
    // Invalid Auth file
    console.log("Auth is INVALID");

    displayErrorScreen({
      title: 'Authentication Failure',
      details: 'The Key file provided is not valid. Make sure the file is of the form "client_secret_&lt;your_id&gt;.apps.googleusercontent.com.json"',
      subdetails: 'Error: Invalid Key file'
    });

    let suggestion_parent = document.querySelector('.suggestion-parent');

    suggestion_parent.innerHTML = `
      <div class="suggestion" onclick="openConfig()">
        <span>
          <img src="../res/settings.svg" style="
            height: 20px;
            width: 20px;
            vertical-align: top;
            padding-right: 10px;"
          >
        </span>
        Open Settings
      </div>
    `;
  }

  else {
    // Unexpected Error

    displayErrorScreen({
      title: 'Unexpected Exception Occured',
      details: 'The Assistant failed to initialize due to some unexpected error. Try reloading the assistant.',
      subdetails: 'Error: Assistant init failed'
    });

    let suggestion_parent = document.querySelector('.suggestion-parent');

    suggestion_parent.innerHTML = `
      <div class="suggestion" onclick="relaunchAssistant()">
        <span>
          <img src="../res/refresh.svg" style="
            height: 20px;
            width: 20px;
            vertical-align: top;
            padding-right: 5px;"
          >
        </span>
        Relaunch Assistant
      </div>
    `;
  }
}

if (assistantConfig["keyFilePath"] == "") {
  // If no Auth File is provided, show getting started screen

  main_area.innerHTML = `
    <div class="fade-in-from-bottom">
      <div style="margin: 30px 10px 8px 10px;">
        <div style="
          font-size: 30px;
          margin-top: 30px;
        ">
          Hey, there!
        </div>
        <div style="
          font-size: 21px;
          color: #ffffff80;
        ">
          You don't seem to have an Authentication File...
        </div>
      </div>
      <div class="no-auth-grid">
        <div class="no-auth-grid-icon">
          <img src="../res/auth.svg" alt="Auth" />
        </div>
        <div class="no-auth-grid-info">
          <div>
            To use this Google Assistant Desktop Client:
          </div>

          <ol style="padding-left: 30px; color: #ffffff80;">
            <li>You must complete the Device Registration process</li>
            <li>Download the required Authentication and Token File.</li>
            <li>Go to "Settings" in the top left corner and set the "Key File Path" and "Saved Tokens Path" to the location where the file is downloaded.</li>
          </ol>
        </div>
      </div>
    </div>
  `;

  let suggestion_parent = document.querySelector('.suggestion-parent');
  let cli_register_link = "https://developers.google.com/assistant/sdk/reference/device-registration/register-device-manual";
  let gui_register_link = "https://developers.google.com/assistant/sdk/guides/library/python/embed/config-dev-project-and-account";

  suggestion_parent.innerHTML = `
    <span style="
      color: #ffffff80;
      margin-right: 5px;
      font-size: 18px;
    ">
      How to register your device?
    </span>

    <div
      class="suggestion"
      onclick="openLink('${gui_register_link}')"
    >
      <span>
        <img src="../res/open_link.svg" style="
          height: 15px;
          width: 15px;
          vertical-align: text-top;
          padding-right: 5px;
          padding-top: 2px;"
        >
      </span>
      Using Registration UI
    </div>

    <div
      class="suggestion"
      onclick="openLink('${cli_register_link}')"
    >
      <span>
        <img src="../res/open_link.svg" style="
          height: 15px;
          width: 15px;
          vertical-align: text-top;
          padding-right: 5px;
          padding-top: 2px;"
        >
      </span>
      Manually with CLI tool
    </div>
  `;

  assistant_mic.id = '';
  assistant_mic.classList.add('assistant-mic-disabled');
}

// starts a new conversation with the assistant
const startConversation = (conversation) => {
  // setup the conversation and send data to it
  // for a full example, see `examples/mic-speaker.js`

  conversation
    .on('audio-data', (data) => {
      // do stuff with the audio data from the server
      // usually send it to some audio output / file

      if (assistantConfig["enableAudioOutput"]) {
        console.log(data);
        player.appendBuffer(Buffer.from(data));
      }
    })
    .on('end-of-utterance', () => {
      // do stuff when done speaking to the assistant
      // usually just stop your audio input
      stopMic();

      console.log("Loading results...");
    })
    .on('transcription', (data) => {
      // do stuff with the words you are saying to the assistant

      console.log(">", data, '\r')

      suggestion_area.innerHTML = `
        <center>
          <span style="
            color: ${(!data.done) ? "#ffffff80" : "#ffffff"};
            font-size: 20px"
          >
            ${data.transcription}
          </span>
        </center>
      `

      if (data.done) {
        setQueryTitle(data.transcription);
        if (assistantConfig["enablePingSound"]) player.playPingSuccess();
      }
    })
    .on('response', (text) => {
      // do stuff with the text that the assistant said back
      // console.log("Assistant Said: ", text);
    })
    .on('volume-percent', (percent) => {
      // do stuff with a volume percent change (range from 1-100)
    })
    .on('device-action', (action) => {
      // if you've set this device up to handle actions, you'll get that here
      console.log("Device Actions:")
      console.log(action)
    })
    .on('screen-data', (screen) => {
      // if the screen.isOn flag was set to true, you'll get the format and data of the output
      displayScreenData(screen, true);
    })
    .on('ended', (error, continueConversation) => {
      // once the conversation is ended, see if we need to follow up

      player.play();
      
      if (error) {
        console.log('Conversation Ended Error:', error);
      }

      else if (continueConversation && isSoxInstalled && assistantConfig["enableMicOnContinousConversation"]) {
        player.audioPlayer.addEventListener('waiting', () => assistant_mic.onclick());
      }

      else {
        console.log('Conversation Complete')
      };

      init_headline.innerText = 'Hi! How can I help?';
    })
    .on('error', error => {
      console.error(error);

      if (error.details != 'Service unavailable.') {
        suggestion_area.innerHTML = '<div class="suggestion-parent"></div>';
        let suggestion_parent = document.querySelector('.suggestion-parent');

        if (error.code == 14) {
          if (error.details.indexOf('No access or refresh token is set') == -1) {
            displayErrorScreen({
              icon: {
                path: '../res/offline_icon.svg'
              },
              title: 'You are Offline!',
              details: 'Please check your Internet Connection...',
              subdetails: `Error: ${error.details}`
            });

            let networkPrefURL = (process.platform == 'darwin')
                                    ? "x-apple.systempreferences:com.apple.preferences.sharing?Internet"
                                    : (process.platform == 'win32')
                                      ? "ms-settings:network-status"
                                      : '';

            if (process.platform == 'win32' || process.platform == 'darwin') {
              suggestion_parent.innerHTML += `
                <div class="suggestion" onclick="openLink('${networkPrefURL}')">
                  <span>
                    <img src="../res/troubleshoot.svg" style="
                      height: 20px;
                      width: 20px;
                      vertical-align: top;
                      padding-right: 5px;"
                    >
                  </span>
                  Network Preferences
                </div>
              `;
            }

            suggestion_parent.innerHTML = `
              <div class="suggestion" onclick="retryRecent(false)">
                <span>
                  <img src="../res/refresh.svg" style="
                    height: 20px;
                    width: 20px;
                    vertical-align: top;
                    padding-right: 5px;"
                  >
                </span>
                Retry
              </div>
            ` + suggestion_parent.innerHTML;
          }
          else {
            // Invalid Saved Tokens

            displayErrorScreen({
              title: 'Invalid Tokens!',
              details: `${(assistantConfig["savedTokensPath"] == "")
                          ? "No Token file was provided. Please provide a Token file in the settings under 'Saved Token Path'."
                          : "The Token file provided is not valid. Please check the path under 'Saved Token Path' in settings."
                        }`,
              subdetails: 'Error: No access or refresh token is set'
            });

            let suggestion_parent = document.querySelector('.suggestion-parent');

            suggestion_parent.innerHTML = `
              <div class="suggestion" onclick="openConfig()">
                <span>
                  <img src="../res/settings.svg" style="
                    height: 20px;
                    width: 20px;
                    vertical-align: top;
                    padding-right: 10px;"
                  >
                </span>
                Open Settings
              </div>
            `;
          }
        }

        historyHead = history.length;

        // Deactivate the `loading bar`
        deactivateLoader();

        // Stop Microphone
        stopMic();
      }
    });
};

// will start a conversation and wait for audio data
// as soon as it's ready
assistant
  .on('started', (conversation) => {
    console.log("Assistant Started!");
    startConversation(conversation);

    // Stop Assistant Response Playback
    player.stop();

    // Mic Setup
    if (config.conversation.textQuery === undefined) {
      console.log('STARTING MIC...');
      if (assistantConfig["enablePingSound"]) player.playPingStart();
      init_headline.innerText = 'Listening...';

      // Set `webMic` for visulaization
      webMic.start();
      let assistant_mic_parent = document.querySelector('#assistant-mic-parent');

      assistant_mic_parent.outerHTML = `
      <div id="assistant-mic-parent" class="fade-scale">
        <div id="amp-bar-group">
            <div class="amp-bar" style="background-color: #4285F4;"></div>
            <div class="amp-bar" style="background-color: #EA4335;"></div>
            <div class="amp-bar" style="background-color: #FBBC05;"></div>
            <div class="amp-bar" style="background-color: #34A853;"></div>
        </div>
      </div>`;

      // Add Event Listener to Stop Mic

      let amp_bar_group = document.querySelector('#assistant-mic-parent');

      amp_bar_group.onclick = () => {
        stopMic();
        if (assistantConfig["enablePingSound"]) player.playPingStop();
      };

      // Setup mic for recording

      mic = recorder.record({ threshold: 0, device: 'default' });

      mic.stream().on('data', (data) => {
        conversation.write(data);

        const amp_threshold = 0.17;
        let amp = webMic.getLevel();
        let amp_bar_list = document.querySelectorAll('.amp-bar');

        amp_bar_list[0].setAttribute('style', `
          background-color: #4285F4;
          height: ${constrain(map(amp, 0, amp_threshold, 6, 25), 6, 25)}px;`
        );

        amp_bar_list[1].setAttribute('style', `
          background-color: #EA4335;
          height: ${constrain(map(amp, 0, amp_threshold, 6, 15), 6, 15)}px;`
        );

        amp_bar_list[2].setAttribute('style', `
          background-color: #FBBC05;
          height: ${constrain(map(amp, 0, amp_threshold, 6, 30), 6, 30)}px;">`
        );

        amp_bar_list[3].setAttribute('style', `
          background-color: #34A853;
          height: ${constrain(map(amp, 0, amp_threshold, 6, 20), 6, 20)}px;`
        );
      });
    }
  })
  .on('error', (err) => {
    console.log('Assistant Error:', err);
    let currentHTML = document.querySelector('body').innerHTML;

    if (assistantConfig["savedTokensPath"] != "") {
      displayErrorScreen({
        title: 'Unexpected Exception Occured',
        details: 'An unexpected error occurred.',
        subdetails: `Error: ${err.message}`
      });

      historyHead = history.length;

      function closeCurrentScreen() {
        let currentDOM = parser.parseFromString(currentHTML, "text/html");

        main_area.innerHTML = currentDOM.querySelector('#main-area').innerHTML;
        suggestion_area.innerHTML = currentDOM.querySelector('#suggestion-area').innerHTML;

        historyHead--;

        if (historyHead == -1) {
          document.querySelector('.app-title').innerText = "";
        }
      }

      let suggestion_parent = document.querySelector('.suggestion-parent');

      suggestion_parent.innerHTML = `
        <div class="suggestion" onclick="relaunchAssistant()">
          <span>
            <img src="../res/refresh.svg" style="
              height: 20px;
              width: 20px;
              vertical-align: top;
              padding-right: 5px;"
            >
          </span>
          Relaunch Assistant
        </div>
        <div id="ignore-btn" class="suggestion">
          Ignore
        </div>
      `;

      document.querySelector('#ignore-btn').onclick = closeCurrentScreen;
    }
    else {
      // No tokens specified

      displayErrorScreen({
        title: "Tokens not found!",
        details: "No Token file was provided. Please provide a Token file in the settings under 'Saved Token Path'.",
        subdetails: "Error: No access or refresh token is set"
      });

      let suggestion_parent = document.querySelector('.suggestion-parent');

      suggestion_parent.innerHTML = `
        <div class="suggestion" onclick="openConfig()">
          <span>
            <img src="../res/settings.svg" style="
              height: 20px;
              width: 20px;
              vertical-align: top;
              padding-right: 10px;"
            >
          </span>
          Open Settings
        </div>
      `;
    }

    setTimeout(deactivateLoader, 200);
  })

/* User-Defined Functions */

/**
 * Escapes the quotation marks in the `string` for use in HTML.
 * @param {String} string
 */
function escapeQuotes(string) {
  string = string.replace(/["]/g, '&quot;');
  string = string.replace(/[']/g, '&#39;');

  return string;
}

/**
 * Classifies the response string provided by the assistant
 * and returns an `Object` containing the type of the
 * response and various parts of the response.
 * 
 * @param {String} assistantResponseString
 * The response that has to be classified
 */
function inspectResponseType(assistantResponseString) {
  let googleTopResultRegex = /"(.*)" \(\s?(.+) - (.+?)\s?\)(?:\\n(.+))?/;
  let youtubeResultRegex = /(.+) \[(.+)\] \(\s?(.+?)\s?\)(?:\n---\n([^]+))?/;

  let searchResultMatch = assistantResponseString.match(googleTopResultRegex);
  let youtubeMatch = assistantResponseString.match(youtubeResultRegex);

  let isGoogleTopSearchResult = (searchResultMatch != null)
                                ? (assistantResponseString == searchResultMatch[0])
                                : false;

  let isYoutubeResult = (youtubeMatch != null)
                        ? (youtubeMatch[3].startsWith('https://m.youtube.com/watch?v='))
                        : false;

  let dataObject = {
    "type": (isYoutubeResult)
              ? "youtube-result"
              : (isGoogleTopSearchResult)
                ? "google-search-result"
                : null,

    "searchResultParts": (isYoutubeResult)
                            ? youtubeMatch.slice(1)
                            : (isGoogleTopSearchResult)
                              ? searchResultMatch.slice(1, 5)
                              : null,

    "assistantResponseString": assistantResponseString
  };

  // console.log(dataObject);
  return dataObject;
}

/**
 * Opens a `link` in the default browser.
 * 
 * @param {String} link
 * Link that is to be opened in the browser.
 * 
 * @param {Boolean} autoMinimizeAssistantWindow
 * Minimize the Assistant Window after the link is opened
 */
function openLink(link, autoMinimizeAssistantWindow=true) {
  electronShell.openExternal(link);

  if (autoMinimizeAssistantWindow) {
    assistantWindow.minimize();
  }
}

/**
 * Jumps to any result in `history` using `historyIndex`
 * @param {Number} historyIndex
 */
function seekHistory(historyIndex) {
  historyHead = historyIndex;

  let historyItem = history[historyHead];
  displayScreenData(historyItem["screen-data"]);
  setQueryTitle(historyItem["query"]);

  deactivateLoader();
  updateNav();
}

/**
 * Decrements the `historyHead` and then shows previous result from the `history`
 * 
 * @returns {Boolean}
 * `true` if successfully jumps to previous result, `false` otherwise.
 */
function jumpToPrevious() {
  if (historyHead > 0) {
    historyHead--;
    seekHistory(historyHead);

    return true;
  }

  return false;
}

/**
 * Increments the `historyHead` and then shows next result from the `history`
 * 
 * @returns {Boolean}
 * `true` if successfully jumps to next result, `false` otherwise.
 */
function jumpToNext() {
  if (historyHead < history.length - 1) {
    historyHead++;
    seekHistory(historyHead);

    return true;
  }

  return false;
}

/**
 * Callback for file selection.
 * 
 * @callback fileDialogCallback 
 * @param {String[]} filePaths
 * @param {String[]} bookmarks
 */

/**
 * Opens dialog for selecting file (JSON)
 * 
 * @param {fileDialogCallback} callback
 * The function called after a file is selected.
 * 
 * @param {String} openDialogTitle
 * The Title for the dialog box.
 */
function openFileDialog(callback, openDialogTitle=null) {
  dialog.showOpenDialog(assistantWindow, {
    title: openDialogTitle,
    filters: [
      { name: 'JSON File', extensions: ['json'] }
    ],
    properties: ['openFile']
  }, (filePaths, bookmarks) => callback(filePaths, bookmarks));
}

/**
 * Saves the `config` in the 'User Data' to retrieve
 * it the next time Assistant is launched.
 * 
 * @param {*} config
 * Pass config as an object or pass `null` to consider `asssistantConfig`
 */
function saveConfig(config=null) {
  fs.writeFile(
    configFilePath,
    JSON.stringify(
      (!config) ? assistantConfig : config
    ),
    () => {
      console.log('Updated Config');
      displayQuickMessage("Settings Updated!");
    }
  );
}

/**
 * Opens the 'Settings' screen
 */
function openConfig() {
  if (!document.querySelector('#config-screen')) {
    let currentHTML = document.querySelector('body').innerHTML;

    main_area.innerHTML = `
      <div id="config-screen" class="fade-in-from-bottom">
        <div style="
          font-size: 35px;
          font-weight: bold;
          margin: 0 10px;
        ">
          Settings
        </div>

        <div style="padding: 30px 0">
          <div class="setting-label">
            AUTHENTICATION
            <hr />
          </div>
          <div class="setting-item">
            <div class="setting-key">
              Key File Path

              <span style="
                vertical-align: sub;
                margin-left: 10px;
              ">
                <img 
                  src="../res/help.svg"
                  title="Your OAuth 2 Credentials.\nFile: 'client_secret_&lt;your_id&gt;.apps.googleusercontent.com.json'"
                >
              </span>
            </div>
            <div class="setting-value">
              <input id="key-file-path" class="config-input" placeholder="Path to 'Key File'" />
              <label id="key-file-path-browse-btn" class="button">
                Browse
              </label>
            </div>
          </div>
          <div class="setting-item">
            <div class="setting-key">
              Saved Tokens Path

              <span style="
                vertical-align: sub;
                margin-left: 10px;
              ">
                <img 
                  src="../res/help.svg"
                  title="The Token file provided by Google.\nFile: 'tokens.json'"
                >
              </span>
            </div>
            <div class="setting-value">
              <input id="saved-tokens-path" class="config-input" placeholder="Path to 'Saved Tokens'" />
              <label id="saved-tokens-path-browse-btn" class="button">
                Browse
              </label>
            </div>
          </div>
          <div class="setting-label">
            CONVERSATION
            <hr />
          </div>
          <div class="setting-item">
            <div class="setting-key">
              Force New Conversation

              <span style="
                vertical-align: sub;
                margin-left: 10px;
              ">
                <img 
                  src="../res/help.svg"
                  title="Turn it off if you want the assistant to remember the context."
                >
              </span>
            </div>
            <div class="setting-value" style="height: 35px;">
              <label class="switch">
                <input id="new-conversation" type="checkbox">
                <span class="slider round"></span>
              </label>
            </div>
          </div>
          <div class="setting-item">
            <div class="setting-key">
              Enable Audio Output

              <span style="
                vertical-align: sub;
                margin-left: 10px;
              ">
                <img 
                  src="../res/help.svg"
                  title="Mutes/Unmutes Assistant's voice"
                >
              </span>
            </div>
            <div class="setting-value" style="height: 35px;">
              <label class="switch">
                <input id="audio-output" type="checkbox">
                <span class="slider round"></span>
              </label>
            </div>
          </div>
          <div class="setting-item">
            <div class="setting-key">
              Enable microphone on Continous Conversation

              <span style="
                vertical-align: sub;
                margin-left: 10px;
              ">
                <img 
                  src="../res/help.svg"
                  title="Turns on microphone when the Assistant is expecting immediate response."
                >
              </span>
            </div>
            <div class="setting-value" style="height: 35px;">
              <label class="switch">
                <input id="continous-conv-mic" type="checkbox">
                <span class="slider round"></span>
              </label>
            </div>
          </div>
          <div class="setting-label">
            WINDOW
            <hr />
          </div>
          <div class="setting-item">
            <div class="setting-key">
              Start as Maximized

              <span style="
                vertical-align: sub;
                margin-left: 10px;
              ">
                <img 
                  src="../res/help.svg"
                  title="Maximizes the Assistant Window everytime you start it."
                >
              </span>
            </div>
            <div class="setting-value" style="height: 35px;">
              <label class="switch">
                <input id="start-maximized" type="checkbox">
                <span class="slider round"></span>
              </label>
            </div>
          </div>
          <div class="setting-item">
            <div class="setting-key">
              Enable Auto Scaling

              <span style="
                vertical-align: sub;
                margin-left: 10px;
              ">
                <img 
                  src="../res/help.svg"
                  title="Automatically scales the screen data provided by Google Assistant SDK optimizing it to display in the window.\nSome contents will still be auto scaled for legibility."
                >
              </span>
            </div>
            <div class="setting-value" style="height: 35px;">
              <label class="switch">
                <input id="auto-scale" type="checkbox">
                <span class="slider round"></span>
              </label>
            </div>
          </div>
          <div class="setting-label">
            ACCESSIBILTY
            <hr />
          </div>
          <div class="setting-item">
            <div class="setting-key">
              Enable 'ping' feedback sound for microphone

              <span style="
                vertical-align: sub;
                margin-left: 10px;
              ">
                <img 
                  src="../res/help.svg"
                  title="Plays a ping sound whenever the Assistant microphone is activated/deactivated."
                >
              </span>
            </div>
            <div class="setting-value" style="height: 35px;">
              <label class="switch">
                <input id="ping-sound" type="checkbox">
                <span class="slider round"></span>
              </label>
            </div>
          </div>
          <div class="setting-label">
            APPLICATION
            <hr />
          </div>
          <div class="setting-item">
            <div class="setting-key">
              Launch At Startup

              <span style="
                vertical-align: sub;
                margin-left: 10px;
              ">
                <img 
                  src="../res/help.svg"
                  title="Controls if the Assistant can launch on system startup."
                >
              </span>
            </div>
            <div class="setting-value" style="height: 35px;">
              <label class="switch">
                <input id="launch-at-startup" type="checkbox">
                <span class="slider round"></span>
              </label>
            </div>
          </div>
          <div class="setting-item">
            <div class="setting-key">
              Always Close to Tray

              <span style="
                vertical-align: sub;
                margin-left: 10px;
              ">
                <img 
                  src="../res/help.svg"
                  title="Keeps the Assistant in background even when it is closed."
                >
              </span>
            </div>
            <div class="setting-value" style="height: 35px;">
              <label class="switch">
                <input id="close-to-tray" type="checkbox">
                <span class="slider round"></span>
              </label>
            </div>
          </div>
          <div class="setting-item">
            <div class="setting-key">
              Relaunch Assistant
            </div>
            <div class="setting-value" style="height: 35px;">
              <label class="button" onclick="relaunchAssistant()">
                <span>
                  <img src="../res/refresh.svg" style="
                    height: 20px;
                    width: 20px;
                    vertical-align: middle;
                    padding-right: 5px;"
                  >
                </span>
                Relaunch Assistant
              </label>
            </div>
          </div>
          <div class="setting-item">
            <div class="setting-key">
              Quit from Tray

              <span style="
                vertical-align: sub;
                margin-left: 10px;
              ">
                <img 
                  src="../res/help.svg"
                  title="Completely exit the Assistant (even from background)"
                >
              </span>
            </div>
            <div class="setting-value" style="height: 35px;">
              <label class="button" onclick="quitApp()">
                Quit
              </label>
            </div>
          </div>
          <div class="setting-item">
            <div class="setting-key">
              Version
            </div>
            <div class="setting-value" style="height: 35px;">
              <div class="disabled">
                v${app.getVersion()}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    let keyFilePathInput = main_area.querySelector('#key-file-path');
    let savedTokensPathInput = main_area.querySelector('#saved-tokens-path');
    let forceNewConversationCheckbox = document.querySelector('#new-conversation');
    let enableAudioOutput = document.querySelector('#audio-output');
    let enableMicOnContinousConversation = document.querySelector('#continous-conv-mic');
    let startAsMaximized = document.querySelector('#start-maximized');
    let launchAtStartUp = document.querySelector('#launch-at-startup');
    let alwaysCloseToTray = document.querySelector('#close-to-tray');
    let enablePingSound = document.querySelector('#ping-sound');
    let enableAutoScaling = document.querySelector('#auto-scale');

    keyFilePathInput.addEventListener('focusout', () => validatePathInput(keyFilePathInput));
    savedTokensPathInput.addEventListener('focusout', () => validatePathInput(savedTokensPathInput));

    keyFilePathInput.value = assistantConfig["keyFilePath"];
    savedTokensPathInput.value = assistantConfig["savedTokensPath"];
    forceNewConversationCheckbox.checked = assistantConfig["forceNewConversation"];
    enableAudioOutput.checked = assistantConfig["enableAudioOutput"];
    enableMicOnContinousConversation.checked = assistantConfig["enableMicOnContinousConversation"];
    startAsMaximized.checked = assistantConfig["startAsMaximized"];
    launchAtStartUp.checked = assistantConfig["launchAtStartup"];
    alwaysCloseToTray.checked = assistantConfig["alwaysCloseToTray"];
    enablePingSound.checked = assistantConfig["enablePingSound"];
    enableAutoScaling.checked = assistantConfig["enableAutoScaling"];

    main_area.querySelector('#key-file-path-browse-btn').onclick = () => {
      openFileDialog(
        (filePaths) => {
          keyFilePathInput.value = filePaths[0];
        },
        "Select Key File"
      );
    };

    main_area.querySelector('#saved-tokens-path-browse-btn').onclick = () => {
      openFileDialog(
        (filePaths) => {
          savedTokensPathInput.value = filePaths[0];
        },
        "Select Saved Token File"
      );
    };

    validatePathInput(keyFilePathInput);
    validatePathInput(savedTokensPathInput);

    suggestion_area.innerHTML = '<div class="suggestion-parent"></div>';
    let suggestion_parent = document.querySelector('.suggestion-parent');

    suggestion_parent.innerHTML = `
      <div id="save-config" class="suggestion">
        <span>
          <img src="../res/done.svg" style="
            height: 20px;
            width: 20px;
            vertical-align: top;
            padding-right: 5px;"
          >
        </span>
        Save
      </div>

      <div id="cancel-config-changes" class="suggestion">
        Cancel
      </div>
    `;

    historyHead++;

    function closeCurrentScreen() {
      let currentDOM = parser.parseFromString(currentHTML, "text/html");

      main_area.innerHTML = currentDOM.querySelector('#main-area').innerHTML;
      suggestion_area.innerHTML = currentDOM.querySelector('#suggestion-area').innerHTML;

      historyHead--;

      if (historyHead == -1) {
        document.querySelector('.app-title').innerText = "";
      }
    }

    document.querySelector('#cancel-config-changes').onclick = () => {
      closeCurrentScreen();
    }

    document.querySelector('#save-config').onclick = () => {
      if (validatePathInput(keyFilePathInput, true) &&
          validatePathInput(savedTokensPathInput, true)
      ) {
        // Determine if relaunch is required
        
        let relaunchRequired = false;

        if (keyFilePathInput.value != assistantConfig["keyFilePath"] ||
            savedTokensPathInput.value != assistantConfig["savedTokensPath"]) {
          relaunchRequired = true;
        }

        // Set the `assistantConfig` as per the settings

        assistantConfig["keyFilePath"] = keyFilePathInput.value;
        assistantConfig["savedTokensPath"] = savedTokensPathInput.value;
        assistantConfig["forceNewConversation"] = forceNewConversationCheckbox.checked;
        assistantConfig["enableAudioOutput"] = enableAudioOutput.checked;
        assistantConfig["enableMicOnContinousConversation"] = enableMicOnContinousConversation.checked;
        assistantConfig["startAsMaximized"] = startAsMaximized.checked;
        assistantConfig["launchAtStartup"] = launchAtStartUp.checked;
        assistantConfig["alwaysCloseToTray"] = alwaysCloseToTray.checked;
        assistantConfig["enablePingSound"] = enablePingSound.checked;
        assistantConfig["enableAutoScaling"] = enableAutoScaling.checked;

        // Apply settings for appropriate options

        config.conversation.isNew = assistantConfig["forceNewConversation"];

        app.setLoginItemSettings({
          openAtLogin: assistantConfig["launchAtStartup"]
        });

        // Save and exit screen

        saveConfig();
        closeCurrentScreen();

        // Request user to relaunch assistant if necessary

        if (relaunchRequired) {
          displayErrorScreen(
            {
              icon: {
                path: '../res/refresh.svg',
                style: 'height: 100px;'
              },
              title: 'Relaunch Required',
              details: 'A relaunch is required for changes to take place',
              subdetails: 'Info: Settings changed'
            }
          );

          let suggestion_parent = document.querySelector('.suggestion-parent');

          suggestion_parent.innerHTML = `
            <div class="suggestion" onclick="relaunchAssistant()">
              <span>
                <img src="../res/refresh.svg" style="
                  height: 20px;
                  width: 20px;
                  vertical-align: top;
                  padding-right: 5px;"
                >
              </span>
              Relaunch Assistant
            </div>
          `;
        }
      }
    }
  }
}

/**
 * Updates the Navigation: 'Next' and 'Previous' buttons
 */
function updateNav() {
  let newNav = `
    <img
      id="prev-btn"
      class="${(historyHead <= 0) ? 'disabled': 'ico-btn '}"
      type="icon"
      src="../res/prev_btn.svg"
      alt="Previous Result"
    >

    <img
      id="next-btn"
      class="${(historyHead >= history.length - 1) ? 'disabled' : 'ico-btn '}"
      type="icon"
      src="../res/next_btn.svg"
      alt="Next Result"
    >

    <img 
      id="settings-btn"
      class="ico-btn"
      type="icon"
      src="../res/settings_btn.svg"
      alt="Settings"
    >
  `;

  document.querySelector('#nav-region').innerHTML = newNav;
  document.querySelector('#prev-btn').onclick = jumpToPrevious;
  document.querySelector('#next-btn').onclick = jumpToNext;
  document.querySelector('#settings-btn').onclick = openConfig;
}

/**
 * Ask a `query` from assistant in text.
 * @param {String} query
 */
function assistantTextQuery(query) {
  player.stop();
  
  config.conversation["textQuery"] = query;
  assistant.start(config.conversation);
  setQueryTitle(query);

  stopMic();
}

/**
 * Set the `query` in titlebar
 * @param {String} query
 */
function setQueryTitle(query) {
  let init = document.querySelector(".init");

  if (init != null) {
    init.innerHTML = `
      <center id="assistant-logo-main-parent" style="margin-top: 80px;">
        <img id="assistant-logo-main" src="../res/Google_Assistant_logo.svg" alt="">
      </center>`;
  }

  document.querySelector('.app-title').innerHTML = `
    <span class="fade-in-from-bottom">
      ${query}
    </span>`;

  activateLoader();
}

/**
 * Returns the title displayed in the 'titlebar'
 * @returns {String} Title
 */
function getCurrentQuery() {
  return document.querySelector('.app-title').innerText;
}

/**
 * Retry/Refresh result for the query displayed in the titlebar
 * 
 * @param {Boolean} popHistory
 * Remove the recent result from history and replace it with the refreshed one.
 */
function retryRecent(popHistory=true) {
  (popHistory) ? history.pop() : null;
  assistantTextQuery(getCurrentQuery());
}

/**
 * Display a preloader near the titlebar to notify
 * user that a task is being performed.
 */
function activateLoader() {
  let loader_area = document.querySelector('#loader-area');
  loader_area.classList.value = "loader";
}

/**
 * Make the preloader near the titlebar disappear
 * once the task is completed.
 */
function deactivateLoader() {
  let loader_area = document.querySelector('#loader-area');
  loader_area.classList.value = "";
}

/**
 * Displays Error Screen.
 * 
 * @param {Object} opts
 * Options to be passed to define and customize the error screen
 * 
 * @param {String=} opts.errContainerId
 * Set the `id` of error container
 * 
 * @param {Object} opts.icon
 * The icon object
 * 
 * @param {String=} opts.icon.path
 * The Path to the icon to be used as Error Icon
 * 
 * @param {String=} opts.icon.style
 * Additional styles applied to the icon
 * 
 * @param {String=} opts.title
 * The Title of the error
 * 
 * @param {String=} opts.details
 * Description of the error
 * 
 * @param {String=} opts.subdetails
 * Sub-details/Short description of the error
 */
function displayErrorScreen(opts={}) {
  let options = {
    errContainerId: "",
    icon: {
      path: '',
      style: ''
    },
    title: "Error",
    details: "No error description was provided.",
    subdetails: ""
  };

  Object.assign(options, opts);

  let iconObj = {
    path: "../res/warning.svg",
    style: ""
  };

  Object.assign(iconObj, opts.icon);
  options.icon = iconObj;
  
  main_area.innerHTML = `
    <div id="${options.errContainerId}" class="error-area fade-in-from-bottom">
      <img class="err-icon" style="${options.icon.style}" src="${options.icon.path}">

      <div class="err-title">
        ${options.title}
      </div>

      <div class="err-details">
        ${options.details}

        <div class="err-subdetails">
          ${options.subdetails}
        </div>
      </div>
    </div>
  `;
}

/**
 * Process the *Screen Data* and display the `result` and set `suggestions`.
 * 
 * @param {*} screen
 * The screen data provided by Assistant SDK
 * 
 * @param {Boolean} pushToHistory
 * Push the *screen data* to the `history`
 */
function displayScreenData(screen, pushToHistory=false) {
  console.log("SCREEN:");
  console.log(screen);

  deactivateLoader();

  let htmlString = screen.data.toString();
  let htmlDocument = parser.parseFromString(htmlString, "text/html");
  console.log(htmlDocument);

  let mainContentDOM = htmlDocument.querySelector("#assistant-card-content");

  main_area.innerHTML = `
    <div class="assistant-markup-response fade-in-from-bottom">
      ${mainContentDOM.innerHTML}
    </div>`;

  let element = main_area.querySelector('.assistant-markup-response').lastElementChild;

  let hasWebAnswer = main_area.querySelector('#tv_web_answer_root');
  let hasKnowledgePanel = main_area.querySelector('#tv_knowledge_panel_source');
  let hasCarousel = main_area.querySelector('#selection-carousel-tv');
  let hasPhotoCarousel = main_area.querySelector('#photo-carousel-tv');
  let hasPlainText = element.classList.contains('show_text_container');
  let hasDefinition = main_area.querySelector('#flex_text_audio_icon_chunk');

  if (hasCarousel && !hasPhotoCarousel) {
    // Only when there is carousel other than "Photo Carousel"
    document.querySelector('.assistant-markup-response').lastElementChild.innerHTML = hasCarousel.outerHTML;
  }

  if (!hasPlainText) {
    if (assistantConfig["enableAutoScaling"]) {
      element.setAttribute('style', `
        transform: ${(hasKnowledgePanel || hasWebAnswer) ? "scale(0.65)" : "scale(0.75)"};
        position: relative;
        left: ${(hasKnowledgePanel || hasWebAnswer) ? "-15%" : (hasCarousel && !hasPhotoCarousel) ? "-91%" : (hasPhotoCarousel) ? "-26%" : "-10%"};
        top: ${(hasKnowledgePanel) ? "-40px" : (hasWebAnswer) ? "-35px" : (hasDefinition) ? "-70px" : (hasCarousel && !hasPhotoCarousel) ? "-45px" : "-20px"};
        ${(hasCarousel || hasPhotoCarousel)
          ? `overflow-x: scroll; width: 217%;`
          : ``
        }
        ${(hasPhotoCarousel) ? "padding: 2em 0 0 0;" : ""}
      `);
    }
  }
  else {
    element.setAttribute('style', `
      transform: scale(1.2);
      position: relative;
      left: 13%;
      top: 60px;
    `);
  }

  if (assistantConfig["enableAutoScaling"] || hasPlainText) main_area.querySelector('.assistant-markup-response').classList.add('no-x-scroll');

  if (hasDefinition) {
    hasDefinition.setAttribute("onclick", "document.querySelector('audio').play()");
    hasDefinition.setAttribute("style", "cursor: pointer;");
  }

  let existingStyle;

  if (assistantConfig["enableAutoScaling"] || hasPlainText) {
    while (element != null && !hasPhotoCarousel) {
      existingStyle = element.getAttribute('style');
      element.setAttribute('style', ((existingStyle) ? existingStyle : '') + 'padding: 0;');
      element = element.lastElementChild;
    }
  }

  let responseType;

  if (hasPlainText) {
    main_area.innerHTML = `
    <img src="../res/Google_Assistant_logo.svg" style="
      height: 25px;
      position: absolute;
      top: 20px;
      left: 20px;
    ">` + main_area.innerHTML;

    let innerText = document.querySelector(".show_text_content").innerText;
    responseType = inspectResponseType(innerText);

    if (responseType["type"]) {
      let textContainer = document.querySelector(".show_text_container");

      if (responseType["type"] == "google-search-result" ||
          responseType["type"] == "youtube-result") {

        let youtube_thumbnail_url;

        if (responseType["type"] == 'youtube-result') {
          let youtube_video_id = responseType["searchResultParts"][2].match(/.*watch\?v=(.+)/).pop();
          youtube_thumbnail_url = `https://img.youtube.com/vi/${youtube_video_id}/0.jpg`;
        }

        textContainer.innerHTML = `
          <div
            class="google-search-result"
            data-url="${responseType["searchResultParts"][2]}"
          >
            <div style="font-size: 22px;">
              ${responseType["searchResultParts"][0]}
            </div>

            <div style="color: #ffffff80; padding-top: 5px;">
              ${responseType["searchResultParts"][2]}
            </div>

            <hr color="#ffffff" style="opacity: 0.25;">

            <div style="${(responseType["type"] == 'youtube-result') ? "display: flex;" : ""}">
              ${(responseType["type"] == 'youtube-result')
                ? `<img src="` + youtube_thumbnail_url + `" style="
                      height: 131px;
                      margin-right: 15px;
                      border-radius: 10px;
                  ">`
                : ``}
              <div style="padding-top: 10px;">
                ${(responseType["searchResultParts"][3]) ? responseType["searchResultParts"][3].replace(/\\n/g, '<br>') : ""}
              </div>
            </div>
          </div>
        `;
      }
    }
  }
  else {
    responseType = inspectResponseType("");
  }

  let externalLinks = main_area.querySelectorAll('[data-url]');

  for (let i = 0; i < externalLinks.length; i++) {
    let temp = externalLinks[i];
    temp.setAttribute('onclick', `openLink("${temp.getAttribute('data-url')}")`);
    temp.setAttribute('style', 'cursor: pointer;')
  }

  // Set Suggestion Area

  let suggestionsDOM = htmlDocument.querySelector('#assistant-scroll-bar');

  suggestion_area.innerHTML = '<div class="suggestion-parent"></div>';
  let suggestion_parent = document.querySelector('.suggestion-parent');

  if (suggestionsDOM != null) {
    if (responseType["type"] || hasWebAnswer || hasKnowledgePanel) {
      suggestion_parent.innerHTML += `
        <div class="suggestion" onclick="openLink('https://google.com/search?q=${getCurrentQuery()}')">
          <span>
            <img src="../res/google-logo.png" style="
              height: 20px;
              width: 20px;
              vertical-align: top;
              padding-right: 5px;"
            >
          </span>
          Search
        </div>
      `;
    }

    for (let i = 0; i < suggestionsDOM.children.length; i++) {
      let label = suggestionsDOM.children[i].innerText;
      let query = suggestionsDOM.children[i].getAttribute('data-follow-up-query');

      suggestion_parent.innerHTML += `
        <div class="suggestion" onclick="assistantTextQuery(\`${escapeQuotes(query)}\`)">${label}</div>
      `;
    }
  }
  else {
    suggestion_parent.innerHTML = `
      <span style="color: #ffffff80;">
        No Suggestions.
      </span>
    `;
  }

  if (pushToHistory) {
    // Push to History

    history.push({
      "query": getCurrentQuery(),
      "screen-data": screen
    });

    historyHead = history.length - 1;
    updateNav();
  }
}

/**
 * Position the `window` in bottom-center of the screen.
 * 
 * @param {Electron.BrowserWindow} window
 * The Electron Window which has to be positioned.
 */
function autoSetAssistantWindowPosition(window) {
  let width = screen.availWidth;
  let height = screen.availHeight;
  let windowSize = window.getSize();

  window.setPosition(
    (width / 2) - (windowSize[0] / 2),
    (height) - (windowSize[1]) - 10
  );
}

/**
 * Toggle Expand/Collapse Assistant Window.
 */
function toggleExpandWindow() {
  if (!expanded) {
    assistantWindow.setSize(screen.availWidth - 20, 450);
    expand_collapse_btn.setAttribute('src', '../res/collapse_btn.svg'); // Change to 'collapse' icon after expanding
  }
  else {
    assistantWindow.setSize(1000, 420);
    expand_collapse_btn.setAttribute('src', '../res/expand_btn.svg');   // Change to 'expand' icon after collapsing
  }

  autoSetAssistantWindowPosition(assistantWindow);
  expanded = !expanded;
}

/**
 * Relaunch Google Assistant Window.
 */
function relaunchAssistant() {
  ipcRenderer.send('relaunch-assistant');
  console.log('Sent request for relaunch...');
}

/**
 * Quits the application from tray.
 */
function quitApp() {
  ipcRenderer.send('quit-app');
}

/**
 * Displays `message` for short timespan near the `nav region`.
 * 
 * @param {String} message
 * Message that you want to display
 */
function displayQuickMessage(message) {
  let elt = document.createElement('div');
  elt.innerHTML = message;
  
  let nav_region = document.querySelector('#nav-region');
  nav_region.appendChild(elt);
  elt.className = 'quick-msg';
  setTimeout(() => nav_region.removeChild(elt), 5000);
}

/**
 * Adds additional styles to the `inputElement`,
 * giving users visual cue if the input is invalid.
 * 
 * @param {Element} inputElement
 * The target `input` DOM Element to apply the styles on
 * 
 * @param {Boolean} addShakeAnimation
 * Whether additional shaking animation should be applied to the `inputElement`
 */
function markInputAsInvalid(inputElement, addShakeAnimation=false) {
  inputElement.classList.add(['input-err']);

  if (addShakeAnimation) {
    inputElement.classList.add(['shake']);
    setTimeout(() => inputElement.classList.remove(['shake']), 300);
  }
}

/**
 * Revert the styles of `inputElement` if
 * it is already marked as invalid input.
 * 
 * @param {Element} inputElement
 * The target `input` DOM Element
 */
function markInputAsValid(inputElement) {
  inputElement.classList.remove(['input-err']);
}

/**
 * Checks the `inputElement` and returns `true` when the path
 * is valid and exists in the system.
 * 
 * @param {Element} inputElement
 * The `input` DOM Element to be validated
 * 
 * @param {Boolean} addShakeAnimationOnError
 * Add animation to let the user know if the path does not exist
 */
function validatePathInput(inputElement, addShakeAnimationOnError=false) {
  if (inputElement.value != "" &&
      !fs.existsSync(inputElement.value)
  ) {
    markInputAsInvalid(inputElement, addShakeAnimationOnError);
    return false;
  }
  else {
    markInputAsValid(inputElement);
    return true;
  }
}

/**
 * Check if `SoX` is installed (or is available in the environment).
 * This will update the `isSoxInstalled` variable
 * and show error by invoking `showSoxNotInstalledError()`
 */
function _checkSoxInstallation() {
  spawn('sox', ['-v'])
    .once('error', () => {
      isSoxInstalled = false;
      showSoxNotInstalledError();
    });
}

/**
 * This will show the sox-not-installed screen
 */
function showSoxNotInstalledError() {
  let currentHTML = document.querySelector('body').innerHTML;
  
  // This will disable the Assistant Microphone
  assistant_mic.id = '';
  assistant_mic.className = 'assistant-mic-disabled';

  displayErrorScreen({
    errContainerId: "sox-not-installed",
    icon: {
      path: '../res/download_package.svg'
    },
    title: 'A package has to be installed',
    details: 'For using microphone feature, "SoX" has to be installed',
    subdetails: 'Info: sox was not found in environment'
  });

  suggestion_area.innerHTML = '<div class="suggestion-parent"></div>';
  let suggestion_parent = document.querySelector('.suggestion-parent');

  suggestion_parent.innerHTML = `
    <div id="dnld-sox" class="suggestion">
      <span>
        <img src="../res/download.svg" style="
          height: 20px;
          width: 20px;
          vertical-align: top;
          padding-right: 5px;"
        >
      </span>
      Download
    </div>

    <div id="ignore-sox-dnld" class="suggestion">
      Ignore
    </div>
  `;

  historyHead = history.length;

  document.querySelector('#ignore-sox-dnld').onclick = () => {
    let currentDOM = parser.parseFromString(currentHTML, "text/html");

    main_area.innerHTML = currentDOM.querySelector('#main-area').innerHTML;
    suggestion_area.innerHTML = currentDOM.querySelector('#suggestion-area').innerHTML;

    historyHead--;
  }

  document.querySelector('#dnld-sox').onclick = () => {
    openLink('https://sourceforge.net/projects/sox/files/sox/');

    document.querySelector('.err-title').innerText = "After installing...";
    document.querySelector('.err-details').innerText = "Don't forget to close the assistant from tray and restart it again";
    document.querySelector('.err-subdetails').innerText = "";
  }
}

/**
 * Display the "Get Token" screen if no tokens are found.
 * 
 * _(Call is initiated by the Google Assistant auth library)_
 * 
 * @param {Fuction} oauthValidationCallback
 * The callback to process the OAuth Code.
 */
function showGetTokenScreen(oauthValidationCallback) {
  main_area.innerHTML = `
    <div class="fade-in-from-bottom">
      <div class="no-auth-grid" style="margin-top: 60px;">
        <div class="no-auth-grid-icon">
          <img src="../res/auth.svg" alt="Auth" />
        </div>
        <div class="no-auth-grid-info">
          <div style="font-size: 35px;">
            Get token!

            <span
              style="
                cursor: default;
                font-size: 17px;
                padding: 5px 10px;
                background: #ffffff22;
                color: #ffffff80;
                vertical-align: middle;
                border-radius: 5px;
                margin-left: 12px;
              "
              title="This feature might not work"
            >
              Experimental
            </span>
          </div>

          <div style="
            margin-top: 12px;
            color: #ffffff80;
          ">
            A new browser window is being opened.
            Login/Select the Google account which you registered with and paste the authentication code below.
          </div>

          <input
            id="auth-code-input"
            class="config-input"
            placeholder="Paste the code..."
            style="margin-top: 20px;"
          />
        </div>
      </div>
    </div>
  `;

  suggestion_area.innerHTML = '<div class="suggestion-parent"></div>';
  let suggestion_parent = document.querySelector('.suggestion-parent');

  suggestion_parent.innerHTML = `
    <div id="submit-btn" class="suggestion">
      <span>
        <img src="../res/done.svg" style="
          height: 20px;
          width: 20px;
          vertical-align: top;
          padding-right: 5px;"
        >
      </span>
      Submit
    </div>

    <div class="suggestion" onclick="openConfig()">
      Open Settings
    </div>
  `;
  
  suggestion_area.querySelector('#submit-btn').onclick = () => {
    let oauthInput = main_area.querySelector('#auth-code-input');
    let oauthCode = oauthInput.value;

    oauthInput.onchange = () => {markInputAsValid(oauthInput)};

    if (!oauthCode) {
      markInputAsInvalid(oauthInput, true);
      return
    }

    try {
      oauthValidationCallback(oauthCode);
    }
    catch (e) {
      displayErrorScreen(
        {
          title: "Failed to get Tokens",
          details: "Due to some unexpected exception, assistant failed to get the tokens from server.",
          subdetails: "Error: Error getting tokens"
        }
      );
    }
  };
}

/**
 * Stops the microphone for transcription and visualization.
 */
function stopMic() {
  console.log('STOPPING MIC...');
  (mic) ? mic.stop() : null;
  webMic.stop();
  
  init_headline.innerText = 'Hi! How can I help?';

  // Set the `Assistant Mic` icon

  let assistant_mic_parent = document.querySelector('#assistant-mic-parent');
  assistant_mic_parent.outerHTML = `
    <div id="assistant-mic-parent" class="fade-scale">
        <img id="assistant-mic" src="../res/Google_mic.svg" type="icon" alt="Speak">
    </div>
  `;

  // Add Event Listener to the `Assistant Mic`

  assistant_mic = document.querySelector('#assistant-mic');

  assistant_mic.onclick = () => {
    if (config.conversation["textQuery"] !== undefined) {
      delete config.conversation["textQuery"];
    }

    assistant.start(config.conversation);
  }
}

/**
 * Maps the value `n` which ranges between `start1` and `stop1`
 * to `start2` and `stop2`.
 * 
 * @param {Number} n 
 * @param {Number} start1 
 * @param {Number} stop1 
 * @param {Number} start2 
 * @param {Number} stop2 
 */
function map(n, start1, stop1, start2, stop2) {
  return (n - start1) / (stop1 - start1) * (stop2 - start2) + start2;
}

/**
 * Contrain `n` between `high` and `low`
 * 
 * @param {Number} n 
 * @param {Number} low 
 * @param {Number} high 
 */
function constrain(n, low, high) {
  return (n < low) ? low : (n > high) ? high : n;
}

_checkSoxInstallation();

assistant_mic.onclick = () => {
  if (isSoxInstalled) {
    if (config.conversation["textQuery"] !== undefined) {
      delete config.conversation["textQuery"];
    }

    assistant.start(config.conversation);
  }
  else {
    if (!document.querySelector('#sox-not-installed')) {
      showSoxNotInstalledError();
    }
  }
}

assistant_input.addEventListener('keyup', (event) => {
  if (event.keyCode === 13) {
    assistantTextQuery(assistant_input.value);
  }
});