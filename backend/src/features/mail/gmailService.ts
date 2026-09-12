import prisma from "../../lib/prisma.js";
import { decryptMailSecret, encryptMailSecret, isMailEncryptionConfigured } from "./mailCrypto.js";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailMessageMetadata = {
    id: string;
    threadId: string;
    labelIds: string[];
    snippet: string;
    internalDate: string;
    payload?: { headers?: { name: string; value: string }[] };
};

export type GmailThreadMetadata = {
    id: string;
    historyId?: string;
    messages?: GmailMessageMetadata[];
};

type TokenResponse = {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
};

type GmailProfile = { emailAddress: string; historyId?: string };

const config = () => ({
    clientId: process.env.GMAIL_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.GMAIL_OAUTH_CLIENT_SECRET || "",
    redirectUri: process.env.GMAIL_OAUTH_REDIRECT_URI || "",
});

export const gmailConfiguration = () => {
    const value = config();
    return {
        ready: Boolean(value.clientId && value.clientSecret && value.redirectUri && isMailEncryptionConfigured()),
        hasClientId: Boolean(value.clientId),
        hasClientSecret: Boolean(value.clientSecret),
        hasRedirectUri: Boolean(value.redirectUri),
        hasEncryptionKey: isMailEncryptionConfigured(),
    };
};

const assertConfigured = () => {
    const status = gmailConfiguration();
    if (!status.ready) throw new Error("Gmail integration is not fully configured on the server.");
    return config();
};

export const buildGoogleAuthorizationUrl = (state: string): string => {
    const { clientId, redirectUri } = assertConfigured();
    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GMAIL_SCOPE);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    return url.toString();
};

const tokenRequest = async (body: URLSearchParams): Promise<TokenResponse> => {
    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });
    const data = await response.json() as TokenResponse & { error?: string; error_description?: string };
    if (!response.ok || !data.access_token) {
        throw new Error(data.error_description || data.error || `Google token exchange failed (${response.status})`);
    }
    return data;
};

const gmailGet = async <T>(path: string, accessToken: string): Promise<T> => {
    const response = await fetch(`${GMAIL_BASE}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    const data = await response.json() as T & { error?: { message?: string } };
    if (!response.ok) {
        throw new Error(data.error?.message || `Gmail API request failed (${response.status})`);
    }
    return data;
};

export const exchangeGoogleCode = async (code: string) => {
    const { clientId, clientSecret, redirectUri } = assertConfigured();
    return tokenRequest(new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
    }));
};

export const connectGmailUser = async (userId: string, code: string) => {
    const tokens = await exchangeGoogleCode(code);
    const profile = await gmailGet<GmailProfile>("/profile", tokens.access_token);
    if (!profile.emailAddress) throw new Error("Gmail did not return an account email address.");

    const previous = await prisma.gmailConnection.findUnique({ where: { userId } });
    const refreshToken = tokens.refresh_token
        ? encryptMailSecret(tokens.refresh_token)
        : previous?.refreshTokenEnc ?? null;

    const connection = await prisma.gmailConnection.upsert({
        where: { userId },
        update: {
            email: profile.emailAddress,
            accessTokenEnc: encryptMailSecret(tokens.access_token),
            refreshTokenEnc: refreshToken,
            tokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
            historyId: profile.historyId || null,
            monitoringEnabled: true,
        },
        create: {
            userId,
            email: profile.emailAddress,
            accessTokenEnc: encryptMailSecret(tokens.access_token),
            refreshTokenEnc: refreshToken,
            tokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
            historyId: profile.historyId || null,
        },
    });
    return connection;
};

export const getValidGmailAccessToken = async (userId: string): Promise<string> => {
    const connection = await prisma.gmailConnection.findUnique({ where: { userId } });
    if (!connection) throw new Error("Gmail is not connected.");

    if (connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() > Date.now() + 60_000) {
        return decryptMailSecret(connection.accessTokenEnc);
    }
    if (!connection.refreshTokenEnc) throw new Error("Gmail authorization expired. Reconnect Gmail.");

    const { clientId, clientSecret } = assertConfigured();
    const refreshToken = decryptMailSecret(connection.refreshTokenEnc);
    const tokens = await tokenRequest(new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
    }));
    await prisma.gmailConnection.update({
        where: { userId },
        data: {
            accessTokenEnc: encryptMailSecret(tokens.access_token),
            tokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
        },
    });
    return tokens.access_token;
};

export const fetchGmailProfile = async (userId: string) => {
    const accessToken = await getValidGmailAccessToken(userId);
    return gmailGet<GmailProfile>("/profile", accessToken);
};

export const listGmailMessages = async (userId: string, query: string, maxResults = 25) => {
    const accessToken = await getValidGmailAccessToken(userId);
    const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
    return gmailGet<{ messages?: { id: string; threadId: string }[] }>(`/messages?${params.toString()}`, accessToken);
};

export const getGmailMessage = async (userId: string, messageId: string): Promise<GmailMessageMetadata> => {
    const accessToken = await getValidGmailAccessToken(userId);
    const params = new URLSearchParams();
    params.append("format", "metadata");
    for (const header of ["From", "To", "Reply-To", "Subject", "Date"]) params.append("metadataHeaders", header);
    return gmailGet<GmailMessageMetadata>(`/messages/${encodeURIComponent(messageId)}?${params.toString()}`, accessToken);
};

export const getGmailThread = async (userId: string, threadId: string): Promise<GmailThreadMetadata> => {
    const accessToken = await getValidGmailAccessToken(userId);
    const params = new URLSearchParams();
    params.append("format", "metadata");
    for (const header of ["From", "To", "Subject", "Date"]) params.append("metadataHeaders", header);
    return gmailGet<GmailThreadMetadata>(`/threads/${encodeURIComponent(threadId)}?${params.toString()}`, accessToken);
};

export const headerValue = (message: GmailMessageMetadata, name: string): string =>
    message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || "";

export const messageReceivedAt = (message: GmailMessageMetadata): Date => {
    const millis = Number(message.internalDate);
    if (Number.isFinite(millis) && millis > 0) return new Date(millis);
    const parsed = new Date(headerValue(message, "Date"));
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};
