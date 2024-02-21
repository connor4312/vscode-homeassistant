import * as vscode from 'vscode';

export class DisposableStore {
  private readonly disposables: vscode.Disposable[] = [];

  public push(disposable: vscode.Disposable) {
    this.disposables.push(disposable);
  }

  public dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
