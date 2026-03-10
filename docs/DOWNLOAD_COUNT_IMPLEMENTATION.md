# Download Count Implementation

## Overview
This document describes the implementation of the download count tracking system for OpenCLEW agents.

## Architecture

### Database Schema

#### agents table
- `downloads_count` (INTEGER, DEFAULT 0): Stores the total number of downloads for each agent
- Automatically updated via database trigger

#### downloads table
- Records every download event with metadata:
  - `agent_id`: Reference to the agent
  - `user_id`: Reference to the user who downloaded
  - `version`: Version of the agent downloaded
  - `ip_address`: IP address of the downloader
  - `user_agent`: Browser/client user agent
  - `downloaded_at`: Timestamp of download

### Database Trigger

The download count is automatically updated using a PostgreSQL trigger:

```sql
CREATE OR REPLACE FUNCTION update_agent_downloads()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE agents
  SET downloads_count = downloads_count + 1
  WHERE id = NEW.agent_id;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_agent_downloads_on_download
AFTER INSERT ON downloads
FOR EACH ROW EXECUTE FUNCTION update_agent_downloads();
```

**Benefits:**
- Atomic operation - no race conditions
- Automatic - no application code needed
- Consistent - works even if download is created directly in database
- Performant - single database operation

## API Endpoints

### 1. Download Agent
```
POST /api/agents/:id/download
```
- Requires authentication
- Creates download record
- Trigger automatically increments `downloads_count`
- Returns the agent package file

### 2. Get Agent Statistics
```
GET /api/agents/:id/stats
```
- Public endpoint
- Returns comprehensive statistics:
  - `downloads_count`: Total downloads
  - `rating_average`: Average rating
  - `reviews_count`: Total reviews
  - `download_details`:
    - `total_downloads`: Total download records
    - `unique_users`: Number of unique users who downloaded
    - `active_days`: Number of days with downloads
    - `last_download_at`: Timestamp of last download

### 3. Get Trending Agents
```
GET /api/agents/trending?limit=10&days=7
```
- Public endpoint
- Returns agents sorted by recent download activity
- Parameters:
  - `limit`: Number of agents to return (default: 10)
  - `days`: Time window for "recent" downloads (default: 7)

## Models

### AgentModel Methods

#### `incrementDownloads(agentId)`
Manual method to increment download count (usually not needed due to trigger)

#### `getDownloadStats(agentId)`
Get detailed download statistics for an agent

#### `getTrending({ limit, days })`
Get trending agents based on recent download activity

### DownloadModel Methods

#### `create(downloadData)`
Create a new download record (triggers automatic count update)

#### `hasUserDownloaded(userId, agentId)`
Check if a user has downloaded a specific agent

#### `getAgentStats(agentId)`
Get download statistics for an agent

#### `getUserDownloads(userId, { page, pageSize })`
Get download history for a user

## Testing

Run the test script to verify the download count functionality:

```bash
cd backend
node scripts/test-download-count.js
```

The test script verifies:
1. Download records are created correctly
2. Trigger automatically increments `downloads_count`
3. Multiple downloads are counted correctly
4. Statistics are calculated accurately

## Concurrency Safety

The database trigger ensures atomic updates to `downloads_count`:
- Uses `downloads_count = downloads_count + 1` (atomic increment)
- No race conditions even with concurrent downloads
- PostgreSQL handles transaction isolation automatically

## Performance Considerations

1. **Indexing**: The `downloads` table has indexes on:
   - `agent_id` - for fast agent lookup
   - `user_id` - for user download history
   - `downloaded_at` - for time-based queries

2. **Trigger Overhead**: Minimal - single UPDATE statement per download

3. **Statistics Queries**: Use aggregation functions efficiently
   - `COUNT(DISTINCT user_id)` for unique users
   - `MAX(downloaded_at)` for last download time

## Future Enhancements

1. **Download Analytics Dashboard**
   - Daily/weekly/monthly download trends
   - Geographic distribution
   - Version popularity

2. **Caching**
   - Cache download counts in Redis for high-traffic agents
   - Invalidate cache on download

3. **Rate Limiting**
   - Prevent download spam from same user/IP
   - Implement cooldown period

4. **Download Verification**
   - Track successful vs failed downloads
   - Verify package integrity

## Migration

The download count functionality is included in the initial migration:
- `backend/migrations/001_create_initial_tables.sql`

If you need to add it to an existing database:
```sql
-- Add column if not exists
ALTER TABLE agents ADD COLUMN IF NOT EXISTS downloads_count INTEGER DEFAULT 0;

-- Create trigger function
CREATE OR REPLACE FUNCTION update_agent_downloads()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE agents
  SET downloads_count = downloads_count + 1
  WHERE id = NEW.agent_id;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger
CREATE TRIGGER update_agent_downloads_on_download
AFTER INSERT ON downloads
FOR EACH ROW EXECUTE FUNCTION update_agent_downloads();

-- Backfill existing counts
UPDATE agents a
SET downloads_count = (
  SELECT COUNT(*) FROM downloads d WHERE d.agent_id = a.id
);
```

## Troubleshooting

### Download count not updating
1. Check if trigger exists:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'update_agent_downloads_on_download';
   ```

2. Verify trigger function:
   ```sql
   SELECT * FROM pg_proc WHERE proname = 'update_agent_downloads';
   ```

3. Test manually:
   ```sql
   INSERT INTO downloads (agent_id, user_id, version)
   VALUES ('agent-uuid', 'user-uuid', '1.0.0');

   SELECT downloads_count FROM agents WHERE id = 'agent-uuid';
   ```

### Count mismatch
Recalculate counts from download records:
```sql
UPDATE agents a
SET downloads_count = (
  SELECT COUNT(*) FROM downloads d WHERE d.agent_id = a.id
)
WHERE a.id = 'agent-uuid';
```
