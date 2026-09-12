import crypto from "node:crypto";
import prisma from "../../lib/prisma.js";
import { decryptMailSecret, encryptMailSecret, isMailEncryptionConfigured } from "./mailCrypto.js";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const BUNDLE_VERSION = 2;

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
type GmailLabel = { id: string; name?: string; messagesTotal?: number; messagesUnread?: number; threadsUnread?: number };

type GmailConnectionRecord = {
    id: string;
    userId: string;
    email: string;
    accessTokenEnc: string;
    refreshTokenEnc: string | null;
    tokenExpiresAt: Date | null;
    historyId: string | null;
    monitoringEnabled: boolean;
    digestEnabled: boolean;
    digestHour: number;
    followUpDays: number;
    timezone: string;
    lastSyncedAt: Date | null;
    lastDigestAt: Date | null;
};

export type StoredGmailAccount = {
    id: string;
    email: string;
    accessToken: string;
    refreshToken: string | null;
    tokenExpiresAt: string | null;
    historyId: string | null;
    monitoringEnabled: boolean;
    digestEnabled: boolean;
    digestHour: number;
    followUpDays: number;
    timezone: string;
    lastSyncedAt: string | null;
    lastDigestAt: string | null;
    unreadCount: number;
};

export type GmailAccountSummary = Omit<StoredGmailAccount, "accessToken" | "refreshToken">;

type GmailAccountBundle = { version: number; accounts: StoredGmailAccount[] };

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

export const gmailAccountId = (email: string): string =>
    crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24);

export const gmailStorageKey = (email: string, key: string): string =>
    `${email.trim().toLowerCase()}::${key}`;

export const parseGmailStorageKey = (value: string): { email: string; key: string } | null => {
    const divider = value.indexOf("::");
    if (divider <= 0) return null;
    return { email: value.slice(0, divider), key: value.slice(divider + 2) };
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
    url.searchParams.set("prompt", "consent select_account");
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

const toIso = (value: Date | null): string | null => value ? value.toISOString() : null;
const fromIso = (value: string | null): Date | null => value ? new Date(value) : null;

const legacyAccount = (connection: GmailConnectionRecord): StoredGmailAccount => ({
    id: gmailAccountId(connection.email),
    email: connection.email,
    accessToken: decryptMailSecret(connection.accessTokenEnc),
    refreshToken: connection.refreshTokenEnc ? decryptMailSecret(connection.refreshTokenEnc) : null,
    tokenExpiresAt: toIso(connection.tokenExpiresAt),
    historyId: connection.historyId,
    monitoringEnabled: connection.monitoringEnabled,
    digestEnabled: connection.digestEnabled,
    digestHour: connection.digestHour,
    followUpDays: connection.followUpDays,
    timezone: connection.timezone,
    lastSyncedAt: toIso(connection.lastSyncedAt),
    lastDigestAt: toIso(connection.lastDigestAt),
    unreadCount: 0,
});

const loadAccountsFromConnection = (connection: GmailConnectionRecord): StoredGmailAccount[] => {
    const decrypted = decryptMailSecret(connection.accessTokenEnc);
    try {
        const parsed = JSON.parse(decrypted) as Partial<GmailAccountBundle>;
        if (parsed.version === BUNDLE_VERSION && Array.isArray(parsed.accounts)) {
            return parsed.accounts
                .filter((account): account is StoredGmailAccount => Boolean(account && account.email && account.accessToken))
                .map((account) => ({
                    ...account,
                    id: account.id || gmailAccountId(account.email),
                    monitoringEnabled: account.monitoringEnabled !== false,
                    digestEnabled: account.digestEnabled !== false,
                    digestHour: Number.isInteger(account.digestHour) ? account.digestHour : 8,
                    followUpDays: Number.isInteger(account.followUpDays) ? account.followUpDays : 3,
                    timezone: account.timezone || "UTC",
                    unreadCount: Number.isFinite(account.unreadCount) ? Math.max(0, account.unreadCount) : 0,
                }));
        }
    } catch {
        // Existing Taskly users have a single encrypted token in this field.
    }
    return [legacyAccount(connection)];
};

const summary = (account: StoredGmailAccount): GmailAccountSummary => {
    const { accessToken: _accessToken, refreshToken: _refreshToken, ...rest } = account;
    return rest;
};

const latestDate = (values: (string | null)[]): Date | null => {
    const timestamps = values.filter(Boolean).map((value) => new Date(value as string).getTime()).filter(Number.isFinite);
    return timestamps.length ? new Date(Math.max(...timestamps)) : null;
};

const saveAccounts = async (connection: GmailConnectionRecord, accounts: StoredGmailAccount[]) => {
    if (!accounts.length) {
        await prisma.gmailConnection.delete({ where: { userId: connection.userId } });
        return;
    }
    const first = accounts[0];
    const bundle: GmailAccountBundle = { version: BUNDLE_VERSION, accounts };
    await prisma.gmailConnection.update({
        where: { userId: connection.userId },
        data: {
            email: first.email,
            accessTokenEnc: encryptMailSecret(JSON.stringify(bundle)),
            refreshTokenEnc: null,
            tokenExpiresAt: fromIso(first.tokenExpiresAt),
            historyId: first.historyId,
            monitoringEnabled: accounts.some((account) => account.monitoringEnabled),
            digestEnabled: accounts.some((account) => account.digestEnabled),
            digestHour: first.digestHour,
            followUpDays: first.followUpDays,
            timezone: first.timezone,
            lastSyncedAt: latestDate(accounts.map((account) => account.lastSyncedAt)),
            lastDigestAt: latestDate(accounts.map((account) => account.lastDigestAt)),
        },
    });
};

const findConnection = async (userId: string): Promise<GmailConnectionRecord | null> =>
    prisma.gmailConnection.findUnique({ where: { userId } }) as Promise<GmailConnectionRecord | null>;

export const getGmailAccounts = async (userId: string): Promise<GmailAccountSummary[]> => {
    const connection = await findConnection(userId);
    if (!connection) return [];
    return loadAccountsFromConnection(connection).map(summary);
};

export const getGmailPrimaryEmail = async (userId: string): Promise<string | null> => {
    const connection = await findConnection(userId);
    return connection?.email || null;
};

const getStoredAccount = async (userId: string, accountId: string): Promise<{ connection: GmailConnectionRecord; account: StoredGmailAccount; accounts: StoredGmailAccount[] }> => {
    const connection = await findConnection(userId);
    if (!connection) throw new Error("Gmail is not connected.");
    const accounts = loadAccountsFromConnection(connection);
    const account = accounts.find((candidate) => candidate.id === accountId || candidate.email.toLowerCase() === accountId.toLowerCase());
    if (!account) throw new Error("Connected Gmail account was not found.");
    return { connection, account, accounts };
};

export const updateGmailAccount = async (userId: string, accountId: string, patch: Partial<Omit<StoredGmailAccount, "id" | "email" | "accessToken" | "refreshToken">>) => {
    const { connection, account, accounts } = await getStoredAccount(userId, accountId);
    Object.assign(account, patch);
    await saveAccounts(connection, accounts);
    return summary(account);
};

export const removeGmailAccount = async (userId: string, accountId: string) => {
    const { connection, account, accounts } = await getStoredAccount(userId, accountId);
    const remaining = accounts.filter((candidate) => candidate.id !== account.id);
    await saveAccounts(connection, remaining);
    return { removed: summary(account), remaining: remaining.map(summary) };
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

    const existingConnection = await findConnection(userId);
    const existingAccounts = existingConnection ? loadAccountsFromConnection(existingConnection) : [];
    const id = gmailAccountId(profile.emailAddress);
    const existingAccount = existingAccounts.find((account) => account.id === id);
    const account: StoredGmailAccount = {
        id,
        email: profile.emailAddress,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || existingAccount?.refreshToken || null,
        tokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
        historyId: profile.historyId || existingAccount?.historyId || null,
        monitoringEnabled: existingAccount?.monitoringEnabled ?? true,
        digestEnabled: existingAccount?.digestEnabled ?? true,
        digestHour: existingAccount?.digestHour ?? 8,
        followUpDays: existingAccount?.followUpDays ?? 3,
        timezone: existingAccount?.timezone ?? "UTC",
        lastSyncedAt: existingAccount?.lastSyncedAt ?? null,
        lastDigestAt: existingAccount?.lastDigestAt ?? null,
        unreadCount: existingAccount?.unreadCount ?? 0,
    };

    const accounts = existingAccount
        ? existingAccounts.map((candidate) => candidate.id === id ? account : candidate)
        : [...existingAccounts, account];

    if (!existingConnection) {
        const bundle: GmailAccountBundle = { version: BUNDLE_VERSION, accounts };
        await prisma.gmailConnection.create({
            data: {
                userId,
                email: account.email,
                accessTokenEnc: encryptMailSecret(JSON.stringify(bundle)),
                refreshTokenEnc: null,
                tokenExpiresAt: fromIso(account.tokenExpiresAt),
                historyId: account.historyId,
                monitoringEnabled: true,
                digestEnabled: true,
                digestHour: account.digestHour,
                followUpDays: account.followUpDays,
                timezone: account.timezone,
            },
        });
    } else {
        await saveAccounts(existingConnection, accounts);
    }
    return summary(account);
};

export const getValidGmailAccessToken = async (userId: string, accountId: string): Promise<string> => {
    const { connection, account, accounts } = await getStoredAccount(userId, accountId);
    const expiry = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : 0;
    if (expiry > Date.now() + 60_000) return account.accessToken;
    if (!account.refreshToken) throw new Error(`${account.email} authorization expired. Reconnect this Gmail account.`);

    const { clientId, clientSecret } = assertConfigured();
    const tokens = await tokenRequest(new URLSearchParams({
        refresh_token: account.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
    }));
    account.accessToken = tokens.access_token;
    account.tokenExpiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
    await saveAccounts(connection, accounts);
    return account.accessToken;
};

export const fetchGmailProfile = async (userId: string, accountId: string) => {
    const accessToken = await getValidGmailAccessToken(userId, accountId);
    return gmailGet<GmailProfile>("/profile", accessToken);
};

export const getUnreadGmailCount = async (userId: string, accountId: string): Promise<number> => {
    const accessToken = await getValidGmailAccessToken(userId, accountId);
    const label = await gmailGet<GmailLabel>("/labels/INBOX", accessToken);
    return Math.max(0, label.messagesUnread || 0);
};

export const listGmailMessages = async (userId: string, accountId: string, query: string, maxResults = 25) => {
    const accessToken = await getValidGmailAccessToken(userId, accountId);
    const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
    return gmailGet<{ messages?: { id: string; threadId: string }[]; resultSizeEstimate?: number }>(`/messages?${params.toString()}`, accessToken);
};

export const getGmailMessage = async (userId: string, accountId: string, messageId: string): Promise<GmailMessageMetadata> => {
    const accessToken = await getValidGmailAccessToken(userId, accountId);
    const params = new URLSearchParams();
    params.append("format", "metadata");
    for (const header of ["From", "To", "Reply-To", "Subject", "Date"]) params.append("metadataHeaders", header);
    return gmailGet<GmailMessageMetadata>(`/messages/${encodeURIComponent(messageId)}?${params.toString()}`, accessToken);
};

export const getGmailThread = async (userId: string, accountId: string, threadId: string): Promise<GmailThreadMetadata> => {
    const accessToken = await getValidGmailAccessToken(userId, accountId);
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
