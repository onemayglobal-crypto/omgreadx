import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TextDocument {
  id: string;
  title: string;
  storageKey: string;
  uri: string;
  createdAt: string; // ISO string
  wordCount: number;
}

const TEXT_DOCS_KEY = '@omgreadx_text_documents';

export const getAllTextDocuments = async (): Promise<TextDocument[]> => {
  try {
    const json = await AsyncStorage.getItem(TEXT_DOCS_KEY);
    if (!json) return [];

    const docs: TextDocument[] = JSON.parse(json);
    return docs
      .map((d) => ({
        ...d,
        createdAt: d.createdAt,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error('[TextDocumentsStorage] Error loading documents:', error);
    return [];
  }
};

export const addTextDocument = async (doc: TextDocument): Promise<void> => {
  try {
    const existing = await getAllTextDocuments();
    const idx = existing.findIndex((d) => d.id === doc.id || d.storageKey === doc.storageKey);
    if (idx >= 0) {
      existing[idx] = doc;
    } else {
      existing.unshift(doc);
    }
    await AsyncStorage.setItem(TEXT_DOCS_KEY, JSON.stringify(existing));
    console.log('[TextDocumentsStorage] Document saved, total:', existing.length);
  } catch (error) {
    console.error('[TextDocumentsStorage] Error saving document:', error);
  }
};

export const removeTextDocument = async (id: string): Promise<void> => {
  try {
    const existing = await getAllTextDocuments();
    const filtered = existing.filter((d) => d.id !== id);
    await AsyncStorage.setItem(TEXT_DOCS_KEY, JSON.stringify(filtered));
    console.log('[TextDocumentsStorage] Document removed, total:', filtered.length);
  } catch (error) {
    console.error('[TextDocumentsStorage] Error removing document:', error);
  }
};










