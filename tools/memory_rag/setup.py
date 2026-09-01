#!/usr/bin/env python3
"""
Setup script for MBIE (Memory-Bank Intelligence Engine) installation.
Universal package configuration for any repository.
"""

from setuptools import setup, find_packages
from pathlib import Path

# Read requirements
requirements_path = Path(__file__).parent / "requirements_latest_stable.txt"
if not requirements_path.exists():
    requirements_path = Path(__file__).parent / "requirements.txt"

with open(requirements_path, 'r') as f:
    requirements = [line.strip() for line in f if line.strip() and not line.startswith('#')]

# Read README for long description
readme_path = Path(__file__).parent / "README.md"
if readme_path.exists():
    with open(readme_path, 'r') as f:
        long_description = f.read()
else:
    long_description = "Memory-Bank Intelligence Engine - Intelligent documentation retrieval"

setup(
    name="mbie",
    version="1.0.0",
    author="Your Name",
    author_email="your.email@example.com",
    description="Memory-Bank Intelligence Engine - Intelligent documentation retrieval with semantic search",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/your-repo",
    packages=find_packages(),
    include_package_data=True,
    package_data={
        'mbie': ['config.yml.template', '*.yml'],
    },
    install_requires=requirements,
    python_requires=">=3.9",
    entry_points={
        'console_scripts': [
            'mbie=cli:main',
        ],
    },
    classifiers=[
        "Development Status :: 5 - Production/Stable",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Software Development :: Documentation",
        "Topic :: Text Processing :: Indexing",
    ],
    keywords="documentation search semantic-search rag knowledge-base",
)