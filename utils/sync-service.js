// utils/sync-service.js
// Orchestrates settings synchronization with Firebase Firestore.

import { FirebaseAuth } from "./firebase-auth.js";

const SYNC_EXCLUDED_KEYS = new Set([
    "firebaseUser",
    "syncStatus",
    "syncDirty",
    "__isRestoring",
    "defaultFirebaseConfig",
    "customFirebaseConfig",
    "migrationDone",
    "lastSyncTime",
    "timerState",
    "focusState",
    "pauseBlockingUntil",
    "disableAuthorizedUntil",
    "sessionOverlayDismissed",
    "shortPauseUsage",
    "adBlockStats",
    "lastFilterUpdate"
]);

const SYNC_KEYS = [
    "settings",
    "focusBlockedSites",
    "scheduledBlockedSites",
    "scheduledBlocking",
    "timeLimits",
    "timeLimitsEnabled",
    "filterLists",
    "customFilters",
    "globalLimit",
    "whitelist",
    "todos",
    "siteUsageData",
    "siteCategories",
    "customCategories"
];

// Default configuration placeholders. Can be overridden in settings UI.
const DEFAULT_CONFIG = {
    apiKey: "AIzaSyD-placeholder-key-replace-in-settings",
    projectId: "timeshield-default-sync"
};

export class SyncService {
    constructor() {
        this.auth = new FirebaseAuth(DEFAULT_CONFIG);
        this.user = null;
        this.syncStatus = {
            state: "offline", // "synced", "syncing", "offline", "failed"
            lastSynced: null,
            email: null,
            error: null
        };
        this.isSyncing = false;
        this.debounceTimeout = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        // Load custom firebase credentials if saved
        const configResult = await chrome.storage.local.get(["customFirebaseConfig"]);
        if (configResult.customFirebaseConfig) {
            this.auth.updateConfig(configResult.customFirebaseConfig);
        } else {
            // Check if default is initialized, if not set default config
            await chrome.storage.local.set({ defaultFirebaseConfig: DEFAULT_CONFIG });
        }

        // Restore auth session
        const authData = await chrome.storage.local.get(["firebaseUser"]);
        if (authData.firebaseUser) {
            this.user = authData.firebaseUser;
            this.auth.updateConfig(this.user.config || DEFAULT_CONFIG);
            
            // Check if token needs refreshing
            if (this.user.tokenExpiration && Date.now() >= this.user.tokenExpiration) {
                try {
                    await this.refreshToken();
                } catch (e) {
                    console.error("TimeShield Sync: Failed to refresh token on startup", e);
                    this.updateStatus("failed", "Authentication session expired. Please log in again.");
                }
            } else {
                this.updateStatus("synced", null);
            }
        } else {
            this.updateStatus("offline", null);
        }

        this.initialized = true;
        console.log("☁️ Sync Service initialized. User logged in:", !!this.user);
    }

    updateStatus(state, error = null) {
        this.syncStatus = {
            state,
            lastSynced: this.syncStatus.lastSynced || null,
            email: this.user ? this.user.email : null,
            error
        };
        chrome.storage.local.set({ syncStatus: this.syncStatus }).catch(() => {});
    }

    async login(email, password) {
        await this.init();
        this.updateStatus("syncing");
        try {
            const data = await this.auth.signIn(email, password);
            await this.handleAuthResponse(data);
            
            // Trigger initial data restore or upload
            await this.syncOnLogin();
            return { success: true };
        } catch (e) {
            this.updateStatus("failed", e.message);
            throw e;
        }
    }

    async signUp(email, password) {
        await this.init();
        this.updateStatus("syncing");
        try {
            const data = await this.auth.signUp(email, password);
            await this.handleAuthResponse(data);
            
            // Upload current settings immediately
            await this.uploadSettings();
            return { success: true };
        } catch (e) {
            this.updateStatus("failed", e.message);
            throw e;
        }
    }

    async logout() {
        await this.init();
        this.user = null;
        await chrome.storage.local.remove(["firebaseUser", "syncDirty"]);
        this.updateStatus("offline");
        console.log("👤 User logged out.");
    }

    async handleAuthResponse(data) {
        const activeConfig = {
            apiKey: this.auth.apiKey,
            projectId: this.auth.projectId
        };

        this.user = {
            idToken: data.idToken,
            refreshToken: data.refreshToken,
            email: data.email,
            localId: data.localId,
            tokenExpiration: Date.now() + (parseInt(data.expiresIn) * 1000) - 60000, // expire 1 min early
            config: activeConfig
        };

        await chrome.storage.local.set({ firebaseUser: this.user });
    }

    async refreshToken() {
        if (!this.user?.refreshToken) return;
        try {
            const data = await this.auth.refreshToken(this.user.refreshToken);
            await this.handleAuthResponse(data);
        } catch (e) {
            console.error("TimeShield Sync: Token refresh failed", e);
            this.user = null;
            await chrome.storage.local.remove(["firebaseUser"]);
            this.updateStatus("failed", "Session expired. Please log in again.");
            throw e;
        }
    }

    async ensureValidToken() {
        if (!this.user) throw new Error("User is not authenticated");
        if (Date.now() >= this.user.tokenExpiration) {
            await this.refreshToken();
        }
    }

    // Runs immediately when settings are saved locally (via chrome.storage.local changes)
    scheduleSync() {
        if (!this.user) return;
        
        // Mark as dirty locally in case of termination
        chrome.storage.local.set({ syncDirty: true }).catch(() => {});

        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }

        // Set a Chrome alarm as a backup to make sure the sync runs if service worker terminates
        chrome.alarms.create("syncUploadBackup", { delayInMinutes: 1 });

        this.debounceTimeout = setTimeout(async () => {
            try {
                await this.syncNow();
            } catch (e) {
                console.error("TimeShield Sync: Auto-sync failed", e);
            }
        }, 4000);
    }

    async syncNow(force = false) {
        if (this.isSyncing) return;
        this.isSyncing = true;
        this.updateStatus("syncing");

        try {
            await this.ensureValidToken();

            if (!navigator.onLine) {
                this.updateStatus("failed", "No internet connection. Changes will sync when online.");
                this.isSyncing = false;
                return;
            }

            const localDirtyResult = await chrome.storage.local.get(["syncDirty"]);
            const isLocalDirty = localDirtyResult.syncDirty || force;

            // Fetch cloud document
            const cloudDoc = await this.fetchCloudDocument();

            if (!cloudDoc) {
                // Document doesn't exist, upload current local settings
                await this.uploadSettings();
            } else {
                // Document exists, perform conflict resolution (Last Write Wins)
                const cloudData = JSON.parse(cloudDoc.fields.data.stringValue);
                const cloudTime = new Date(cloudDoc.fields.lastSyncTime.stringValue).getTime();

                const localTimeResult = await chrome.storage.local.get(["lastSyncTime"]);
                const localTime = localTimeResult.lastSyncTime ? new Date(localTimeResult.lastSyncTime).getTime() : 0;

                if (isLocalDirty && localTime > cloudTime) {
                    // Local is newer, upload settings
                    await this.uploadSettings();
                } else if (cloudTime > localTime) {
                    // Cloud is newer, restore cloud settings locally
                    await this.restoreLocalSettings(cloudData, cloudDoc.fields.lastSyncTime.stringValue);
                } else {
                    // In sync
                    await chrome.storage.local.remove(["syncDirty"]);
                    chrome.alarms.clear("syncUploadBackup").catch(() => {});
                    this.syncStatus.lastSynced = new Date().toISOString();
                    this.updateStatus("synced");
                }
            }
        } catch (e) {
            console.error("TimeShield Sync: Sync failed", e);
            this.updateStatus("failed", e.message);
        } finally {
            this.isSyncing = false;
        }
    }

    async syncOnLogin() {
        try {
            const cloudDoc = await this.fetchCloudDocument();
            if (cloudDoc) {
                const cloudData = JSON.parse(cloudDoc.fields.data.stringValue);
                await this.restoreLocalSettings(cloudData, cloudDoc.fields.lastSyncTime.stringValue);
            } else {
                await this.uploadSettings();
            }
        } catch (e) {
            console.error("TimeShield Sync: Failed during login sync", e);
            this.updateStatus("failed", "Failed to restore cloud settings: " + e.message);
        }
    }

    async fetchCloudDocument() {
        const url = `https://firestore.googleapis.com/v1/projects/${this.user.config.projectId}/databases/(default)/documents/users/${this.user.localId}`;
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${this.user.idToken}`
            }
        });

        if (response.status === 404) {
            return null; // Document not found
        }

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error?.message || "Failed to fetch cloud document");
        }
        return data;
    }

    async uploadSettings() {
        const localData = await this.getSyncableData();
        const lastSyncTime = new Date().toISOString();

        const url = `https://firestore.googleapis.com/v1/projects/${this.user.config.projectId}/databases/(default)/documents/users/${this.user.localId}?updateMask.fieldPaths=data&updateMask.fieldPaths=lastSyncTime`;
        
        const response = await fetch(url, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.user.idToken}`
            },
            body: JSON.stringify({
                fields: {
                    data: {
                        stringValue: JSON.stringify(localData)
                    },
                    lastSyncTime: {
                        stringValue: lastSyncTime
                    }
                }
            })
        });

        const responseData = await response.json();
        if (!response.ok) {
            throw new Error(responseData.error?.message || "Cloud upload failed");
        }

        await chrome.storage.local.set({ lastSyncTime });
        await chrome.storage.local.remove(["syncDirty"]);
        chrome.alarms.clear("syncUploadBackup").catch(() => {});
        this.syncStatus.lastSynced = lastSyncTime;
        this.updateStatus("synced");
        console.log("☁️ Settings successfully uploaded to cloud database.");
    }

    async getSyncableData() {
        const localData = await chrome.storage.local.get(null);
        const syncableData = {};

        Object.entries(localData).forEach(([key, value]) => {
            if (!SYNC_EXCLUDED_KEYS.has(key)) {
                syncableData[key] = value;
            }
        });

        return syncableData;
    }

    async restoreLocalSettings(cloudData, lastSyncTime) {
        // Build restore payload
        const restorePayload = {};
        SYNC_KEYS.forEach(key => {
            if (cloudData.hasOwnProperty(key)) {
                restorePayload[key] = cloudData[key];
            }
        });

        restorePayload.lastSyncTime = lastSyncTime;
        restorePayload.syncDirty = false;

        // Temporal bypass of chrome.storage listeners during restoration
        chrome.storage.local.set({ __isRestoring: true }).then(async () => {
            await chrome.storage.local.set(restorePayload);
            await chrome.storage.local.remove(["__isRestoring", "syncDirty"]);
            chrome.alarms.clear("syncUploadBackup").catch(() => {});
            this.syncStatus.lastSynced = lastSyncTime;
            this.updateStatus("synced");
            console.log("☁️ Settings successfully restored from cloud database.");
            
            // Notify other extension scripts
            chrome.runtime.sendMessage({ action: "settingsRestored" }).catch(() => {});
        });
    }

    async configureFirebase(apiKey, projectId) {
        await this.init();
        const customConfig = { apiKey, projectId };
        await chrome.storage.local.set({ customFirebaseConfig: customConfig });
        
        // Update auth instance configuration
        this.auth.updateConfig(customConfig);
        
        // Re-authenticate user under new configuration if user state exists
        if (this.user) {
            // Must re-login or reset session since API configurations changed
            await this.logout();
        } else {
            this.updateStatus("offline");
        }
        
        console.log("⚙️ Firebase sync configuration updated.");
    }
}
