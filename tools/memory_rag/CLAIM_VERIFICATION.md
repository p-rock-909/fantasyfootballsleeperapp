# MBIE Claim Verification Checklist

## Claims Made About Daily Usage

### ✅ VERIFIED CLAIMS
- [x] Incremental indexing works by DEFAULT (not via --incremental flag)
- [x] Change detection works for new/modified files via MD5 hashing
- [x] Basic CLI commands exist (index, query, stats)
- [x] File categorization by size (🔴 >600, 🟡 400-600, 🟢 <400 lines)

### ❌ CLAIMS THAT NEED TESTING/FIXING

#### 1. CLI Commands and Flags
- [ ] `mbie index` - basic indexing works
- [ ] `mbie index --full` - forces full reindex
- [ ] `mbie query "search term"` - basic search works
- [ ] `mbie query --domain business` - domain filtering works
- [ ] `mbie query --top-k 10` - custom result count works
- [ ] `mbie query --cite` - citation-only mode works
- [ ] `mbie stats` - shows index statistics
- [ ] `mbie backup` - creates backup
- [ ] `mbie restore [file]` - restores from backup
- [ ] `mbie evaluate` - runs evaluation tests

#### 2. Incremental Indexing Claims
- [x] VERIFIED: Detects new files automatically
- [x] VERIFIED: Detects modified files via MD5 hash comparison  
- [x] VERIFIED: Skips unchanged files
- [ ] Detects deleted files and removes from index
- [ ] Updates index only for changed documents

#### 3. Search Functionality Claims
- [ ] Hybrid search combines semantic + keyword matching
- [ ] Domain boosting works (business 1.3x, automation 1.2x, etc.)
- [ ] Relevance threshold filtering works
- [ ] Results show proper navigation paths
- [ ] Citations are formatted correctly

#### 4. File Processing Claims
- [ ] Processes all .md files in memory-bank/
- [ ] Chunks files by section headers (## patterns)
- [ ] Respects chunk size limits (512 tokens)
- [ ] Handles chunk overlap properly (50 tokens)
- [ ] Categorizes files by size correctly

#### 5. ChromaDB/Storage Claims
- [ ] **MAJOR ISSUE**: Collections persist between command invocations
- [ ] Index data survives system restart
- [ ] Embeddings are cached and reused
- [ ] Backup/restore functionality works

#### 6. Performance Claims
- [ ] Fast query response times
- [ ] Efficient incremental updates
- [ ] Memory usage stays reasonable

## FALSE CLAIMS ALREADY IDENTIFIED
- ❌ **--incremental flag exists** - WRONG: Incremental is DEFAULT behavior
- ❌ **Collections persist in ChromaDB** - BROKEN: Creates new collection each time

## CRITICAL ISSUES TO FIX
1. **ChromaDB Persistence**: Collections don't persist between commands
2. **Deleted file detection**: Need to implement and test
3. **Verify all CLI flags work as claimed**
4. **Test domain filtering actually works**
5. **Verify backup/restore functionality**

## Testing Strategy
1. Start fresh - delete any existing index
2. Test each CLI command systematically
3. Verify incremental behavior with file changes
4. Test search quality and domain filtering
5. Fix identified issues one by one
6. Create honest documentation of what actually works