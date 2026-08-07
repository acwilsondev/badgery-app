import crypto from "node:crypto";
import argon2 from "argon2";
import { getUserByUsername, createUser as createUserRecord } from "../users/service";
import { UnauthorizedError, ApiError } from "../../middleware/errors";
import type { RegisterUser } from "@shared/schema";

// Verified against on login when the username doesn't exist, so a
// nonexistent-username request pays the same argon2id cost as a real one
// and can't be distinguished from a wrong-password request by timing.
// Stored as a Promise (not awaited here) rather than a top-level `await`:
// this repo's tsconfig.json doesn't set a `target` that supports top-level
// await, and scoping the fix to this file avoids widening a compiler
// setting that affects every other file's output for one hash call. The
// underlying argon2.hash() call still starts at module load, same as
// before — this only changes when it's *awaited*, not when it *starts*.
const dummyPasswordHashPromise = argon2.hash(
  crypto.randomBytes(32).toString("hex"),
);

export async function verifyCredentials(username: string, password: string) {
  const user = await getUserByUsername(username);
  // argon2.verify throws on malformed stored hashes (e.g. legacy
  // plaintext rows) — treat that as a failed login, not a 500. Always
  // verify against something (dummyPasswordHash when the user doesn't
  // exist) so the response time doesn't leak whether the username is
  // registered.
  const dummyPasswordHash = await dummyPasswordHashPromise;
  const passwordValid = await argon2
    .verify(user?.password ?? dummyPasswordHash, password)
    .catch(() => false);
  if (!user || !passwordValid) {
    throw new UnauthorizedError("Invalid credentials");
  }
  return user;
}

export class DuplicateUsernameError extends ApiError {
  constructor() {
    super("Username already exists", 400, "DUPLICATE_USERNAME");
  }
}

export async function registerUser(userData: RegisterUser) {
  const existingUser = await getUserByUsername(userData.username);
  if (existingUser) {
    throw new DuplicateUsernameError();
  }

  return createUserRecord({
    ...userData,
    password: await argon2.hash(userData.password),
  });
}
