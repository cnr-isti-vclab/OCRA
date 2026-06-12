# Project Backup and Restore Guide

This guide explains how to export an OCRA project to a portable package and how to import that package back into OCRA as a new project.

These scripts are intended for administrative use only. They are not part of the regular OCRA user interface.

## Purpose

Use the project package scripts when you need to:

- preserve a project snapshot outside the live databases
- migrate a project between OCRA environments
- create a safe imported copy of an existing project
- archive project data together with annotations and asset files

Do not use these scripts as a replacement for full infrastructure backups. They complement database and filesystem backups, but do not replace them.

## What the Package Contains

An exported project package contains only canonical project state:

- project metadata from PostgreSQL
- role snapshots for archival reference
- the HDT document from MongoDB
- annotation geometry, data, and links from MongoDB
- canonical project files under `3d-model/` and `rti/`

The package does not include runtime or operational state such as:

- sessions
- structuring locks
- presence leases
- SSE or social-lock state
- temporary files under `project_files/<projectId>/tmp`

## Script Location

The scripts live in:

- `backend/scripts/export-project-package.ts`
- `backend/scripts/import-project-package.ts`

They are exposed through `backend/package.json` as:

- `npm run project:package:export`
- `npm run project:package:import`

## Export a Project Package

If you do not know the `projectId`, you can inspect the available projects with:

```bash
npm --prefix backend run project:inspect
```

This command lists the available projects and lets you inspect a selected project.

By inspecting a project, you can also retrieve user information that may be useful for import operations, including:

- OCRA user `id`
- user `email`
- identity-provider `sub`

Run this command from the repository root:

```bash
npm --prefix backend run project:package:export -- --project-id <projectId>
```

Optional explicit output directory:

```bash
npm --prefix backend run project:package:export -- \
  --project-id <projectId> \
  --output-dir /absolute/or/relative/output/path
```

If `--output-dir` is omitted, the script creates a timestamped export directory under:

```bash
backend/exports/
```

The output package is a directory containing:

- `manifest.json`
- `project.json`
- `hdt.json` when the project has an HDT document
- `annotations.json`
- `files/3d-model/` when 3D model files exist
- `files/rti/` when RTI files exist

## Import a Project Package

Import always creates a new project. It never overwrites an existing one.

Use one of the following forms:

```bash
npm --prefix backend run project:package:import -- \
  --input-dir <packageDir> \
  --manager-email <email>
```

`<packageDir>` may be:

- an absolute path
- a path relative to `backend/`
- a path relative to the repository root when the command is launched with `npm --prefix backend ...`

or:

```bash
npm --prefix backend run project:package:import -- \
  --input-dir <packageDir> \
  --manager-user-id <userId>
```

or:

```bash
npm --prefix backend run project:package:import -- \
  --input-dir <packageDir> \
  --manager-sub <sub>
```

Optional overrides:

```bash
npm --prefix backend run project:package:import -- \
  --input-dir <packageDir> \
  --manager-email <email> \
  --name "Imported Project Name" \
  --description "Imported copy for review" \
  --public false
```

## Naming Rules on Import

Project names must be unique in OCRA.

If `--name` is omitted, the importer creates a default name in this form:

```text
<originalName>_BK_<UTC timestamp>
```

Example:

```text
Statue Study_BK_20260612_101530
```

If that generated name still collides, the importer appends an incremental numeric suffix.

## What Happens During Import

During import, OCRA:

- creates a brand new PostgreSQL project record
- assigns exactly one fresh role: the selected user becomes `manager`
- imports the HDT document under the new project id
- imports annotations under the new project id
- copies canonical project files into the new project filesystem area
- rewrites project-scoped references where needed

Important details:

- original role snapshots are preserved only in `project.json` for archival purposes
- the manager can be selected by OCRA `id`, identity-provider `sub`, or email
- asset ids, scene ids, and annotation ids are preserved
- only the project id is rewritten
- internal asset URLs in the HDT are rewritten from the source project id to the new one

## Failure Handling

Import is not a single transaction across PostgreSQL, MongoDB, and the filesystem.

If an error happens after the new project is created, the import script performs best-effort cleanup by removing:

- the newly created PostgreSQL project and role assignment
- imported HDT data
- imported annotation data
- copied project files

This keeps the system consistent in the common failure cases, but it is still an administrative operation and should be run carefully.

## Recommended Operational Practice

Use project packages for:

- project-level archival
- project migration
- safe project cloning
- annotation preservation at project scope

Use infrastructure backups for:

- disaster recovery
- full-instance restore
- database rollback
- filesystem recovery

Recommended maintenance backups remain:

- `pg_dump` for PostgreSQL
- `mongodump` for MongoDB
- filesystem backup of `project_files`

## Safety Notes

- Do not expose package import in the ordinary project UI.
- Treat package import as an administrator-only operation.
- Prefer import as a new project over any restore-over-existing workflow.
- Keep the exported package together with infrastructure backups when long-term preservation matters.

## Quick Examples

Export:

```bash
npm --prefix backend run project:package:export -- --project-id cmabc123
```

Import:

```bash
npm --prefix backend run project:package:import -- \
  --input-dir backend/exports/cmabc123-2026-06-12T10-15-30.000Z \
  --manager-email admin@example.org
```
