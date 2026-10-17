// Data-dir access for the app's file-backed stores. The app and the worker share one directory
// ($LONGSHOT_DATA_DIR, else <repo>/.data). On Railway it is a persistent volume.

import { readJsonFile, writeJsonFile } from "@longshot/shared/server";

export function readData<T>(file: string, fallback: T): T {
  return readJsonFile<T>(file, fallback);
}

export function writeData(file: string, value: unknown): void {
  writeJsonFile(file, value);
}
