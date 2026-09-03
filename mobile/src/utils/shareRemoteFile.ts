import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

// Every download gets its own unique local filename — reusing the remote file's bare name (e.g.
// every generated image is literally called "output.jpg" on the server) caused a real
// "Destination already exists" failure once more than one had been downloaded into the same
// cache dir in one app session.
async function downloadToCache(url: string) {
  const cacheDir = new Directory(Paths.cache);
  cacheDir.create({ idempotent: true });
  const extMatch = url.match(/\.[a-zA-Z0-9]+$/);
  const destination = new File(cacheDir, `share-${Date.now()}${extMatch?.[0] ?? ''}`);
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

// Downloads a remote server file and saves it directly to the device's photo library.
export async function saveRemoteFileToLibrary(url: string): Promise<void> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) {
    Alert.alert('Permission needed', 'Allow photo library access to save this image.');
    return;
  }
  const file = await downloadToCache(url);
  await MediaLibrary.saveToLibraryAsync(file.uri);
}
