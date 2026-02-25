-- Populate concurrency speedrun questions
INSERT INTO leetcode_problems (problem_number, name, slug, category, domain, front_text, back_text) VALUES
(10001, 'I/O-Bound Many Requests', 'io-bound-many-requests', 'Concurrency', 'concurrency',
 'You need to download 500 web pages. Each request takes 200-500ms. Sequential would take 2-3 minutes. What concurrency approach do you use and why?',
 '**Pattern:** Async/await (asyncio)

**Why:** I/O-bound work. Async handles thousands of concurrent I/O operations on single thread without blocking. Event loop switches between tasks while waiting for network.

**Approach:** Create coroutines for each download, use asyncio.gather() to run concurrently. Total time ~500ms (slowest request).

**Signals:** I/O-bound + many operations + Python = async/await'),

(10002, 'CPU-Bound Parallel Computation', 'cpu-bound-parallel-computation', 'Concurrency', 'concurrency',
 'You need to process 8 large CSV files (5GB each). Each requires CPU-intensive parsing and transformation. How do you parallelize this?',
 '**Pattern:** Multiprocessing

**Why:** CPU-bound work. Threading won''t help due to GIL. Need true parallelism across cores.

**Approach:** multiprocessing.Pool with pool.map(). Split files across worker processes (one per core). Each runs in separate Python interpreter (no GIL contention).

**Signals:** CPU-bound + Python = multiprocessing (GIL workaround)'),

(10003, 'Rate Limiting', 'rate-limiting', 'Concurrency', 'concurrency',
 'You''re calling a third-party API limited to 10 requests/second and 100 requests/hour. You need to make 5,000 requests. How do you respect both limits?',
 '**Pattern:** Semaphore + Token Bucket

**Why:** Need to enforce concurrent limit (10 at once) AND global rate (100/hour).

**Approach:** asyncio.Semaphore(10) for concurrent limit. Track request count with timestamp, sleep if nearing hourly quota. Async for efficiency while waiting.

**Signals:** Multiple rate limits + many requests = semaphore + rate tracking'),

(10004, 'Async Web Crawler Politeness', 'async-web-crawler-politeness', 'Concurrency', 'concurrency',
 'You''re building a web crawler. Must respect politeness (max 1 request/second per domain, max 20 concurrent total). Each page has links to crawl. How do you structure this?',
 '**Pattern:** Global semaphore + per-domain semaphores + async queue

**Why:** Two-level rate limiting (global + per-domain). Async for I/O efficiency.

**Approach:** asyncio.Semaphore(20) for global limit. Dict of per-domain semaphores. Producer-consumer queue for discovered URLs. Async sleep for 1-second per-domain delay.

**Signals:** Hierarchical rate limits + I/O-bound = multi-level semaphores + async'),

(10005, 'Blocking Operation in Event Loop', 'blocking-operation-event-loop', 'Concurrency', 'concurrency',
 'Your async web server is slow under load. Profiling shows some requests take 500ms in `bcrypt.hashpw()` (CPU-bound). What''s the problem and how do you fix it?',
 '**Pattern:** Run in thread pool executor

**Why:** bcrypt is blocking CPU work, holds event loop during execution. Blocks all other async tasks.

**Approach:** `await loop.run_in_executor(None, bcrypt.hashpw, password, salt)` runs bcrypt in thread pool, yields event loop while waiting.

**Signals:** Blocking operation in async code = run_in_executor'),

(10006, 'Async Timeout Handling', 'async-timeout-handling', 'Concurrency', 'concurrency',
 'You''re making async HTTP requests to unreliable APIs. Some hang indefinitely. How do you enforce a 5-second timeout per request?',
 '**Pattern:** asyncio.wait_for()

**Why:** Prevents hanging tasks from blocking resources forever.

**Approach:** `await asyncio.wait_for(fetch(url), timeout=5.0)` raises TimeoutError if not complete in 5s. Catch and handle (retry, skip, log).

**Signals:** Unreliable I/O + need timeout = wait_for'),

(10007, 'Threading vs Multiprocessing Decision', 'threading-vs-multiprocessing-decision', 'Concurrency', 'concurrency',
 'You have a batch job processing 10,000 images (resize, filter, save). Each image is independent. Threading or multiprocessing?',
 '**Pattern:** Multiprocessing

**Why:** Image processing is CPU-intensive (pixel manipulation). Threading hits GIL. Need true parallelism.

**Exception:** If using NumPy/Pillow (release GIL for C operations), threading MAY work but multiprocessing is safer bet.

**Signals:** CPU-bound batch processing = multiprocessing');
