import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

// Own subdirectory (not the bare cache root) so we can safely sweep every file inside it before
// each new download without touching anything else's cache entries.
const SHARE_DIR_NAME = 'mrai-share';

// Every download gets its own unique local filename — reusing the remote file's bare name (e.g.
// every generated image is literally called "output.jpg" on the server) caused a real
// "Destination already exists" failure once more than one had been downloaded in one app
// session. Sweeping the dedicated subdirectory first (instead of just picking a fresh name)
// keeps that fix from silently leaking a new file on every single Save/Share tap forever.
async function downloadToCache(url: string) {
  const shareDir = new Directory(Paths.cache, SHARE_DIR_NAME);
  shareDir.create({ idempotent: true });
  for (const entry of shareDir.list()) {
    try {
      entry.delete();
    } catch {
      // best-effort cleanup — a file another in-flight save/share is still using shouldn't block
    }
  }

  const extMatch = url.match(/\.[a-zA-Z0-9]+$/);
  const destination = new File(shareDir, `share-${Date.now()}${extMatch?.[0] ?? ''}`);
  return File.downloadFileAsync(url, destination, { idempotent: true });
}

// Downloads a remote server file into the cache dir, then hands it to the OS share sheet.
export async function shareRemoteFile(url: string): Promise<void> {
  const file = await downloadToCache(url);
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri);
  } else {
    Alert.alert('Saved', `File saved to ${file.uri}`);
  }
}

// Downloads a remote server file and saves it directly to the device's photo library. Throws
// (rather than silently returning) when permission is denied, so callers awaiting this can't
// mistake a no-op for a real save — see the caller-side "false success" bug this replaced.
export async function saveRemoteFileToLibrary(url: string): Promise<void> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) {
    throw new Error('Photo library permission was not granted.');
  }
  const file = await downloadToCache(url);
  await MediaLibrary.saveToLibraryAsync(file.uri);
}
