import "dotenv/config";

import { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";


// Supabase's certificate chain is flagged as "self-signed" by Node's default
// TLS validation (a known Supabase + node-postgres interaction, not a real
// MITM risk — the connection is still encrypted, this only skips chain-of-
// trust validation). sslmode=require in the connection string alone doesn't
// disable this check; it has to be set explicitly here.
const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
});


const prisma = new PrismaClient({
    adapter,
});


export default prisma;