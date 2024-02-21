import * as https from 'https';
import * as http from 'http';
import { ConfigValue } from './configValue';
import { DisposableStore } from './disposableStore';

export class Response {
  constructor(public status: number, public body: string) {}
}

export class RequestHandler {
  private readonly verify = new ConfigValue('verifyCertificate', false);
  private readonly disposable = new DisposableStore();
  private agent!: https.Agent | http.Agent;

  public get url() {
    return typeof this._url === 'string' ? this._url : this._url.value;
  }

  constructor(private readonly _url: ConfigValue<string> | string) {
    const updateAgent = () => {
      if (this.url.startsWith('http://')) {
        this.agent = new http.Agent();
      } else {
        this.agent = new https.Agent({ rejectUnauthorized: !this.verify.value });
      }
    };

    if (typeof _url !== 'string') {
      this.disposable.push(_url.onDidChange(updateAgent));
    }
    this.disposable.push(this.verify.onDidChange(updateAgent));
    updateAgent();
  }

  public async fetch(
    path: string,
    options: https.RequestOptions | http.RequestOptions = {},
    body?: string | object,
  ) {
    let url: URL;
    try {
      url = new URL(path, this.url);
    } catch {
      return new Response(0, `Invalid URL "${this.url}"`);
    }

    return new Promise<Response>((resolve) => {
      const onResponse = (res: http.IncomingMessage) => {
        const body: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          body.push(chunk);
        });
        res.on('end', () => {
          resolve(new Response(res.statusCode || 503, Buffer.concat(body).toString()));
        });
        res.on('error', (error) => {
          resolve(new Response(0, error.message));
        });
      };

      options.headers ??= {};
      options.headers['accept'] = 'application/json';
      if (typeof body === 'object') {
        body = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = String(Buffer.byteLength(body));
      }

      const request =
        this.agent instanceof https.Agent
          ? https.request(url, options, onResponse)
          : http.request(url, options, onResponse);

      request.on('error', (error) => {
        resolve(new Response(0, `Request error: ${error.message}`));
      });

      request.write(body);
      request.end();
    });
  }

  public dispose() {
    this.disposable.dispose();
  }
}
