# MBIE Deployment Guide

**Purpose:** Step-by-step instructions for deploying MBIE updates to SleekAI and Personal repositories.

**Last Updated:** 2025-10-14
**Template Version:** v2.0.0 (with scalability frameworks)

---

## 📋 Pre-Deployment Checklist

- [ ] Review `SCALABILITY_FEEDBACK_RESPONSE.md` for implemented changes
- [ ] Verify MBIE health in Template repo (`python3 cli.py stats`)
- [ ] Backup existing MBIE installation in target repo
- [ ] Note any custom configurations in target repo
- [ ] Schedule deployment during low-usage period

---

## 🚀 Deployment Instructions

### For SleekAI Repository

#### Step 1: Backup Current MBIE Installation

```bash
cd /path/to/sleek-ai

# Create backup directory
mkdir -p backups/mbie-backup-$(date +%Y%m%d)

# Backup current MBIE installation
cp -r tools/memory_rag backups/mbie-backup-$(date +%Y%m%d)/
cp -r memory-bank/.rag backups/mbie-backup-$(date +%Y%m%d)/ 2>/dev/null || echo "No index to backup"

echo "✅ Backup created at backups/mbie-backup-$(date +%Y%m%d)/"
```

#### Step 2: Pull Latest MBIE from Template

```bash
# Add Template repository as remote (if not already added)
git remote add template https://github.com/virtuoso902/Template.git 2>/dev/null || echo "Template remote already exists"

# Fetch latest from Template
git fetch template main

# Option A: Merge approach (preserves custom changes)
git merge template/main --no-commit --no-ff
# Review conflicts, then commit

# Option B: Checkout approach (clean copy, loses customizations)
git checkout template/main -- tools/memory_rag/
# Manually restore customizations from backup

echo "✅ MBIE code updated from Template"
```

#### Step 3: Update Memory-Bank Structure

```bash
# Create new framework directories
mkdir -p memory-bank/data-architecture/{schema,data-governance,examples}
mkdir -p memory-bank/data-architecture/schema/{entities,relationships,migrations}
mkdir -p memory-bank/data-architecture/data-governance/{access-control,audit-trails,data-quality}

mkdir -p memory-bank/business-processes/{workflows,approval-chains,state-machines,examples}
mkdir -p memory-bank/security-compliance/{access-control,compliance,audit-logging,examples}
mkdir -p memory-bank/testing-qa/{strategies,test-data,automation,examples}
mkdir -p memory-bank/performance-scalability/{slas,caching,database,background-jobs,examples}
mkdir -p memory-bank/integrations/{api-design,external-systems,versioning,examples}

echo "✅ Memory-bank framework directories created"
```

#### Step 4: Reinstall MBIE Dependencies

```bash
cd tools/memory_rag

# Reinstall with latest dependencies
python3 -m pip uninstall -y mbie
python3 -m pip install -e .

# Verify installation
python3 cli.py --help

echo "✅ MBIE dependencies reinstalled"
```

#### Step 5: Reindex Memory-Bank

```bash
# Clear old index (optional - only if issues)
# rm -rf ../../memory-bank/.rag/

# Reindex with new structure
python3 cli.py index

# Verify indexing
python3 cli.py stats

echo "✅ Memory-bank reindexed"
```

#### Step 6: Test MBIE Functionality

```bash
# Test basic query
python3 cli.py query "data architecture" --top-k 3

# Test domain-specific query
python3 cli.py query "security compliance" --domain business --top-k 3

# Test statistics
python3 cli.py stats

echo "✅ MBIE functionality verified"
```

#### Step 7: Customize for SleekAI

```bash
# Add SleekAI-specific documentation
cd ../../memory-bank

# Example: Add SleekAI entity models
# Edit data-architecture/schema/entities/user.md
# Edit data-architecture/schema/entities/organization.md

# Example: Add SleekAI workflows
# Edit business-processes/workflows/user-onboarding-workflow.md

# Example: Add SleekAI security policies
# Edit security-compliance/access-control/rbac-model.md

# Reindex after customization
cd ../tools/memory_rag
python3 cli.py index

echo "✅ SleekAI customizations complete"
```

#### Step 8: Update Configuration (if needed)

```bash
# Review config.yml for any new settings
cat config.yml

# Update config for SleekAI-specific paths or domains
# vim config.yml

# Test with new configuration
python3 cli.py query "test" --top-k 1

echo "✅ Configuration updated"
```

#### Step 9: Commit Changes

```bash
cd ../..

# Review changes
git status
git diff

# Stage changes
git add tools/memory_rag/
git add memory-bank/

# Commit with descriptive message
git commit -m "feat: Update MBIE with scalability frameworks

- Added data-architecture framework
- Added business-processes framework
- Added security-compliance framework
- Added testing-qa framework
- Added performance-scalability framework
- Added integrations framework

Source: virtuoso902/Template v2.0.0
Implements feedback from NoCapLife/Personal#374

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"

echo "✅ Changes committed"
```

---

### For Personal Repository

**Follow the same steps as SleekAI**, replacing paths and customizations:

```bash
cd /path/to/personal

# Steps 1-6: Identical to SleekAI

# Step 7: Customize for Personal
cd memory-bank

# Add Personal-specific documentation
# Example: Personal entity models, workflows, security patterns

# Reindex
cd ../tools/memory_rag
python3 cli.py index

# Step 8-9: Commit changes
cd ../..
git commit -m "feat: Update MBIE with scalability frameworks (Personal customizations)"
```

---

## 🔄 Post-Deployment Verification

### 1. Index Health Check

```bash
cd tools/memory_rag

# Check statistics
python3 cli.py stats

# Expected output should show:
# - Total Chunks: [Increased from previous]
# - Unique Documents: [Increased significantly with new frameworks]
# - Category Distribution: Still showing 🔴🟡🟢
```

### 2. Query Performance Test

```bash
# Time a sample query
time python3 cli.py query "security compliance" --top-k 5

# Expected: <5 seconds total (including model load)
```

### 3. Framework Documentation Verification

```bash
# Verify new framework READMEs are indexed
python3 cli.py query "data architecture framework" --cite

# Should return references to data-architecture/README.md
```

### 4. Custom Documentation Test

```bash
# If you added custom documentation, verify it's indexed
python3 cli.py query "[your custom content keyword]" --top-k 3

# Should return your custom documentation
```

---

## 🐛 Troubleshooting

### Issue: Import Errors After Update

**Symptom:** `ImportError: cannot import name 'X' from 'Y'`

**Solution:**
```bash
# Reinstall MBIE completely
cd tools/memory_rag
python3 -m pip uninstall -y mbie
python3 -m pip install -e .
```

### Issue: Index Not Found

**Symptom:** `Collection not found: memory_bank`

**Solution:**
```bash
# Reindex from scratch
python3 cli.py index
```

### Issue: Slow Query Performance

**Symptom:** Queries taking >10 seconds

**Solution:**
```bash
# Check index size
python3 cli.py stats

# If index is corrupted, rebuild
rm -rf ../../memory-bank/.rag/
python3 cli.py index
```

### Issue: Merge Conflicts During Update

**Symptom:** Git conflicts in tools/memory_rag files

**Solution:**
```bash
# Option 1: Accept Template version (clean slate)
git checkout --theirs tools/memory_rag/
git add tools/memory_rag/

# Option 2: Manual conflict resolution
# Edit conflicted files manually
# git add [resolved files]

# Then continue merge
git commit
```

### Issue: Dependencies Not Resolving

**Symptom:** `ERROR: Could not find a version that satisfies the requirement`

**Solution:**
```bash
# Use exact versions from Template
cd tools/memory_rag
cat requirements_latest_stable.txt

# Install with exact versions
python3 -m pip install -r requirements_latest_stable.txt
```

---

## 📊 Rollback Procedure

If deployment fails or causes issues:

```bash
# Step 1: Stop using MBIE
# (Remove any running processes)

# Step 2: Restore from backup
cd /path/to/repo
rm -rf tools/memory_rag
rm -rf memory-bank/.rag
cp -r backups/mbie-backup-[date]/memory_rag tools/
cp -r backups/mbie-backup-[date]/.rag memory-bank/ 2>/dev/null || echo "No index backup"

# Step 3: Reinstall dependencies
cd tools/memory_rag
python3 -m pip install -e .

# Step 4: Verify rollback
python3 cli.py stats
python3 cli.py query "test" --top-k 1

# Step 5: Revert Git changes (if committed)
git revert [commit-hash]
```

---

## 🎯 Success Criteria

Deployment is successful when:

- [x] MBIE `stats` command shows increased document count
- [x] Queries return results from new framework documentation
- [x] Query performance is <5 seconds
- [x] No import errors or exceptions
- [x] Custom documentation is indexed and searchable
- [x] All 6 new framework directories exist and have README files

---

## 📝 Maintenance After Deployment

### Weekly
- Monitor MBIE query performance
- Review any error logs
- Check index size growth

### Monthly
- Update custom documentation in new frameworks
- Reindex to pick up changes: `python3 cli.py index`
- Review and optimize slow queries

### Quarterly
- Check for MBIE updates in Template repo
- Review and update framework documentation
- Clean up old backups

---

## 📚 Additional Resources

### Documentation
- `SCALABILITY_FEEDBACK_RESPONSE.md` - What was implemented and why
- `VERIFICATION_REPORT.md` - Original MBIE verification results
- `FINAL_ENGINEERING_ASSESSMENT.md` - Engineering assessment

### Framework Documentation
- `memory-bank/data-architecture/README.md`
- `memory-bank/business-processes/README.md`
- `memory-bank/security-compliance/README.md`
- `memory-bank/testing-qa/README.md`
- `memory-bank/performance-scalability/README.md`
- `memory-bank/integrations/README.md`

### Support
- Template Repo Issues: https://github.com/virtuoso902/Template/issues
- MBIE Source: https://github.com/virtuoso902/Template/tree/main/tools/memory_rag

---

## 🎓 Best Practices for Future Updates

1. **Always Backup First** - Create backup before every update
2. **Test in Development** - Deploy to dev environment first
3. **Incremental Updates** - Don't skip versions if possible
4. **Document Customizations** - Track what you've customized
5. **Monitor After Deployment** - Watch for issues in first 24 hours
6. **Keep Configuration Separate** - Store custom config in separate file

---

**Deployment Guide Version:** 2.0.0
**Template Version:** 2.0.0 (Scalability Frameworks)
**Author:** Claude Code
**Last Reviewed:** 2025-10-14
