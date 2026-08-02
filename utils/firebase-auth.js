// utils/firebase-auth.js
// Handles Firebase Authentication using REST API calls.

export class FirebaseAuth {
    constructor(config = {}) {
        this.apiKey = config.apiKey || "";
        this.projectId = config.projectId || "";
    }

    updateConfig(config) {
        this.apiKey = config.apiKey || this.apiKey;
        this.projectId = config.projectId || this.projectId;
    }

    get isConfigured() {
        return !!this.apiKey && !!this.projectId;
    }

    async signUp(email, password) {
        if (!this.isConfigured) throw new Error("Firebase Auth is not configured");

        const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${this.apiKey}`;
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email,
                password,
                returnSecureToken: true
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error?.message || "Sign up failed");
        }
        return data;
    }

    async signIn(email, password) {
        if (!this.isConfigured) throw new Error("Firebase Auth is not configured");

        const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this.apiKey}`;
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email,
                password,
                returnSecureToken: true
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error?.message || "Sign in failed");
        }
        return data;
    }

    async signInWithGoogle(googleAccessToken) {
        if (!this.isConfigured) throw new Error("Firebase Auth is not configured");

        const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${this.apiKey}`;
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                postBody: `access_token=${googleAccessToken}&providerId=google.com`,
                requestUri: "http://localhost",
                returnIdpCredential: true,
                returnSecureToken: true
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error?.message || "Google Sign-In failed");
        }
        return data;
    }

    async refreshToken(refreshToken) {
        if (!this.isConfigured) throw new Error("Firebase Auth is not configured");

        const url = `https://securetoken.googleapis.com/v1/token?key=${this.apiKey}`;
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: refreshToken
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error?.message || "Token refresh failed");
        }
        
        return {
            idToken: data.id_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            localId: data.user_id
        };
    }

    async getUserInfo(idToken) {
        if (!this.isConfigured) throw new Error("Firebase Auth is not configured");

        const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${this.apiKey}`;
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error?.message || "Failed to fetch user info");
        }
        return data.users?.[0];
    }
}
