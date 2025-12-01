import { server } from "./server"
import { z } from "zod"; 
import * as pg from 'pg';
const kReg = Symbol.for("mcp.registered");
const g = globalThis as any;
const registered = (g[kReg] ??= new Set());

const isCloudRun = !!process.env.K_SERVICE;
const dbConfig = isCloudRun
  ? {
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      host: `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}` 
    }
  : {
      user: process.env.DB_USER ,
      password: process.env.DB_PASS ,
      database: process.env.DB_NAME ,
      host: process.env.DB_HOST ,
      port: parseInt(process.env.DB_PORT || '0'),
    };

const searchDBSchema = {
    query: z.string().min(1).describe("The search term to look for in the database."),
};

function registerOnce(name: string, meta: any, handler: any) {
    if (registered.has(name)) return;
    server.registerTool(name, meta, handler);
    registered.add(name);
}

registerOnce(
  'search_database',
  {
    title: 'Search All People',
    description: 'Searches for email or major, limit 5 return.',
    inputSchema: searchDBSchema,
  },
  async (params: any) => {
    const pool = new pg.Pool(dbConfig);
    try {
        const query = params.query || '';
      const sql = `
        SELECT *
        FROM person 
        WHERE email ILIKE $1 OR major ILIKE $1 
        LIMIT 5;
      `;
      const values = [`%${query}%`];
      
      const result = await pool.query(sql, values);

      if (result.rows.length === 0) {
        return {
          content: [{ type: 'text', text: 'No results found matching your query.' }],
        };
      }

      const formattedResults = result.rows
        .map((row: { id: any; email: any; salary: any; gpa: any;}) => `ID: ${row.id} | Email: ${row.email} | Salary: ${row.salary} | GPA: ${row.gpa}`)
        .join('\n---\n');

      return {
        content: [{ type: 'text', text: formattedResults }],
      };
    } catch (error: any) {
      console.error('Database error:', error);
      return {
        content: [{ type: 'text', text: `Database error: ${error.message}` }],
        isError: true,
      };
    }
  }
);