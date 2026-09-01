"""
Backup and restore functionality for MBIE.

Provides snapshot capabilities for disaster recovery.
"""

import tarfile
import json
import shutil
from pathlib import Path
from datetime import datetime
import hashlib
import logging
from typing import Optional


class BackupManager:
    """
    Manages backup and restore operations for MBIE index.
    
    Features:
    - Complete index backup with checksums
    - Snapshot versioning
    - Disaster recovery capabilities
    - Integrity verification
    """
    
    def __init__(self, config: dict):
        self.config = config
        self.index_path = Path(config['storage']['index_path'])
        self.snapshots_path = Path(config['storage']['snapshots_path'])
        self.cache_path = Path(config['storage']['cache_path'])
        
        self.snapshots_path.mkdir(parents=True, exist_ok=True)
        
        self.logger = logging.getLogger(__name__)
        
    def create_backup(self, output_path: Optional[Path] = None) -> Path:
        """
        Create a backup of the current index.
        
        Args:
            output_path: Optional custom path for backup file
            
        Returns:
            Path to the created backup file
        """
        # Generate backup filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        if output_path:
            backup_file = output_path
        else:
            backup_file = self.snapshots_path / f"mbie_backup_{timestamp}.tar.gz"
            
        # Create manifest
        manifest = self._create_manifest()
        
        # Create tar archive
        with tarfile.open(backup_file, "w:gz") as tar:
            # Add index directory
            if self.index_path.exists():
                tar.add(self.index_path, arcname="index")
                self.logger.info(f"Added index directory to backup")
                
            # Add cache directory
            if self.cache_path.exists():
                tar.add(self.cache_path, arcname="cache")
                self.logger.info(f"Added cache directory to backup")
                
            # Add manifest
            manifest_path = self.snapshots_path / "manifest.json"
            with open(manifest_path, 'w') as f:
                json.dump(manifest, f, indent=2)
            tar.add(manifest_path, arcname="manifest.json")
            manifest_path.unlink()  # Clean up temp manifest
            
            # Add config
            config_path = Path(__file__).parent.parent / "config.yml"
            if config_path.exists():
                tar.add(config_path, arcname="config.yml")
                self.logger.info(f"Added config to backup")
                
        self.logger.info(f"Backup created: {backup_file}")
        
        # Verify backup integrity
        if self._verify_backup(backup_file):
            self.logger.info("Backup verification successful")
        else:
            self.logger.warning("Backup verification failed")
            
        return backup_file
        
    def restore_backup(self, backup_file: str) -> bool:
        """
        Restore index from a backup file.
        
        Args:
            backup_file: Path to the backup file
            
        Returns:
            True if restore was successful
        """
        backup_path = Path(backup_file)
        
        if not backup_path.exists():
            self.logger.error(f"Backup file not found: {backup_file}")
            return False
            
        # Verify backup before restoring
        if not self._verify_backup(backup_path):
            self.logger.error("Backup verification failed. Aborting restore.")
            return False
            
        # Create temp directory for extraction
        temp_dir = self.snapshots_path / f"restore_temp_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        temp_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # Extract backup
            with tarfile.open(backup_path, "r:gz") as tar:
                tar.extractall(temp_dir)
                
            # Verify manifest
            manifest_path = temp_dir / "manifest.json"
            if not manifest_path.exists():
                raise ValueError("Manifest not found in backup")
                
            with open(manifest_path, 'r') as f:
                manifest = json.load(f)
                
            self.logger.info(f"Restoring backup from {manifest['timestamp']}")
            
            # Backup current state before overwriting
            if self.index_path.exists():
                backup_current = self.snapshots_path / f"pre_restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                shutil.copytree(self.index_path, backup_current)
                self.logger.info(f"Backed up current index to {backup_current}")
                
            # Restore index
            restored_index = temp_dir / "index"
            if restored_index.exists():
                if self.index_path.exists():
                    shutil.rmtree(self.index_path)
                shutil.copytree(restored_index, self.index_path)
                self.logger.info("Restored index directory")
                
            # Restore cache
            restored_cache = temp_dir / "cache"
            if restored_cache.exists():
                if self.cache_path.exists():
                    shutil.rmtree(self.cache_path)
                shutil.copytree(restored_cache, self.cache_path)
                self.logger.info("Restored cache directory")
                
            # Clean up temp directory
            shutil.rmtree(temp_dir)
            
            self.logger.info("Restore completed successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Restore failed: {e}")
            
            # Clean up temp directory
            if temp_dir.exists():
                shutil.rmtree(temp_dir)
                
            return False
            
    def _create_manifest(self) -> dict:
        """Create a manifest with backup metadata"""
        manifest = {
            'timestamp': datetime.now().isoformat(),
            'version': '0.1.0',
            'config': {
                'model': self.config['model']['name'],
                'chunk_size': self.config['chunking']['chunk_size']
            },
            'checksums': {}
        }
        
        # Calculate checksums for important files
        if self.index_path.exists():
            for file_path in self.index_path.rglob("*"):
                if file_path.is_file():
                    relative_path = file_path.relative_to(self.index_path)
                    manifest['checksums'][str(relative_path)] = self._calculate_checksum(file_path)
                    
        return manifest
        
    def _calculate_checksum(self, file_path: Path) -> str:
        """Calculate MD5 checksum of a file"""
        hash_md5 = hashlib.md5()
        
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
                
        return hash_md5.hexdigest()
        
    def _verify_backup(self, backup_file: Path) -> bool:
        """Verify backup file integrity"""
        try:
            # Check if file is a valid tar.gz
            with tarfile.open(backup_file, "r:gz") as tar:
                # Check for required files
                members = tar.getnames()
                
                if "manifest.json" not in members:
                    self.logger.error("Manifest not found in backup")
                    return False
                    
                if not any(m.startswith("index") for m in members):
                    self.logger.warning("Index directory not found in backup")
                    
            return True
            
        except Exception as e:
            self.logger.error(f"Backup verification failed: {e}")
            return False
            
    def list_backups(self) -> list:
        """List available backup files"""
        backups = []
        
        for backup_file in self.snapshots_path.glob("mbie_backup_*.tar.gz"):
            stat = backup_file.stat()
            backups.append({
                'filename': backup_file.name,
                'path': str(backup_file),
                'size_mb': stat.st_size / (1024 * 1024),
                'created': datetime.fromtimestamp(stat.st_ctime).isoformat()
            })
            
        return sorted(backups, key=lambda x: x['created'], reverse=True)
        
    def cleanup_old_backups(self, keep_count: int = 5):
        """
        Remove old backup files, keeping only the most recent ones.
        
        Args:
            keep_count: Number of recent backups to keep
        """
        backups = self.list_backups()
        
        if len(backups) <= keep_count:
            self.logger.info(f"No cleanup needed. Found {len(backups)} backups, keeping {keep_count}")
            return
            
        # Remove old backups
        for backup in backups[keep_count:]:
            backup_path = Path(backup['path'])
            backup_path.unlink()
            self.logger.info(f"Removed old backup: {backup['filename']}")
            
        self.logger.info(f"Cleanup complete. Kept {keep_count} most recent backups")