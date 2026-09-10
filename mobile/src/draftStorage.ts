import { File, Paths } from 'expo-file-system';

// Unsent text from the generator input fields (a half-typed topic / prompt), kept so it survives
// navigating away or restarting the app. Not sensitive — a plain JSON file in the document dir,
// keyed by field. All calls are best-effort: a draft failing to save or load is never surfaced.
const draftFile = new File(Paths.document, 'mrai-drafts.json');

export type DraftKey = 'ideaTopic' | 'imagePrompt';

function readAll(): Partial<Record<DraftKey, string>> {
  try {
    if (!draftFile.exists) return {};
    const parsed = JSON.parse(draftFile.textSync());
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getDraft(key: DraftKey): string {
  return readAll()[key] ?? '';
}

export function setDraft(key: DraftKey, value: string): void {
  try {
    const all = readAll();
    if (value) all[key] = value;
    else delete all[key];
    if (!draftFile.exists) draftFile.create();
    draftFile.write(JSON.stringify(all));
  } catch {
    // best-effort — losing an unsent draft is not worth interrupting the user for
  }
}
