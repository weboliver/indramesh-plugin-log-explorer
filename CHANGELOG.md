# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-11-01

The initial public release of the Log Explorer plugin.

### Added

- Search and follow application logs from the bundled Loki store, or from a Loki-compatible query target you point the plugin at.
- A log page and nav item that replace the former Core system-log viewer, with LogQL filters and a bounded result window.
- A follow mode for live log tailing, and an "open in Grafana" deep link when a Grafana data source is configured.
- Task-detail actions that take you from a task to the log lines it produced.

**Compatibility:** plugin version 1.0.0 requires IndraMesh Core 1.0.0.
It declares `api_version` 1.0.0.
