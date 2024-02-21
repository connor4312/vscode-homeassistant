import * as vscode from 'vscode';
import { ConfigValue } from './configValue';
import { RequestHandler } from './requestHandler';

const enum C {
  GetTokenCommand = 'homeassistant-chat.getToken',
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const url = new ConfigValue('url', 'http://localhost:8123/profile');
  const language = new ConfigValue('language', 'en');
  const token = new ConfigValue<string | undefined>('token', undefined);
  const req = new RequestHandler(url);

  const participant = vscode.chat.createChatParticipant('home', handleChat(token, language, req));
  participant.fullName = 'Home Assistant';
  participant.iconPath = new vscode.ThemeIcon('home');
  context.subscriptions.push(url, token, req, language, participant);

  context.subscriptions.push(
    vscode.commands.registerCommand(C.GetTokenCommand, getToken(url, token)),
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}

const handleChat =
  (
    token: ConfigValue<string | undefined>,
    language: ConfigValue<string>,
    req: RequestHandler,
  ): vscode.ChatRequestHandler =>
  async (request, context, response) => {
    if (!token.value) {
      response.button({
        command: C.GetTokenCommand,
        title: 'Get Token',
      });
      return {
        errorDetails: {
          message: 'Your API token is not yet configured, click "Get Token" to set one up.',
        },
      };
    }

    const res = await req.fetch(
      '/api/conversation/process',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.value}`,
        },
      },
      {
        text: request.prompt,
        language: language.value,
      },
    );

    if (res.status === 404) {
      response.markdown(
        new vscode.MarkdownString(
          [
            'The conversation API is not available on your Home Assistant instance. Please add the following line to your configuration.yml, and restart your Home Assistant instance:',
            '',
            '```yaml',
            'conversation:',
            '```',
          ].join('\n'),
        ),
      );

      return {
        errorDetails: {
          message: 'Try again after after restarting your Home Assistant instance.',
        },
      };
    }

    if (res.status === 200) {
      try {
        const parsed = JSON.parse(res.body);
        response.markdown(parsed.response.speech.plain.speech);
        return;
      } catch {
        // ignored
      }
    }

    return { errorDetails: { message: res.body } };
  };

const getToken = (url: ConfigValue<string>, token: ConfigValue<string | undefined>) => async () => {
  const yes = 'Yes';
  const no = 'No';
  const response = await vscode.window.showInformationMessage(
    `You'll want to create a "Long Live Access Token" in Home Assistant. Is "${url.value}" your Home Assistant URL?`,
    { modal: true },
    yes,
    no,
  );

  if (response === no) {
    if (!(await enterUrl(url))) {
      return;
    }
  }

  vscode.env.openExternal(vscode.Uri.parse(new URL('/profile', url.value).toString()));

  const value = await vscode.window.showInputBox({
    title: 'Enter the value of the token',
    placeHolder: '"Long-Lived Access Token" value here',
    ignoreFocusOut: true,
  });

  if (!value) {
    return;
  }

  token.update(value, vscode.ConfigurationTarget.Global);
};

const enterUrl = async (url: ConfigValue<string>) => {
  let lastValue: string | undefined;
  while (true) {
    const newUrl = await vscode.window.showInputBox({
      title: 'Enter Your Full Home Assistant URL',
      placeHolder: 'http://localhost:8123',
      ignoreFocusOut: true,
      value: lastValue,
    });
    if (!newUrl) {
      return false;
    }

    const res = await new RequestHandler(newUrl).fetch('/');
    if (res.status >= 100 && res.status < 500) {
      url.update(newUrl, vscode.ConfigurationTarget.Global);
      return true;
    }

    const retry = 'Retry';
    const r = await vscode.window.showErrorMessage(
      `Failed to connect to Home Assistant: ${res.status} ${res.body}`,
      { modal: true },
      retry,
    );
    if (r !== retry) {
      return false;
    }

    lastValue = newUrl;
  }
};
