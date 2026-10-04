import { Context } from "hono";
import { CONSTANTS } from "../constants";
import { recordAuditEvent } from "../audit";
import { getDatabaseVersion, initializeDatabase, migrateDatabase } from "../database";

async function changeDatabase(c: Context<HonoCustomType>, action: 'initialize' | 'migrate') {
    let result;
    try {
        result = await (action === 'initialize' ? initializeDatabase : migrateDatabase)(c.env.DB);
    } catch (error) {
        await recordAuditEvent(c, { action: `db.${action}.failed`, resource_type: 'database', status: 'failed' });
        throw error;
    }
    await recordAuditEvent(c, {
        action: `db.${action}.${result.changed ? 'success' : 'skipped'}`,
        resource_type: "database",
        status: result.changed ? "success" : "skipped",
        metadata: { from_version: result.from, to_version: CONSTANTS.DB_VERSION },
    });
    if (action === 'initialize') return c.json({ message: result.changed ? "Database initialized" : "Database already initialized" });
    return c.json({ success: true, message: result.changed ? "Database migrated" : "Database does not need migration" });
}

export default {
    initialize: (c: Context<HonoCustomType>) => changeDatabase(c, 'initialize'),
    migrate: (c: Context<HonoCustomType>) => changeDatabase(c, 'migrate'),
    getVersion: async (c: Context<HonoCustomType>) => {
        const version = await getDatabaseVersion(c.env.DB);
        return c.json({
            need_initialization: !version,
            need_migration: version && version != CONSTANTS.DB_VERSION,
            current_db_version: version,
            code_db_version: CONSTANTS.DB_VERSION,
        });
    },
}
