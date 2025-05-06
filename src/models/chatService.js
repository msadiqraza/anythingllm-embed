import { fetchEventSource } from "@microsoft/fetch-event-source";
import { v4 } from "uuid";

let jwtToken = "";

const TOKEN_RETRY_INTERVAL_MS = 100;
const MAX_TOKEN_WAIT_DURATION_MS = 10000;

export function setAuthTokenForChatService(token) {
  jwtToken = token;
}

const ChatService = {
  getHeaders: async function () {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = MAX_TOKEN_WAIT_DURATION_MS / TOKEN_RETRY_INTERVAL_MS;

      const tryToGetHeaders = () => {
        if (jwtToken) {
          const headers = {
            "Authorization": `Bearer ${jwtToken}`,
          };
          console.log("Headers:", headers);
          // console.log("Headers:", headers["Authorization"].split(".")[1]);
          resolve(headers);
        } else {
          attempts++;

          if (attempts <= maxAttempts) {
            setTimeout(tryToGetHeaders, TOKEN_RETRY_INTERVAL_MS);
          } else {
            reject(new Error("JWT token not available after maximum wait time."));
          }
        }
      };
      tryToGetHeaders();
    });
  },

  embedSessionHistory: async function (embedSettings, sessionId) {
    const { embedId, baseApiUrl } = embedSettings;
    return await fetch(`${baseApiUrl}/${embedId}/${sessionId}`, {
      headers: await this.getHeaders(),
    })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Invalid response from server");
      })
      .then((res) => {
        return res.history.map((msg) => ({
          ...msg,
          id: v4(),
          sender: msg.role === "user" ? "user" : "system",
          textResponse: msg.content,
          close: false,
        }));
      })
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  resetEmbedChatSession: async function (embedSettings, sessionId) {
    const { baseApiUrl, embedId } = embedSettings;
    return await fetch(`${baseApiUrl}/${embedId}/${sessionId}`, {
      method: "DELETE",
      headers: await this.getHeaders(),
    })
      .then((res) => res.ok)
      .catch(() => false);
  },
  streamChat: async function (sessionId, embedSettings, message, handleChat) {
    const { baseApiUrl, embedId, username } = embedSettings;
    const overrides = {
      prompt: embedSettings?.prompt ?? null,
      model: embedSettings?.model ?? null,
      temperature: embedSettings?.temperature ?? null,
    };

    const ctrl = new AbortController();
    await fetchEventSource(`${baseApiUrl}/${embedId}/stream-chat`, {
      method: "POST",
      headers: await this.getHeaders(),
      body: JSON.stringify({
        message,
        sessionId,
        username,
        ...overrides,
      }),
      signal: ctrl.signal,
      openWhenHidden: true,
      async onopen(response) {
        if (response.ok) {
          return; // everything's good
        } else if (response.status >= 400) {
          await response
            .json()
            .then((serverResponse) => {
              handleChat(serverResponse);
            })
            .catch(() => {
              handleChat({
                id: v4(),
                type: "abort",
                textResponse: null,
                sources: [],
                close: true,
                error: `An error occurred while streaming response. Code ${response.status}`,
              });
            });
          ctrl.abort();
          throw new Error();
        } else {
          handleChat({
            id: v4(),
            type: "abort",
            textResponse: null,
            sources: [],
            close: true,
            error: `An error occurred while streaming response. Unknown Error.`,
          });
          ctrl.abort();
          throw new Error("Unknown Error");
        }
      },
      async onmessage(msg) {
        try {
          const chatResult = JSON.parse(msg.data);
          handleChat(chatResult);
        } catch {}
      },
      onerror(err) {
        handleChat({
          id: v4(),
          type: "abort",
          textResponse: null,
          sources: [],
          close: true,
          error: `An error occurred while streaming response. ${err.message}`,
        });
        ctrl.abort();
        throw new Error();
      },
    });
  },
};

export default ChatService;
