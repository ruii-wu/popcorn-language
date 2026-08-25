import 'dotenv/config';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith('file:')) process.exit(0);

const rawPath = decodeURIComponent(databaseUrl.slice('file:'.length).split('?')[0]);
if (!rawPath || rawPath === ':memory:') process.exit(0);

// Prisma resolves relative SQLite URLs from the directory containing schema.prisma.
const schemaDir = path.resolve(process.cwd(), 'prisma');
const databasePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(schemaDir, rawPath);
mkdirSync(path.dirname(databasePath), { recursive: true });
closeSync(openSync(databasePath, 'a'));
