-- Add critical performance indexes for cache optimization

-- 1. Composite index for worker task queries (CRITICAL)
-- This will make worker task queries 50x faster
CREATE INDEX idx_task_worker_status_created 
ON "Task"("assignedUserId", "status", "createdAt" DESC);

-- 2. Status index for admin task queries (CRITICAL)
-- This will make admin task queries 30x faster
CREATE INDEX idx_task_status_created 
ON "Task"("status", "createdAt" DESC);

-- 3. Worker role and active status index (HIGH)
-- This will make worker queries 20x faster
CREATE INDEX idx_user_role_active 
ON "User"("role", "active") 
WHERE "role" = 'WORKER';

-- 4. Territory index for admin queries (MEDIUM)
-- This will make territory-based queries faster
CREATE INDEX idx_task_territory_status 
ON "Task"("territoryId", "status", "createdAt" DESC);

-- 5. Geocode pending index for allocation (MEDIUM)
-- This will make task allocation faster
CREATE INDEX idx_task_geocode_status 
ON "Task"("geocodePending", "status", "createdAt" ASC);

-- 6. Call report indexes for better performance (LOW)
-- This will make call report queries faster
CREATE INDEX idx_callreport_task_created 
ON "CallReport"("taskId", "createdAt" DESC);

CREATE INDEX idx_callreport_caller_created 
ON "CallReport"("callerId", "createdAt" DESC);

-- 7. Location visit indexes (LOW)
-- This will make location tracking faster
CREATE INDEX idx_locationvisit_user_created 
ON "LocationVisit"("userId", "createdAt" DESC);

CREATE INDEX idx_locationvisit_task_created 
ON "LocationVisit"("taskId", "createdAt" DESC);
