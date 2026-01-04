
import { LogEntry } from '../types';

const DB_NAME = 'NutriWiseDB';
const DB_VERSION = 1;
const STORE_LOGS = 'logs';

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_LOGS)) {
        db.createObjectStore(STORE_LOGS, { keyPath: 'id' });
      }
    };
  });
};

export const getAllLogs = async (): Promise<LogEntry[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_LOGS, 'readonly');
    const store = transaction.objectStore(STORE_LOGS);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

export const saveLog = async (log: LogEntry): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_LOGS, 'readwrite');
    const store = transaction.objectStore(STORE_LOGS);
    const request = store.put(log);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const deleteLog = async (id: string): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_LOGS, 'readwrite');
      const store = transaction.objectStore(STORE_LOGS);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  };

// Migration utility: Move logs from LocalStorage to IndexedDB
export const migrateLogsFromLocalStorage = async () => {
    const localLogs = localStorage.getItem('nutriwise_logs');
    
    if (localLogs) {
        try {
            console.log("Migrating logs from LocalStorage to IndexedDB...");
            const parsed = JSON.parse(localLogs);
            if (Array.isArray(parsed) && parsed.length > 0) {
                const db = await initDB();
                const transaction = db.transaction(STORE_LOGS, 'readwrite');
                const store = transaction.objectStore(STORE_LOGS);
                
                for (const log of parsed) {
                    // Strip image to save space as requested by user
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { image, ...cleanLog } = log;
                    store.put(cleanLog);
                }
                
                await new Promise<void>((resolve, reject) => {
                    transaction.oncomplete = () => resolve();
                    transaction.onerror = () => reject(transaction.error);
                });
            }
            // Clear LocalStorage to fix Quota Error
            localStorage.removeItem('nutriwise_logs');
            console.log("Migration complete. LocalStorage cleared.");
        } catch (e) { 
            console.error("Migration failed for logs", e); 
        }
    }
};

// Cleanup utility: Remove images from EXISTING IndexedDB logs
export const removeImagesFromLogs = async (): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_LOGS, 'readwrite');
        const store = transaction.objectStore(STORE_LOGS);
        const request = store.openCursor();

        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;
            if (cursor) {
                const updateData = cursor.value;
                if (updateData.image) {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { image, ...cleanData } = updateData;
                    cursor.update(cleanData);
                }
                cursor.continue();
            } else {
                resolve();
            }
        };
        request.onerror = () => reject(request.error);
    });
};
