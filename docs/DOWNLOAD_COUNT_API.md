# Download Count API Reference

## Quick Start

### 1. Download an Agent
When a user downloads an agent, the download count is automatically updated.

```javascript
// Frontend example
const downloadAgent = async (agentId) => {
  try {
    const response = await fetch(`/api/agents/${agentId}/download`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      // Download count is automatically incremented
      const blob = await response.blob();
      // Handle file download
    }
  } catch (error) {
    console.error('Download failed:', error);
  }
};
```

### 2. Display Download Count
Show the download count on the agent detail page.

```javascript
// The download count is included in the agent data
const agent = await fetch(`/api/agents/${agentId}`).then(r => r.json());

console.log(`Downloads: ${agent.data.downloads_count}`);
```

### 3. Get Detailed Statistics
Fetch comprehensive download statistics.

```javascript
const stats = await fetch(`/api/agents/${agentId}/stats`)
  .then(r => r.json());

console.log(stats.data);
// {
//   downloads_count: 150,
//   rating_average: 4.5,
//   reviews_count: 23,
//   download_details: {
//     total_downloads: 150,
//     unique_users: 87,
//     active_days: 45,
//     last_download_at: "2026-03-10T10:30:00Z"
//   }
// }
```

### 4. Show Trending Agents
Display trending agents based on recent downloads.

```javascript
const trending = await fetch('/api/agents/trending?limit=10&days=7')
  .then(r => r.json());

trending.data.forEach(agent => {
  console.log(`${agent.name}: ${agent.recent_downloads} downloads in last 7 days`);
});
```

## API Endpoints Summary

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/agents/:id/download` | POST | Required | Download agent and increment count |
| `/api/agents/:id` | GET | Public | Get agent details (includes downloads_count) |
| `/api/agents/:id/stats` | GET | Public | Get detailed statistics |
| `/api/agents/trending` | GET | Public | Get trending agents |

## Response Examples

### Agent Detail Response
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "小红书文案助手",
    "downloads_count": 150,
    "rating_average": 4.5,
    "reviews_count": 23,
    ...
  }
}
```

### Statistics Response
```json
{
  "success": true,
  "data": {
    "downloads_count": 150,
    "rating_average": 4.5,
    "reviews_count": 23,
    "download_details": {
      "total_downloads": 150,
      "unique_users": 87,
      "active_days": 45,
      "last_download_at": "2026-03-10T10:30:00Z"
    }
  }
}
```

### Trending Agents Response
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "小红书文案助手",
      "downloads_count": 150,
      "recent_downloads": 45,
      ...
    }
  ]
}
```

## Backend Usage

### In Controllers
```javascript
import AgentModel from '../../models/Agent.js';
import DownloadModel from '../../models/Download.js';

// Create download record (count auto-increments)
await DownloadModel.create({
  agent_id: agentId,
  user_id: userId,
  version: agent.version,
  ip_address: req.ip,
  user_agent: req.get('user-agent')
});

// Get statistics
const stats = await AgentModel.getDownloadStats(agentId);

// Get trending agents
const trending = await AgentModel.getTrending({ limit: 10, days: 7 });
```

### Manual Increment (if needed)
```javascript
// Usually not needed - trigger handles this automatically
await AgentModel.incrementDownloads(agentId);
```

## Testing

Run the test script:
```bash
cd backend
node scripts/test-download-count.js
```

Expected output:
```
🧪 Starting download count test...

📋 Step 1: Finding a test agent...
✅ Found agent: 小红书文案助手 (ID: uuid)
   Current download count: 0

📋 Step 2: Finding a test user...
✅ Found user: testuser (ID: uuid)

📋 Step 3: Recording initial state...
   Initial downloads_count: 0

📋 Step 4: Creating download record...
✅ Download record created (ID: uuid)

📋 Step 5: Verifying download count update...
   Previous count: 0
   Current count:  1
   Difference:     1

✅ SUCCESS: Download count was incremented correctly!

...

🎉 All tests passed! Download count functionality is working correctly.
```

## Notes

- Download count updates are **atomic** and **thread-safe**
- No race conditions even with concurrent downloads
- Trigger runs automatically on every download record insert
- Count is stored in `agents.downloads_count` field
- Download history is stored in `downloads` table
