-- Bookings created through the MCP server need their own creation source for auditability
ALTER TYPE "CreationSource" ADD VALUE IF NOT EXISTS 'mcp';
