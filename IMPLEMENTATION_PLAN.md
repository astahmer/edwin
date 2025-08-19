# Edwin Project Modernization Plan

## Overview
This document outlines the comprehensive modernization plan for the Edwin project, focusing on updating the codebase to use modern Effect.js patterns, improving the database schema, and implementing best practices.

## Phase 1: Environment & Configuration (Priority: High)

### 1.1 Update env.config.ts
**Current state**: Only has GitHub OAuth keys
**Actions needed**:
- Add `DATABASE_URL` environment variable
- Add other missing environment variables based on usage throughout codebase
- Update schema validation

### 1.2 Replace hardcoded ./edwin.db references
**Current state**: Found in 4 files (auth.ts, kysely.ts, drizzle.config.ts, README.md)
**Actions needed**:
- Add `DATABASE_URL=./edwin.db` to environment variables
- Replace all hardcoded references with env var usage

## Phase 2: Database Schema Modernization (Priority: High)

### 2.1 Install Better Auth tables
**Current state**: Basic user tables exist, but missing Better Auth specific tables
**Actions needed**:
- Run `npx @better-auth/cli generate` to see required tables
- Add missing tables: `session`, `account`, `verification`, potentially `two_factor`
- Update existing tables to match Better Auth schema requirements

### 2.2 Drizzle schema improvements
**Current state**: Using named imports, duplicated column names in arguments
**Actions needed**:
- Change to `import * as sqlite from "drizzle-orm/sqlite-core"`
- Remove redundant column name arguments: `name: text("name")` → `name: sqlite.text()`
- Use singular table names instead of plural

### 2.3 Database table naming convention
**Current state**: Plural table names (users, repos, userStars)
**Actions needed**:
- Rename tables to singular: `user`, `repo`, `userStar`
- Update all references in code

## Phase 3: Effect.js Modernization (Priority: High)

### 3.1 Replace Context.GenericTag with Effect.Service
**Current state**: All services use `Context.GenericTag` + `Layer.succeed`
**Services to update**:
- `DatabaseService` (kysely.ts)
- `GitHubClient` (GitHubClient.ts)
- `StreamService` (StreamService.ts)
- `DataSyncService` (DataSyncService.ts)
- `StarIngestor` (StarIngestor.ts)

**New pattern**:
```typescript
class DatabaseService extends Effect.Service<DatabaseService>()("DatabaseService", {
  effect: Effect.gen(function* () {
    // Implementation
    return {
      // methods
    }
  })
}) {}
```

### 3.2 Replace Effect.gen underscore pattern
**Current state**: Using `yield* _(serviceCall)`
**Actions needed**: 
- Replace all `yield* _` with direct `yield*`
- Update all Effect.gen functions throughout codebase

### 3.3 Replace while loops with Effect Streams
**Current state**: `while (true)` loop in StarIngestor.ts
**Actions needed**:
- Use `Stream.iterate` or `Stream.unfold` for pagination
- Implement proper stream-based data fetching

## Phase 4: Error Handling Improvements (Priority: Medium)

### 4.1 Replace generic Error throwing with Effect Schema.TaggedError
**Current state**: Using `throw new Error()` and `new Error()`
**Actions needed**:
- Create specific error types using `Schema.TaggedError`
- Replace error throwing with proper Effect error handling
- Examples: `GitHubRateLimitError`, `DatabaseError`, `AuthenticationError`

## Phase 5: File Naming Convention (Priority: Medium)

### 5.1 Rename PascalCase files to kebab-case
**Current files to rename**:
- `GitHubClient.ts` → `github-client.ts`
- `DataSyncService.ts` → `data-sync-service.ts`
- `StarIngestor.ts` → `star-ingestor.ts`
- `StreamService.ts` → `stream-service.ts`
- `DefaultCatchBoundary.tsx` → `default-catch-boundary.tsx`
- `NotFound.tsx` → `not-found.tsx`

## Phase 6: Performance Optimizations (Priority: Medium)

### 6.1 Batch database operations
**Current state**: Individual insert/update/upsert operations
**Actions needed**:
- Replace single-row operations with batch operations
- Use Drizzle's batch insert/update capabilities
- Implement transaction boundaries for related operations

### 6.2 Remove redundant interfaces
**Current state**: Separate interfaces and service implementations
**Actions needed**:
- Leverage Effect.Service type inference
- Remove duplicate type definitions where possible

## Phase 7: Development Tools (Priority: Low)

### 7.1 Install and configure Biome v2
**Actions needed**:
- `npm install --save-dev @biomejs/biome@latest`
- Configure `biome.json` for formatter-only usage
- Disable linting, enable only formatting
- Update package.json scripts

### 7.2 Fix TypeScript compilation errors
**Current errors**: Type mismatches in StarIngestor.ts (6 errors found)
**Actions needed**:
- Fix GitHub repo ID type mismatches (number vs string)
- Fix missing properties in type definitions
- Ensure all types align with schema definitions

## Implementation Order

1. **Phase 1**: Environment setup (quick wins)
2. **Phase 2**: Database schema (foundation for everything else)  
3. **Phase 3**: Effect.js modernization (major refactor)
4. **Phase 4**: Error handling (quality improvement)
5. **Phase 7.2**: Fix TypeScript errors (blocking issues)
6. **Phase 5**: File renaming (cosmetic but consistency)
7. **Phase 6**: Performance optimizations (optimization)
8. **Phase 7.1**: Development tools (developer experience)

## Risk Assessment

**High Risk**: 
- Database schema changes (potential data loss)
- Service pattern changes (major API changes)

**Medium Risk**:
- File renaming (import path updates needed)
- Error handling changes (affects error boundaries)

**Low Risk**:
- Environment variable usage
- Development tool installation
- Performance optimizations

## Recommendations

1. **Start with Phase 1** - it's low risk and provides immediate value
2. **Create database backup** before Phase 2 changes
3. **Implement Phase 3 incrementally** - one service at a time
4. **Use git feature branches** for each major phase
5. **Test thoroughly** after each phase completion

## Progress Tracking

- [ ] Phase 1.1: Update env.config.ts
- [ ] Phase 1.2: Replace hardcoded database paths
- [ ] Phase 2.1: Install Better Auth tables
- [ ] Phase 2.2: Drizzle schema improvements
- [ ] Phase 2.3: Database table naming convention
- [ ] Phase 3.1: Replace Context.GenericTag with Effect.Service
- [ ] Phase 3.2: Replace Effect.gen underscore pattern
- [ ] Phase 3.3: Replace while loops with Effect Streams
- [ ] Phase 4.1: Replace generic Error with TaggedError
- [ ] Phase 5.1: Rename PascalCase files to kebab-case
- [ ] Phase 6.1: Batch database operations
- [ ] Phase 6.2: Remove redundant interfaces
- [ ] Phase 7.1: Install and configure Biome v2
- [ ] Phase 7.2: Fix TypeScript compilation errors

---

**Created**: August 19, 2025
**Status**: Ready to implement
