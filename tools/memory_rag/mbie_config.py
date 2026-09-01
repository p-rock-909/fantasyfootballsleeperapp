"""
Dynamic configuration loader for MBIE

Provides Click validators that load settings dynamically from config.yml
instead of hardcoding values.
"""

import click
import yaml
from pathlib import Path
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)


class DynamicDomainChoice(click.Choice):
    """Custom Click type that loads domains dynamically from config.yml"""

    def __init__(self, config_path: str = 'config.yml'):
        self.config_path = Path(config_path)
        self.domains = self._load_domains()
        super().__init__(self.domains, case_sensitive=False)

    def _load_domains(self) -> List[str]:
        """Load domains from config.yml"""
        try:
            # If config_path is relative, look in the script's directory
            if not self.config_path.is_absolute():
                script_dir = Path(__file__).parent
                config_file = script_dir / self.config_path
            else:
                config_file = self.config_path

            if not config_file.exists():
                raise click.BadParameter(f"Config file not found: {config_file}")

            with open(config_file) as f:
                config = yaml.safe_load(f)

            domains = list(config.get('domains', {}).keys())
            if not domains:
                raise click.BadParameter(f"No domains found in {config_file}")

            logger.info(f"Loaded {len(domains)} domains from config: {', '.join(domains)}")
            return sorted(domains)

        except yaml.YAMLError as e:
            raise click.BadParameter(f"Failed to parse YAML: {e}")
        except FileNotFoundError:
            raise click.BadParameter(f"Config file not found: {self.config_path}")
        except Exception as e:
            raise click.BadParameter(f"Failed to load domains: {e}")

    def convert(self, value, param, ctx):
        """Validate input against loaded domains"""
        if value.lower() not in [d.lower() for d in self.domains]:
            domain_list = ", ".join(self.domains)
            self.fail(
                f"Invalid domain '{value}'. Available domains: {domain_list}",
                param,
                ctx
            )
        # Return the properly cased domain name
        for domain in self.domains:
            if domain.lower() == value.lower():
                return domain
        return value


def load_config(config_path: str = 'config.yml') -> Dict[str, Any]:
    """Load configuration from YAML file with absolute path resolution"""
    config_file = Path(config_path)

    # If relative path, look in the script's directory
    if not config_file.is_absolute():
        script_dir = Path(__file__).parent
        config_file = script_dir / config_path

    if not config_file.exists():
        raise click.BadParameter(f"Config file not found: {config_file}")

    with open(config_file, 'r') as f:
        config = yaml.safe_load(f)

    return config


def get_domains(config_path: str = 'config.yml') -> List[str]:
    """Get list of available domains from config"""
    try:
        config = load_config(config_path)
        return sorted(list(config.get('domains', {}).keys()))
    except Exception as e:
        logger.error(f"Failed to get domains: {e}")
        return []


def get_domain_info(domain: str, config_path: str = 'config.yml') -> Dict[str, Any]:
    """Get detailed information about a specific domain"""
    try:
        config = load_config(config_path)
        return config.get('domains', {}).get(domain, {})
    except Exception as e:
        logger.error(f"Failed to get domain info for {domain}: {e}")
        return {}
