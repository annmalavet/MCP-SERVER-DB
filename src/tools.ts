import { server } from "./server"
import { z } from "zod"; 
import * as pg from 'pg';
const kReg = Symbol.for("mcp.registered");
const g = globalThis as any;
const registered = (g[kReg] ??= new Set());

const isCloudRun = !!process.env.K_SERVICE;
const dbConfig = {
      user: process.env.DB_USER ,
      password: process.env.DB_PASS ,
      database: process.env.DB_NAME ,
      host: process.env.DB_HOST ,
      port: parseInt(process.env.DB_PORT || '8080'),
      ssl: { rejectUnauthorized: false },
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

registerOnce(
  'update_person',
  {
    title: 'Update Person',
    description: 'Updates specific fields for a person record based on their unique email address.',
    inputSchema: z.object({
      email: z.string().email().describe('The email address of the person to update (used as the unique identifier).'),
      person: z.string().optional().describe('The full name of the person.'),
      subject: z.string().optional().describe('The academic subject.'),
      major: z.string().optional().describe('The academic major.'),
      gpa: z.number().min(0).max(4).optional().describe('The GPA (must be between 0.00 and 4.00).'),
    }),
  },
  async (params: any) => {
    const pool = new pg.Pool(dbConfig);
    
    try {
      const { email, ...updates } = params;
      const keys = Object.keys(updates);
      if (keys.length === 0) {
        return {
          content: [{ type: 'text', text: 'Error: No update fields provided. Please specify at least one column to change.' }],
          isError: true,
        };
      }
      const setClause = keys
        .map((key, index) => `${key} = $${index + 1}`)
        .join(', ');

      const sql = `
        UPDATE public.person 
        SET ${setClause} 
        WHERE email = $${keys.length + 1}
        RETURNING id, person, email;
      `;

      const values = [...Object.values(updates), email];
      
      const result = await pool.query(sql, values);

      if (result.rows.length === 0) {
        return {
          content: [{ type: 'text', text: `Error: No person found with email "${email}".` }],
          isError: true,
        };
      }

      const updatedPerson = result.rows[0];
      return {
        content: [{ 
          type: 'text', 
          text: `Success: Updated ${updatedPerson.person} (ID: ${updatedPerson.id}). Fields modified: ${keys.join(', ')}.` 
        }],
      };

    } catch (error: any) {
      console.error('Database error:', error);
      return {
        content: [{ type: 'text', text: `Database error: ${error.message}` }],
        isError: true,
      };
    } finally {
      await pool.end(); 
    }
  }
);