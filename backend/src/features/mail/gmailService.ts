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
type GmailLabel = { messagesUnread?: number };

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

export const gmailWebUrl = (email: string, threadId: string): string =>
    `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#all/${encodeURIComponent(threadId)}`;

export const buildGoogleAuthorizationUrl = (state: string): string => {
    const { clientId, redirectUri } = assertConfigured();
    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GMAIL_SCOPE);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "select_account consent");
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
    if (!response.ok) throw new Error(data.error?.message || `Gmail API request failed (${response.status})`);
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

    const previous = await prisma.gmailConnection.findUnique({
        where: { userId_email: { userId, email: profile.emailAddress } },
    });
    const refreshTokenEnc = tokens.refresh_token
        ? encryptMailSecret(tokens.refresh_token)
        : previous?.refreshTokenEnc ?? null;

    return prisma.gmailConnection.upsert({
        where: { userId_email: { userId, email: profile.emailAddress } },
        update: {
            accessTokenEnc: encryptMailSecret(tokens.access_token),
            refreshTokenEnc,
            tokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
            historyId: profile.historyId || previous?.historyId || null,
            monitoringEnabled: true,
        },
        create: {
            userId,
            email: profile.emailAddress,
            accessTokenEnc: encryptMailSecret(tokens.access_token),
            refreshTokenEnc,
            tokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
            historyId: profile.historyId || null,
        },
    });
};

const ownedConnection = async (connectionId: string, userId?: string) => {
    const connection = await prisma.gmailConnection.findFirst({
        where: { id: connectionId, ...(userId ? { userId } : {}) },
    });
    if (!connection) throw new Error("Connected Gmail account was not found.");
    return connection;
};

export const getValidGmailAccessToken = async (connectionId: string, userId?: string): Promise<string> => {
    const connection = await ownedConnection(connectionId, userId);
    if (connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() > Date.now() + 60_000) {
        return decryptMailSecret(connection.accessTokenEnc);
    }
    if (!connection.refreshTokenEnc) throw new Error(`${connection.email} authorization expired. Reconnect this Gmail account.`);

    const { clientId, clientSecret } = assertConfigured();
    const tokens = await tokenRequest(new URLSearchParams({
        refresh_token: decryptMailSecret(connection.refreshTokenEnc),
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
    }));
    await prisma.gmailConnection.update({
        where: { id: connection.id },
        data: {
            accessTokenEnc: encryptMailSecret(tokens.access_token),
            tokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
        },
    });
    return tokens.access_token;
};

export const fetchGmailProfile = async (connectionId: string, userId?: string) => {
    const accessToken = await getValidGmailAccessToken(connectionId, userId);
    return gmailGet<GmailProfile>("/profile", accessToken);
};

export const getUnreadGmailCount = async (connectionId: string, userId?: string): Promise<number> => {
    const accessToken = await getValidGmailAccessToken(connectionId, userId);
    const inbox = await gmailGet<GmailLabel>("/labels/INBOX", accessToken);
    return Math.max(0, inbox.messagesUnread || 0);
};

export const listGmailMessages = async (connectionId: string, query: string, maxResults = 25, userId?: string) => {
    const accessToken = await getValidGmailAccessToken(connectionId, userId);
    const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
    return gmailGet<{ messages?: { id: string; threadId: string }[]; resultSizeEstimate?: number }>(`/messages?${params.toString()}`, accessToken);
};

export const getGmailMessage = async (connectionId: string, messageId: string, userId?: string): Promise<GmailMessageMetadata> => {
    const accessToken = await getValidGmailAccessToken(connectionId, userId);
    const params = new URLSearchParams();
    params.append("format", "metadata");
    for (const header of ["From", "To", "Reply-To", "Subject", "Date"]) params.append("metadataHeaders", header);
    return gmailGet<GmailMessageMetadata>(`/messages/${encodeURIComponent(messageId)}?${params.toString()}`, accessToken);
};

export const getGmailThread = async (connectionId: string, threadId: string, userId?: string): Promise<GmailThreadMetadata> => {
    const accessToken = await getValidGmailAccessToken(connectionId, userId);
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
