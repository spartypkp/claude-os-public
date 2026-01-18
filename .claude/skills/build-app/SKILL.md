---
name: build-app
description: Build Custom App from APP-SPEC.md blueprint
---

# Build App Skill

Build a Custom App from an APP-SPEC.md blueprint. Generate backend services, MCP tools, and Dashboard UI, then verify everything works.

## When to Use

User wants to build a Custom App:
- "I want to build a job search tracker"
- "Create an app from this APP-SPEC"
- "Build the custom app"
- `/build-app`

**Prerequisites:** APP-SPEC.md must exist and be complete.

## The Flow

This is a technical workflow that may require spawning Builder Claude.

### Phase 1: Locate the Spec

**Ask: Where's the APP-SPEC.md?**
- Path to existing spec
- App name (will look in Desktop/[name]/APP-SPEC.md)

**Read and validate the spec:**
```
Read the APP-SPEC.md file
```

**Check completeness:**
- Purpose and user stories defined?
- Data schema specified?
- Features and UI described?
- Core App integrations listed?
- MCP tools defined?

**If incomplete:**
> "This spec is missing [X]. Want me to help complete it, or hand off to Idea Claude to flesh it out?"

### Phase 2: Decide Who Builds

**Two options:**

**Option 1: Chief builds (if simple)**
- Basic CRUD app
- No complex business logic
- Standard patterns

**Option 2: Spawn Builder (if complex)**
- Multi-table schema
- Complex integrations
- Custom features
- New patterns

**If spawning Builder:**
```python
team("spawn", role="builder", spec_path="Desktop/[app-name]/APP-SPEC.md", description="Building [app-name] custom app")
```

Hand off:
> "Builder Claude will handle this. They'll generate the code, run migrations, restart services, and verify everything works. Check the Dashboard to see their progress."

**Rest of this skill assumes Chief is building.**

### Phase 3: Generate Backend

Create backend structure in `.engine/src/apps/[name]/`:

**`__init__.py`** — App registration:
```python
from .service import [Name]Service
from .api import router

def register(app):
    """Called on backend startup."""
    service = [Name]Service()
    app.include_router(router, prefix="/api/[name]")
    return service
```

**`service.py`** — Business logic:
```python
from ..base import BaseService

class [Name]Service(BaseService):
    def __init__(self):
        super().__init__()
        self.db = get_db()

    def create(self, **kwargs):
        # Implementation based on APP-SPEC
        pass

    def list(self, **kwargs):
        # Implementation based on APP-SPEC
        pass

    def get(self, id: str, **kwargs):
        # Implementation based on APP-SPEC
        pass

    def update(self, id: str, **kwargs):
        # Implementation based on APP-SPEC
        pass

    def delete(self, id: str, **kwargs):
        # Implementation based on APP-SPEC
        pass
```

**`api.py`** — HTTP endpoints:
```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# Pydantic models based on APP-SPEC schema
class ItemCreate(BaseModel):
    # fields from APP-SPEC

@router.get("/items")
async def list_items():
    return service.list()

@router.post("/items")
async def create_item(data: ItemCreate):
    return service.create(**data.dict())

@router.get("/items/{item_id}")
async def get_item(item_id: str):
    return service.get(item_id)

@router.put("/items/{item_id}")
async def update_item(item_id: str, data: ItemCreate):
    return service.update(item_id, **data.dict())

@router.delete("/items/{item_id}")
async def delete_item(item_id: str):
    return service.delete(item_id)
```

**`schema.sql`** — Database tables:
```sql
CREATE TABLE IF NOT EXISTS [name]_items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    -- Additional fields from APP-SPEC
);

CREATE INDEX IF NOT EXISTS idx_[name]_items_created
    ON [name]_items(created_at);
```

### Phase 4: Generate MCP Tools

Create tool in `.engine/src/life_mcp/tools/[name].py`:

```python
from typing import Optional
from ..base import tool

@tool
def [name](
    operation: str,
    id: Optional[str] = None,
    **kwargs
) -> dict:
    """
    [App name] operations.

    Operations: create, list, get, update, delete
    """
    service = get_service('[name]')

    if operation == "create":
        return service.create(**kwargs)
    elif operation == "list":
        return service.list(**kwargs)
    elif operation == "get":
        if not id:
            return {"success": False, "error": "id required"}
        return service.get(id, **kwargs)
    elif operation == "update":
        if not id:
            return {"success": False, "error": "id required"}
        return service.update(id, **kwargs)
    elif operation == "delete":
        if not id:
            return {"success": False, "error": "id required"}
        return service.delete(id, **kwargs)

    return {"success": False, "error": f"Unknown operation: {operation}"}
```

Register in `.engine/src/life_mcp/tools/__init__.py`:
```python
from .[name] import [name]
```

### Phase 5: Generate Frontend

Create Dashboard page in `Dashboard/app/[name]/page.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';

export default function [Name]Page() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      const res = await fetch('http://localhost:5001/api/[name]/items');
      const data = await res.json();
      setItems(data);
    } catch (error) {
      console.error('Failed to fetch items:', error);
    } finally {
      setLoading(false);
    }
  };

  // Add create/update/delete handlers based on APP-SPEC

  if (loading) return <div>Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">[App Name]</h1>

      {/* UI components based on APP-SPEC */}

      <div className="space-y-4">
        {items.map(item => (
          <div key={item.id} className="border p-4 rounded">
            {/* Item display based on APP-SPEC */}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Phase 6: Run Migrations

Add schema to `.engine/config/schema.sql`:
```bash
cat .engine/src/apps/[name]/schema.sql >> .engine/config/schema.sql
```

Or create migration:
```bash
cd .engine && ./venv/bin/python -m alembic revision --autogenerate -m "Add [name] tables"
./venv/bin/python -m alembic upgrade head
```

### Phase 7: Restart Services

```python
service("restart", name="backend")
```

Wait 10 seconds for backend to start.

```python
service("restart", name="dashboard")
```

Wait 30 seconds for Dashboard to rebuild.

### Phase 8: Verify

**Test API:**
```bash
curl http://localhost:5001/api/[name]/items
```

Should return JSON (empty array is fine).

**Test MCP tool:**
```python
[name]("list")
```

Should return items or empty list.

**Test Dashboard:**
> "Open http://localhost:3000/[name] in your browser"

Confirm page loads without errors.

**Test create:**
```python
[name]("create", title="Test item")
```

Then verify it appears:
```python
[name]("list")
```

## Verify Completion

Success means:
1. Backend starts without import errors
2. API endpoints respond correctly
3. MCP tools are callable
4. Dashboard route loads
5. Data persists across restarts
6. User can perform basic operations

## Common Issues

**Import errors:**
- Check Python path in `__init__.py`
- Missing dependencies? Check requirements.txt
- Restart backend after fixing

**API returns 404:**
- Route not registered in `app.py`
- Typo in path
- Backend didn't restart properly

**Dashboard blank page:**
- Check browser console for errors
- Next.js build errors? Check terminal output
- Typo in route name?

**MCP tool not found:**
- Tool not registered in `life_mcp/__init__.py`
- Need to restart Claude Code (not just backend)
- Check tool function signature matches expected pattern

**Database errors:**
- Schema not created? Run migrations
- Table name typo?
- SQL syntax error in schema.sql

**Data doesn't persist:**
- Using wrong database connection
- Transactions not committed
- Check `.engine/config/schema.sql`

## Examples

### Example 1: Simple Tracker App

**User:** "Build my habit tracker app"

**Claude:**
1. Read: `Desktop/habit-tracker/APP-SPEC.md`
2. Validate spec is complete
3. "Spec looks good. This is straightforward — I'll build it."
4. Generate backend (service, api, schema)
5. Generate MCP tool
6. Generate frontend
7. Run migrations
8. Restart services
9. Test: `habit("list")` → Works
10. "Built! Open localhost:3000/habit-tracker. Try creating a habit."

### Example 2: Complex App (Delegate to Builder)

**User:** "Build my project management app"

**Claude:**
1. Read: `Desktop/project-mgmt/APP-SPEC.md`
2. "This spec has multi-table relationships, complex filtering, and integrations. I'll spawn Builder Claude — they're better suited for this."
3. `team("spawn", role="builder", spec_path="Desktop/project-mgmt/APP-SPEC.md")`
4. "Builder Claude is working on it. Check the Dashboard to see their progress. They'll verify everything works before finishing."

### Example 3: Incomplete Spec

**User:** "Build this app" (points to incomplete APP-SPEC)

**Claude:**
1. Read: `Desktop/app-name/APP-SPEC.md`
2. "This spec is missing the data schema and MCP tool definitions. Want me to help complete it, or should I spawn Idea Claude to flesh it out?"
3. User chooses Idea Claude
4. `team("spawn", role="idea", description="Complete APP-SPEC for [app-name]")`

## Technical Notes

- Existing apps in `.engine/src/apps/` are good templates
- API registration happens in `.engine/src/app.py`
- MCP registration in `.engine/src/life_mcp/server.py`
- Database is SQLite (`.engine/data/db/system.db`)
- Frontend is Next.js (App Router)
- Services must inherit from BaseService for consistency
- Pydantic models validate API inputs
- MCP tools follow operation-based pattern (CRUD via "operation" param)
- Dashboard routes are file-based (`app/[name]/page.tsx`)

## When to Delegate

**Delegate to Builder if:**
- Multi-table schema with relationships
- Complex business logic
- New architectural patterns
- Integration with external services
- You're not confident in the implementation

**Build directly if:**
- Simple CRUD app
- Following existing patterns
- Clear and complete APP-SPEC
- Straightforward requirements
