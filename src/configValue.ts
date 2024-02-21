import * as vscode from 'vscode';

const sectionName = 'homeassistant-chat';

const walkObject = <T>(value: T, replacer: (value: unknown) => any): T => {
  if (value instanceof Array) {
    return value.map(replacer) as T;
  }

  if (value && typeof value === 'object') {
    const newValue = {} as Record<string, unknown>;
    for (const [k, v] of Object.entries(value)) {
      newValue[replacer(k)] = walkObject(v, replacer);
    }
    return newValue as T;
  }

  return replacer(value);
};

export class ConfigValue<T> {
  private readonly changeEmitter = new vscode.EventEmitter<T>();
  private readonly changeListener: vscode.Disposable;
  private _value!: T;

  public readonly onDidChange = this.changeEmitter.event;

  public get value() {
    return this._value;
  }

  public get key() {
    return `${sectionName}.${this.sectionKey}`;
  }

  constructor(
    private readonly sectionKey: string,
    defaultValue: T,
    scope?: vscode.ConfigurationScope,
  ) {
    this.changeListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(this.key)) {
        this.setValue(
          vscode.workspace.getConfiguration(sectionName, scope).get(sectionKey) ?? defaultValue,
        );
      }
    });

    this.setValue(
      vscode.workspace.getConfiguration(sectionName, scope).get(sectionKey) ?? defaultValue,
    );
  }

  public dispose() {
    this.changeListener.dispose();
    this.changeEmitter.dispose();
  }

  public update(value: T, target: vscode.ConfigurationTarget) {
    vscode.workspace.getConfiguration(sectionName).update(this.sectionKey, value, target);
    this.setValue(value);
  }

  private setValue(value: T) {
    if (value !== this._value) {
      this._value = value;
      this.changeEmitter.fire(this._value);
    }
  }
}
