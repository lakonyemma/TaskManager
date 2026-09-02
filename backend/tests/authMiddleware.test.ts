import assert from "node:assert/strict";
import test from "node:test";
import { authenticate } from "../src/middleware/authMiddleware.js";
import { signAccessToken, signRefreshToken } from "../src/utils/auth.js";

const user = { id: "user-1", email: "user@example.com" };

const runAuthentication = (token: string) => {
    let statusCode: number | undefined;
    let responseBody: unknown;
    let nextCalled = false;
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = {
        status: (code: number) => {
            statusCode = code;
            return { json: (body: unknown) => { responseBody = body; return body; } };
        },
    };
    authenticate(req as never, res as never, () => { nextCalled = true; });
    return { statusCode, responseBody, nextCalled };
};

test("accepts a short-lived access token", () => {
    const result = runAuthentication(signAccessToken(user));
    assert.equal(result.nextCalled, true);
    assert.equal(result.statusCode, undefined);
});

test("rejects a refresh token at an access-protected endpoint", () => {
    const result = runAuthentication(signRefreshToken(user, "session-1"));
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 401);
    assert.deepEqual(result.responseBody, { message: "Access token required" });
});
