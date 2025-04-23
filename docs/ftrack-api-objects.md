# Ftrack API Objects & Attributes

This document outlines the Ftrack entities and fields that AstraNotes requires to operate correctly. Ensure your Ftrack instance exposes these objects with the specified attributes.

## 1. ReviewSession (Playlists)
Fields retrieved:
- **id** (string)
- **name** (string)
- **created_at** (string)
- **end_date** (string | null)
- **created_by_id** (string)
- **project_id** (string)

## 2. ReviewSessionObject (Playlist Items)
Fields retrieved:
- **id** (string)
- **asset_version.id** (string)
- **asset_version.version** (number)
- **asset_version.asset.name** (string)
- **asset_version.thumbnail.id** (string)
- **asset_version.thumbnail.name** (string)
- **asset_version.thumbnail.component_locations** (string[])

## 3. AssetVersion
Direct query fields:
- **id** (string)
- **name** (string)
- **version** (number)
- **thumbnail_url** (string | null)
- **created_at** (string)
- **updated_at** (string)
- **review_session_object_id** (string)

## 4. Note
Fields retrieved:
- **id** (string)
- **content** (string)
- **frame_number** (number)
- **created_at** (string)
- **updated_at** (string)
- **created_by_id** (string)

Note creation fields (used when posting notes):
- **parent_id** (string)
- **parent_type** (string, e.g., "AssetVersion")
- **user_id** (string)

## 5. NoteLabel
Fields retrieved:
- **id** (string)
- **name** (string)
- **color** (string)

## 6. NoteLabelLink
Fields used when linking a label to a note:
- **note_id** (string)
- **label_id** (string)

## 7. NoteUserLink
Fields used when linking a note to a user:
- **note_id** (string)
- **user_id** (string)

## 8. Component (Attachments)
Fields retrieved:
- **id** (string)
- **name** (string)
- **version_id** (string)
- **component_locations** (object)

## 9. Status & Workflow Entities

### Status
- **id** (string)
- **name** (string)
- **color** (string)

### WorkflowSchema
- **id** (string)
- **statuses** (Status[])

### ProjectSchema
- **id** (string)
- **asset_version_workflow_schema_id** (string)
- **task_workflow_schema_id** (string)

### ProjectSchemaOverride
- **type_id** (string)
- **workflow_schema_id** (string)

### Schema (ProjectSchema ↔ ObjectType)
- **id** (string)
- **project_schema_id** (string)
- **object_type_id** (string)

### SchemaStatus
- **schema_id** (string)
- **status_id** (string)

## 10. ObjectType
Fields retrieved:
- **id** (string)
- **name** (string)

## 11. Location
Fields retrieved:
- **id** (string)
- **name** (string) (e.g., "ftrack.server")

## 12. User
Fields retrieved:
- **id** (string)
- **username** (string)

## 13. Asset.Parent (Shot / Task Parent)
Fields retrieved via `AssetVersion.asset.parent`:
- **id** (string)
- **status_id** (string)
- **object_type.name** (string, e.g., "Shot")
- **project.id** (string) 