-- Populate system design and debugging speedrun questions

-- System Design Questions (6 total)
INSERT INTO leetcode_problems (problem_number, name, slug, category, domain, front_text, back_text) VALUES
(20001, 'Cache or Database?', 'cache-or-database', 'System Design', 'system-design',
 'Your read-heavy service (95% reads, 5% writes) has 1000 req/sec. Database is struggling. What do you add and why?',
 '**Pattern:** Add caching layer (Redis/Memcached)

**Why:** Read-heavy workload benefits from cache. Cache serves frequent queries in <1ms vs DB 10-50ms.

**Approach:** Cache-aside pattern. Check cache first, miss → fetch DB → populate cache. TTL for staleness control.

**Trade-off:** Eventual consistency (cached data can be stale). Acceptable for read-heavy.

**Signals:** Read-heavy + performance issue = add cache'),

(20002, 'SQL vs NoSQL for User Profiles', 'sql-vs-nosql-user-profiles', 'System Design', 'system-design',
 'You''re storing user profiles (name, email, preferences). Strong consistency required. Relationships rare. SQL or NoSQL?',
 '**Pattern:** Either works, slight preference SQL

**Why:** Strong consistency requirement. Both support it (PostgreSQL ACID, DynamoDB strongly consistent reads).

**SQL advantage:** ACID by default, easier to add relationships later.

**NoSQL advantage:** Easier horizontal scaling if you need it.

**Decision:** SQL (PostgreSQL) unless you know you''ll need massive scale. Easier to reason about.

**Signals:** ACID required + uncertain scale = SQL default'),

(20003, 'Message Queue for Async Jobs', 'message-queue-async-jobs', 'System Design', 'system-design',
 'Your web app needs to send 1000 emails after user signup. Sending synchronously makes signup slow (10+ seconds). How do you fix this?',
 '**Pattern:** Message queue (Redis Queue, Celery, SQS)

**Why:** Decouple slow work from request-response cycle. Return immediately, process async.

**Approach:** Web server writes job to queue, returns 200. Background workers poll queue, send emails.

**Trade-off:** Eventual processing (not immediate). Need worker monitoring.

**Signals:** Slow background work + user-facing request = message queue'),

(20004, 'CDN for Static Assets', 'cdn-static-assets', 'System Design', 'system-design',
 'Your site serves users globally. 60% of page load time is downloading images/CSS/JS. Users in Asia see 500ms latency. How do you improve this?',
 '**Pattern:** CDN (CloudFront, Cloudflare)

**Why:** Static assets cacheable. Serve from edge locations near users (Tokyo, Singapore) instead of origin (US).

**Approach:** Configure CDN to cache static paths (/images/*, /static/*). First request fetches from origin, subsequent requests served from edge.

**Impact:** Latency drops from 500ms to 20-50ms.

**Signals:** Static content + global users + high latency = CDN'),

(20005, 'Database Indexing', 'database-indexing', 'System Design', 'system-design',
 'You have a users table (10M rows). Query `SELECT * FROM users WHERE email = ''x@y.com''` takes 2 seconds. How do you fix this?',
 '**Pattern:** Add B-tree index on email column

**Why:** Full table scan is O(n). Index is O(log n) lookup.

**Approach:** `CREATE INDEX idx_email ON users(email);` Lookups now <10ms.

**Trade-off:** Slower writes (index must be updated on INSERT/UPDATE). Acceptable for read-heavy.

**Signals:** Slow query on WHERE clause = missing index'),

(20006, 'Database Sharding vs Replication', 'database-sharding-vs-replication', 'System Design', 'system-design',
 'Your database is at 90% write capacity. Adding more read replicas doesn''t help. What do you do?',
 '**Pattern:** Sharding (horizontal partitioning)

**Why:** Replicas help reads, not writes. All writes go to primary. Need to distribute writes across multiple primaries.

**Approach:** Partition data by key (user_id % N). Each shard has own primary. Write capacity multiplies by N.

**Trade-off:** Can''t join across shards. Complex re-sharding later.

**Signals:** Write bottleneck + replication doesn''t help = sharding');

-- Debugging Questions (5 total)
INSERT INTO leetcode_problems (problem_number, name, slug, category, domain, front_text, back_text) VALUES
(30001, 'High CPU Usage', 'high-cpu-usage', 'Debugging', 'debugging',
 'Production server at 95% CPU. Application is Python web service. No recent deploys. What do you investigate first?',
 '**Pattern:** Profile CPU to find hotspot

**Why:** Need to know WHERE cycles are going. Guessing wastes time.

**Approach:** Attach profiler (py-spy, cProfile). Look for function consuming most time. Common causes: infinite loop, N+1 queries, inefficient algorithm.

**Next steps:** Once hotspot identified, decide fix (optimize code, add caching, add worker capacity).

**Signals:** CPU spike + no deploy = profile first, guess second'),

(30002, 'Memory Leak', 'memory-leak', 'Debugging', 'debugging',
 'Python service slowly grows from 200MB to 8GB over 3 days, then OOMs. What''s likely happening and how do you confirm?',
 '**Pattern:** Memory leak (objects not garbage collected)

**Why:** Gradual growth suggests accumulation. Python GC should collect unused objects unless references held.

**Approach:** Use memory profiler (tracemalloc, objgraph). Find objects growing unbounded (likely list/dict/cache with no eviction).

**Common causes:** Global cache without size limit, circular references, file handles not closed.

**Signals:** Gradual memory growth + eventual OOM = leak'),

(30003, 'Intermittent Timeouts', 'intermittent-timeouts', 'Debugging', 'debugging',
 'API endpoint returns 504 timeout for ~5% of requests. Other 95% respond in <100ms. No pattern by time of day. What do you check?',
 '**Pattern:** Downstream dependency flaking

**Why:** Bimodal latency (fast or timeout, no middle) suggests external service occasionally hanging.

**Approach:** Add tracing to see which downstream call times out. Check that service''s logs/metrics. May need retry logic or circuit breaker.

**Alternative:** Could be DB slow query on specific inputs. Check slow query log.

**Signals:** Intermittent timeout + fast otherwise = flaky dependency'),

(30004, 'Sudden 500 Errors', 'sudden-500-errors', 'Debugging', 'debugging',
 'Service was healthy. Deployed config change. Now 50% of requests return 500. Logs show ''Connection refused'' to database. What happened?',
 '**Pattern:** Configuration error (wrong DB host/port)

**Why:** Config change + sudden onset + connection refused = misconfiguration.

**Approach:** Rollback config immediately. Check diff for DB connection string. Likely typo or wrong environment variable.

**Prevention:** Validate config before deploy, canary rollout.

**Signals:** Deploy → immediate error = rollback first, debug second'),

(30005, 'Database Deadlock', 'database-deadlock', 'Debugging', 'debugging',
 'PostgreSQL logs show deadlock detected. Two transactions waiting on each other. How do you prevent this?',
 '**Pattern:** Lock ordering inconsistency

**Why:** Transaction A locks row 1 then row 2. Transaction B locks row 2 then row 1. Both wait forever.

**Fix:** Ensure all transactions acquire locks in same order (e.g., always ORDER BY id).

**Alternative:** Reduce transaction scope (hold locks shorter), use optimistic locking (version column).

**Signals:** Deadlock = lock ordering problem');
