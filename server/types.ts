import { Session as _Session } from "express-session";

declare module "express-session" {
  interface Session {
    userId?: number;
    organizationId?: number;
  }
}
