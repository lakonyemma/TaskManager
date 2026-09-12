import crypto from "node:crypto";

const secret = () => {
    const value = process.env.GMAIL_OAUTH_STATE_SECRET || process.env.GMAIL_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET;
    if (!value) throw new Error("[mail] OAuth state secret is not configured.");
    return value;
};

type StatePayload = { userId: string; returnTo: string; exp: number };

const sign = (encoded: string) => crypto.createHmac("sha256", secret()).update(encoded).digest("base64url");

export const createMailOAuthState = (userId: string, returnTo = "/app/mail"): string => {
    const safeReturnTo = returnTo.startsWith("/app") ? returnTo : "/app/mail";
    const payload: StatePayload = { userId, returnTo: safeReturnTo, exp: Date.now() + 10 * 60 * 1000 };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encoded}.${sign(encoded)}`;
};

export const verifyMailOAuthState = (state: string): StatePayload => {
    const [encoded, signature] = state.split(".");
    if (!encoded || !signature) throw new Error("Invalid OAuth state");
    const expected = sign(encoded);
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw new Error("Invalid OAuth state signature");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as StatePayload;
    if (!payload.userId || !payload.exp || payload.exp < Date.now()) throw new Error("OAuth state expired");
    if (!payload.returnTo.startsWith("/app")) payload.returnTo = "/app/mail";
    return payload;
};
