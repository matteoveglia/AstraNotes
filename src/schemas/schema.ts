// :copyright: Copyright (c) 2024 ftrack
// Generated on 2024-11-14T19:48:57.572Z using schema
// from an instance running version 24.10.10-b625b2aef24bb16376294e36406b0f2587704d65 using server on https://gmunk.ftrackapp.com
// Not intended to modify manually

export interface Action {
  automation?: Automation;
  automation_id: string;
  readonly id: string;
  __entity_type__?: "Action";
  __permissions?: Record<string, any>;
}
export interface ActionLog {
  readonly action?: Action;
  readonly action_id: string;
  readonly created_at?: string;
  readonly id: number;
  readonly message?: string;
  readonly status?: string;
  __entity_type__?: "ActionLog";
  __permissions?: Record<string, any>;
}
export interface ApiKey {
  created_at?: string;
  description?: string;
  readonly enabled?: boolean;
  readonly id: string;
  identifier?: string;
  readonly last_used?: string;
  prefix?: string;
  projects?: Project[];
  resource_id?: string;
  roles?: SecurityRole[];
  __entity_type__?: "ApiKey";
  __permissions?: Record<string, any>;
}
export interface Appointment {
  context?: Context;
  context_id: string;
  readonly id: string;
  resource?: Resource;
  resource_id: string;
  type: string;
  __entity_type__?: "Appointment";
  __permissions?: Record<string, any>;
}
export interface Asset {
  ancestors?: TypedContext[];
  context_id?: string;
  custom_attribute_links?: CustomAttributeLink[];
  custom_attribute_links_from?: CustomAttributeLinkFrom[];
  readonly id: string;
  readonly latest_version?: AssetVersion;
  metadata?: Metadata[];
  name?: string;
  parent?: Context;
  project?: Project;
  project_id?: string;
  type?: AssetType;
  type_id?: string;
  versions?: AssetVersion[];
  __entity_type__?: "Asset";
  __permissions?: Record<string, any>;
  custom_attributes?: Array<TypedContextCustomAttributesMap["Asset"]>;
}
export type AssetBuild = TypedContextForSubtype<"AssetBuild">;

export interface AssetCustomAttributeLink
  extends Omit<CustomAttributeLink, "__entity_type__" | "__permissions"> {
  asset?: Asset;
  __entity_type__?: "AssetCustomAttributeLink";
  __permissions?: Record<string, any>;
}
export interface AssetCustomAttributeLinkFrom
  extends Omit<CustomAttributeLinkFrom, "__entity_type__" | "__permissions"> {
  asset?: Asset;
  __entity_type__?: "AssetCustomAttributeLinkFrom";
  __permissions?: Record<string, any>;
}
export interface AssetCustomAttributeValue {
  configuration?: CustomAttributeConfiguration;
  readonly configuration_id: string;
  readonly entity_id: string;
  key?: string;
  value?: string | number | boolean | string[];
  __entity_type__?: "AssetCustomAttributeValue";
  __permissions?: Record<string, any>;
}
export interface AssetType {
  assets?: Asset[];
  component?: string;
  readonly id: string;
  name: string;
  short: string;
  __entity_type__?: "AssetType";
  __permissions?: Record<string, any>;
}
export interface AssetVersion {
  asset?: Asset;
  asset_id?: string;
  comment?: string;
  components?: Component[];
  custom_attribute_links?: CustomAttributeLink[];
  custom_attribute_links_from?: CustomAttributeLinkFrom[];
  date?: string;
  readonly id: string;
  incoming_links?: AssetVersionLink[];
  readonly is_latest_version?: boolean;
  is_published: boolean;
  readonly link?: BasicLink[];
  lists?: AssetVersionList[];
  metadata?: Metadata[];
  notes?: Note[];
  outgoing_links?: AssetVersionLink[];
  project?: Project;
  project_id?: string;
  review_session_objects?: ReviewSessionObject[];
  status?: Status;
  status_changes?: StatusChange[];
  status_id: string;
  task?: Task;
  task_id?: string;
  thumbnail?: Component;
  thumbnail_id?: string;
  readonly thumbnail_url?: object;
  used_in_versions?: AssetVersion[];
  user?: User;
  user_id?: string;
  uses_versions?: AssetVersion[];
  version?: number;
  shot?: Shot;
  shot_id?: string;
  __entity_type__?: "AssetVersion";
  __permissions?: Record<string, any>;
  custom_attributes?: Array<TypedContextCustomAttributesMap["AssetVersion"]>;
}
export interface AssetVersionCustomAttributeLink
  extends Omit<CustomAttributeLink, "__entity_type__" | "__permissions"> {
  asset_version?: AssetVersion;
  __entity_type__?: "AssetVersionCustomAttributeLink";
  __permissions?: Record<string, any>;
}
export interface AssetVersionCustomAttributeLinkFrom
  extends Omit<CustomAttributeLinkFrom, "__entity_type__" | "__permissions"> {
  asset_version?: AssetVersion;
  __entity_type__?: "AssetVersionCustomAttributeLinkFrom";
  __permissions?: Record<string, any>;
}
export interface AssetVersionCustomAttributeValue {
  configuration?: CustomAttributeConfiguration;
  readonly configuration_id: string;
  readonly entity_id: string;
  key?: string;
  value?: string | number | boolean | string[];
  __entity_type__?: "AssetVersionCustomAttributeValue";
  __permissions?: Record<string, any>;
}
export interface AssetVersionLink {
  from?: AssetVersion;
  from_id: string;
  readonly id: string;
  metadata?: Metadata[];
  to?: AssetVersion;
  to_id: string;
  __entity_type__?: "AssetVersionLink";
  __permissions?: Record<string, any>;
}
export interface AssetVersionList
  extends Omit<
    List,
    "__entity_type__" | "__permissions" | "custom_attributes"
  > {
  items?: AssetVersion[];
  __entity_type__?: "AssetVersionList";
  __permissions?: Record<string, any>;
  custom_attributes?: Array<
    TypedContextCustomAttributesMap["AssetVersionList"]
  >;
}
export interface AssetVersionStatusChange
  extends Omit<StatusChange, "__entity_type__" | "__permissions"> {
  parent?: AssetVersion;
  __entity_type__?: "AssetVersionStatusChange";
  __permissions?: Record<string, any>;
}
export interface AssetVersionStatusRuleGroup
  extends Omit<StatusRuleGroup, "__entity_type__" | "__permissions"> {
  __entity_type__?: "AssetVersionStatusRuleGroup";
  __permissions?: Record<string, any>;
}
export interface Automation {
  actions?: Action[];
  readonly created_at?: string;
  readonly created_by?: string;
  description?: string;
  enabled?: boolean;
  readonly id: string;
  name: string;
  triggers?: Trigger[];
  __entity_type__?: "Automation";
  __permissions?: Record<string, any>;
}
export interface BaseUser
  extends Omit<Resource, "__entity_type__" | "__permissions"> {
  email?: string;
  first_name?: string;
  last_name?: string;
  thumbnail?: Component;
  thumbnail_id?: string;
  readonly thumbnail_url?: object;
  __entity_type__?: "BaseUser";
  __permissions?: Record<string, any>;
}
export interface CalendarEvent {
  calendar_event_resources?: CalendarEventResource[];
  created_at?: string;
  created_by?: User;
  created_by_id?: string;
  effort?: number;
  end: string;
  estimate?: number;
  everyone?: boolean;
  forecast?: boolean;
  readonly id: string;
  leave?: boolean;
  metadata?: Metadata[];
  name: string;
  project?: Project;
  project_id?: string;
  start: string;
  type?: Type;
  type_id?: string;
  __entity_type__?: "CalendarEvent";
  __permissions?: Record<string, any>;
}
export interface CalendarEventResource {
  calendar_event?: CalendarEvent;
  calendar_event_id: string;
  created_at?: string;
  created_by?: User;
  created_by_id?: string;
  readonly id: string;
  resource?: Resource;
  resource_id: string;
  __entity_type__?: "CalendarEventResource";
  __permissions?: Record<string, any>;
}
export type Campaign = TypedContextForSubtype<"Campaign">;

export interface Collaborator
  extends Omit<BaseUser, "__entity_type__" | "__permissions"> {
  created_from_shared_url?: string;
  __entity_type__?: "Collaborator";
  __permissions?: Record<string, any>;
}
export interface Component {
  component_locations?: ComponentLocation[];
  container?: ContainerComponent;
  container_id?: string;
  custom_attribute_links?: CustomAttributeLink[];
  custom_attribute_links_from?: CustomAttributeLinkFrom[];
  file_type?: string;
  readonly id: string;
  metadata?: Metadata[];
  name: string;
  project?: Project;
  project_id?: string;
  size?: number;
  system_type: string;
  version?: AssetVersion;
  version_id?: string;
  __entity_type__?: "Component";
  __permissions?: Record<string, any>;
}
export interface ComponentCustomAttributeLink
  extends Omit<CustomAttributeLink, "__entity_type__" | "__permissions"> {
  component?: Component;
  __entity_type__?: "ComponentCustomAttributeLink";
  __permissions?: Record<string, any>;
}
export interface ComponentCustomAttributeLinkFrom
  extends Omit<CustomAttributeLinkFrom, "__entity_type__" | "__permissions"> {
  component?: Component;
  __entity_type__?: "ComponentCustomAttributeLinkFrom";
  __permissions?: Record<string, any>;
}
export interface ComponentLocation {
  component?: Component;
  component_id?: string;
  readonly id: string;
  location?: Location;
  location_id?: string;
  resource_identifier?: string;
  readonly url?: object;
  __entity_type__?: "ComponentLocation";
  __permissions?: Record<string, any>;
}
export interface ContainerComponent
  extends Omit<Component, "__entity_type__" | "__permissions"> {
  members?: Component[];
  __entity_type__?: "ContainerComponent";
  __permissions?: Record<string, any>;
}
export interface Context {
  allocations?: Appointment[];
  appointments?: Appointment[];
  assets?: Asset[];
  assignments?: Appointment[];
  children?: Context[];
  context_type: string;
  readonly created_at?: string;
  readonly created_by?: User;
  readonly created_by_id?: string;
  custom_attribute_links?: CustomAttributeLink[];
  custom_attribute_links_from?: CustomAttributeLinkFrom[];
  readonly id: string;
  readonly link?: BasicLink[];
  managers?: Manager[];
  name: string;
  notes?: Note[];
  parent?: Context;
  parent_id?: string;
  project_id?: string;
  scopes?: Scope[];
  thumbnail?: Component;
  thumbnail_id?: string;
  readonly thumbnail_url?: object;
  timelogs?: Timelog[];
  __entity_type__?: "Context";
  __permissions?: Record<string, any>;
  custom_attributes?: Array<TypedContextCustomAttributesMap["Context"]>;
}
export interface ContextCustomAttributeLink
  extends Omit<CustomAttributeLink, "__entity_type__" | "__permissions"> {
  context?: Context;
  __entity_type__?: "ContextCustomAttributeLink";
  __permissions?: Record<string, any>;
}
export interface ContextCustomAttributeLinkFrom
  extends Omit<CustomAttributeLinkFrom, "__entity_type__" | "__permissions"> {
  context?: Context;
  __entity_type__?: "ContextCustomAttributeLinkFrom";
  __permissions?: Record<string, any>;
}
export interface ContextCustomAttributeValue {
  configuration?: CustomAttributeConfiguration;
  readonly configuration_id: string;
  readonly entity_id: string;
  key?: string;
  value?: string | number | boolean | string[];
  __entity_type__?: "ContextCustomAttributeValue";
  __permissions?: Record<string, any>;
}
export interface CustomAttributeConfiguration
  extends Omit<CustomConfigurationBase, "__entity_type__" | "__permissions"> {
  default?: string | number | boolean | string[];
  is_hierarchical?: boolean;
  type?: CustomAttributeType;
  type_id?: string;
  values?: CustomAttributeValue[];
  __entity_type__?: "CustomAttributeConfiguration";
  __permissions?: Record<string, any>;
}
export interface CustomAttributeGroup {
  custom_attribute_configurations?: CustomAttributeConfiguration[];
  readonly id: string;
  name?: string;
  __entity_type__?: "CustomAttributeGroup";
  __permissions?: Record<string, any>;
}
export interface CustomAttributeLink {
  configuration?: CustomAttributeLinkConfiguration;
  readonly configuration_id: string;
  from_entity_type?: string;
  from_id: string;
  readonly id: string;
  to_entity_type?: string;
  to_id: string;
  __entity_type__?: "CustomAttributeLink";
  __permissions?: Record<string, any>;
}
export interface CustomAttributeLinkConfiguration
  extends Omit<CustomConfigurationBase, "__entity_type__" | "__permissions"> {
  readonly entity_type_to: string;
  readonly object_type_id_to?: string;
  object_type_to?: ObjectType;
  one_to_one?: boolean;
  __entity_type__?: "CustomAttributeLinkConfiguration";
  __permissions?: Record<string, any>;
}
export interface CustomAttributeLinkFrom {
  configuration?: CustomAttributeLinkConfiguration;
  readonly configuration_id: string;
  from_entity_type?: string;
  from_id: string;
  readonly id: string;
  to_entity_type?: string;
  to_id: string;
  __entity_type__?: "CustomAttributeLinkFrom";
  __permissions?: Record<string, any>;
}
export interface CustomAttributeType {
  core: boolean;
  custom_attribute_configurations?: CustomAttributeConfiguration[];
  form_config?: string;
  readonly id: string;
  name?: string;
  __entity_type__?: "CustomAttributeType";
  __permissions?: Record<string, any>;
}
export interface CustomAttributeValue {
  configuration?: CustomAttributeConfiguration;
  readonly configuration_id: string;
  readonly entity_id: string;
  value?: string | number | boolean | string[];
  __entity_type__?: "CustomAttributeValue";
  __permissions?: Record<string, any>;
}
export interface CustomConfigurationBase {
  config: string;
  core: boolean;
  entity_type?: string;
  group?: CustomAttributeGroup;
  group_id?: string;
  readonly id: string;
  key?: string;
  label?: string;
  object_type?: ObjectType;
  object_type_id?: string;
  project_id?: string;
  read_security_roles?: SecurityRole[];
  sort?: number;
  write_security_roles?: SecurityRole[];
  __entity_type__?: "CustomConfigurationBase";
  __permissions?: Record<string, any>;
}
export interface Dashboard {
  created_by?: User;
  created_by_id?: string;
  dashboard_resources?: DashboardResource[];
  readonly id: string;
  is_shared_with_everyone?: boolean;
  name?: string;
  widgets?: DashboardWidget[];
  __entity_type__?: "Dashboard";
  __permissions?: Record<string, any>;
}
export interface DashboardResource {
  dashboard?: Dashboard;
  readonly dashboard_id: string;
  resource?: Resource;
  readonly resource_id: string;
  __entity_type__?: "DashboardResource";
  __permissions?: Record<string, any>;
}
export interface DashboardWidget {
  config?: string;
  dashboard?: Dashboard;
  dashboard_id?: string;
  readonly id: string;
  sort?: number;
  type?: string;
  __entity_type__?: "DashboardWidget";
  __permissions?: Record<string, any>;
}
export interface Disk {
  readonly id: string;
  name: string;
  projects?: Project[];
  unix?: string;
  windows?: string;
  __entity_type__?: "Disk";
  __permissions?: Record<string, any>;
}
export interface EntitySetting {
  readonly group: string;
  readonly name: string;
  readonly parent_id: string;
  parent_type: string;
  value: string;
  __entity_type__?: "EntitySetting";
  __permissions?: Record<string, any>;
}
export type Episode = TypedContextForSubtype<"Episode">;

export interface Event {
  action?: string;
  created_at?: string;
  data?: string;
  feeds?: Feed[];
  readonly id: number;
  insert?: string;
  parent_id?: string;
  parent_type?: string;
  project?: Project;
  project_id?: string;
  user?: User;
  user_id?: string;
  __entity_type__?: "Event";
  __permissions?: Record<string, any>;
}
export interface Feed {
  cluster_id?: string;
  created_at?: string;
  distance?: number;
  event?: Event;
  readonly id: string;
  owner_id?: string;
  relation?: string;
  social_id?: number;
  __entity_type__?: "Feed";
  __permissions?: Record<string, any>;
}
export interface FileComponent
  extends Omit<Component, "__entity_type__" | "__permissions"> {
  __entity_type__?: "FileComponent";
  __permissions?: Record<string, any>;
}
export type Folder = TypedContextForSubtype<"Folder">;

export interface Group
  extends Omit<Resource, "__entity_type__" | "__permissions"> {
  children?: Group[];
  custom_attribute_links?: CustomAttributeLink[];
  custom_attribute_links_from?: CustomAttributeLinkFrom[];
  readonly link?: BasicLink[];
  local: boolean;
  memberships?: Membership[];
  metadata?: Metadata[];
  name: string;
  parent?: Group;
  parent_id?: string;
  __entity_type__?: "Group";
  __permissions?: Record<string, any>;
}
export interface GroupCustomAttributeLink
  extends Omit<CustomAttributeLink, "__entity_type__" | "__permissions"> {
  group?: Group;
  __entity_type__?: "GroupCustomAttributeLink";
  __permissions?: Record<string, any>;
}
export interface GroupCustomAttributeLinkFrom
  extends Omit<CustomAttributeLinkFrom, "__entity_type__" | "__permissions"> {
  group?: Group;
  __entity_type__?: "GroupCustomAttributeLinkFrom";
  __permissions?: Record<string, any>;
}
export type Image = TypedContextForSubtype<"Image">;

export type Information = TypedContextForSubtype<"Information">;

export interface Job {
  created_at?: string;
  data?: string;
  finished_at?: string;
  readonly id: string;
  job_components?: JobComponent[];
  status: string;
  readonly type: string;
  user?: User;
  user_id?: string;
  __entity_type__?: "Job";
  __permissions?: Record<string, any>;
}
export interface JobComponent {
  component?: Component;
  readonly component_id: string;
  job?: Job;
  readonly job_id: string;
  readonly url?: object;
  __entity_type__?: "JobComponent";
  __permissions?: Record<string, any>;
}
export interface List {
  category?: ListCategory;
  category_id: string;
  custom_attribute_links?: CustomAttributeLink[];
  custom_attribute_links_from?: CustomAttributeLinkFrom[];
  date?: string;
  readonly id: string;
  is_open: boolean;
  name?: string;
  owner?: User;
  project?: Project;
  project_id: string;
  system_type?: string;
  user_id?: string;
  __entity_type__?: "List";
  __permissions?: Record<string, any>;
  custom_attributes?: Array<TypedContextCustomAttributesMap["List"]>;
}
export interface ListCategory {
  readonly id: string;
  lists?: List[];
  name?: string;
  __entity_type__?: "ListCategory";
  __permissions?: Record<string, any>;
}
export interface ListCustomAttributeLink
  extends Omit<CustomAttributeLink, "__entity_type__" | "__permissions"> {
  list?: List;
  __entity_type__?: "ListCustomAttributeLink";
  __permissions?: Record<string, any>;
}
export interface ListCustomAttributeLinkFrom
  extends Omit<CustomAttributeLinkFrom, "__entity_type__" | "__permissions"> {
  list?: List;
  __entity_type__?: "ListCustomAttributeLinkFrom";
  __permissions?: Record<string, any>;
}
export interface ListCustomAttributeValue {
  configuration?: CustomAttributeConfiguration;
  readonly configuration_id: string;
  readonly entity_id: string;
  key?: string;
  value?: string | number | boolean | string[];
  __entity_type__?: "ListCustomAttributeValue";
  __permissions?: Record<string, any>;
}
export interface ListObject {
  entity_id: string;
  readonly id: string;
  list?: List;
  list_id: string;
  __entity_type__?: "ListObject";
  __permissions?: Record<string, any>;
  custom_attributes?: Array<TypedContextCustomAttributesMap["ListObject"]>;
}
export interface ListObjectCustomAttributeValue {
  configuration?: CustomAttributeConfiguration;
  readonly configuration_id: string;
  readonly entity_id: string;
  key?: string;
  value?: string | number | boolean | string[];
  __entity_type__?: "ListObjectCustomAttributeValue";
  __permissions?: Record<string, any>;
}
export interface Location {
  description?: string;
  readonly id: string;
  label?: string;
  location_components?: ComponentLocation[];
  name: string;
  __entity_type__?: "Location";
  __permissions?: Record<string, any>;
}
export interface Manager {
  context?: Context;
  context_id?: string;
  readonly id: string;
  type?: ManagerType;
  type_id?: string;
  user?: User;
  user_id?: string;
  __entity_type__?: "Manager";
  __permissions?: Record<string, any>;
}
export interface ManagerType {
  readonly id: string;
  name?: string;
  __entity_type__?: "ManagerType";
  __permissions?: Record<string, any>;
}
export interface Membership {
  group?: Group;
  group_id: string;
  readonly id: string;
  user?: User;
  user_id: string;
  __entity_type__?: "Membership";
  __permissions?: Record<string, any>;
}
export interface Metadata {
  readonly key: string;
  readonly parent_id: string;
  parent_type: string;
  value: string;
  __entity_type__?: "Metadata";
  __permissions?: Record<string, any>;
}
export type Milestone = TypedContextForSubtype<"Milestone">;

export interface Note {
  author?: BaseUser;
  category?: NoteCategory;
  category_id?: string;
  completed_at?: string;
  completed_by?: User;
  completed_by_id?: string;
  content?: string;
  date?: string;
  frame_number?: number;
  readonly id: string;
  in_reply_to?: Note;
  in_reply_to_id?: string;
  is_todo?: boolean;
  metadata?: Metadata[];
  note_components?: NoteComponent[];
  note_label_links?: NoteLabelLink[];
  parent_id?: string;
  parent_type?: string;
  project?: Project;
  project_id?: string;
  recipients?: Recipient[];
  replies?: Note[];
  thread_activity?: string;
  user_id: string;
  __entity_type__?: "Note";
  __permissions?: Record<string, any>;
}
export interface NoteAnnotationComponent
  extends Omit<NoteComponent, "__entity_type__" | "__permissions"> {
  data?: object;
  __entity_type__?: "NoteAnnotationComponent";
  __permissions?: Record<string, any>;
}
export interface NoteCategory
  extends Omit<NoteLabel, "__entity_type__" | "__permissions"> {
  __entity_type__?: "NoteCategory";
  __permissions?: Record<string, any>;
}
export interface NoteComponent {
  component?: Component;
  readonly component_id: string;
  note?: Note;
  readonly note_id: string;
  readonly thumbnail_url?: object;
  readonly url?: object;
  __entity_type__?: "NoteComponent";
  __permissions?: Record<string, any>;
}
export interface NoteLabel {
  color?: string;
  readonly id: string;
  name?: string;
  sort?: number;
  __entity_type__?: "NoteLabel";
  __permissions?: Record<string, any>;
}
export interface NoteLabelLink {
  label?: NoteLabel;
  readonly label_id: string;
  note?: Note;
  readonly note_id: string;
  __entity_type__?: "NoteLabelLink";
  __permissions?: Record<string, any>;
}
export interface ObjectType {
  icon: string;
  readonly id: string;
  is_leaf?: boolean;
  is_prioritizable?: boolean;
  is_schedulable: boolean;
  is_statusable: boolean;
  is_taskable: boolean;
  is_time_reportable: boolean;
  is_typeable: boolean;
  name: string;
  project_schemas?: ProjectSchema[];
  sort: number;
  tasks?: Task[];
  __entity_type__?: "ObjectType";
  __permissions?: Record<string, any>;
}
export interface Priority {
  color?: string;
  readonly id: string;
  name?: string;
  sort?: number;
  tasks?: Task[];
  value?: number;
  __entity_type__?: "Priority";
  __permissions?: Record<string, any>;
}
export interface Project
  extends Omit<
    Context,
    "__entity_type__" | "__permissions" | "custom_attributes"
  > {
  calendar_events?: CalendarEvent[];
  color?: string;
  descendants?: TypedContext[];
  disk?: Disk;
  disk_id?: string;
  end_date?: string;
  full_name?: string;
  is_global: boolean;
  is_private?: boolean;
  metadata?: Metadata[];
  project_schema?: ProjectSchema;
  project_schema_id: string;
  review_session_folders?: ReviewSessionFolder[];
  review_sessions?: ReviewSession[];
  root?: string;
  start_date?: string;
  status: string;
  user_security_role_projects?: UserSecurityRoleProject[];
  __entity_type__?: "Project";
  __permissions?: Record<string, any>;
  custom_attributes?: Array<TypedContextCustomAttributesMap["Project"]>;
}
export interface ProjectSchema {
  asset_version_workflow_schema?: WorkflowSchema;
  asset_version_workflow_schema_id?: string;
  readonly id: string;
  name?: string;
  object_type_schemas?: Schema[];
  object_types?: ObjectType[];
  task_templates?: TaskTemplate[];
  task_type_schema?: TaskTypeSchema;
  task_type_schema_id?: string;
  task_workflow_schema?: WorkflowSchema;
  task_workflow_schema_id?: string;
  task_workflow_schema_overrides?: ProjectSchemaOverride[];
  __entity_type__?: "ProjectSchema";
  __permissions?: Record<string, any>;
}
export interface ProjectSchemaObjectType {
  object_type?: ObjectType;
  readonly object_type_id: string;
  project_schema?: ProjectSchema;
  readonly project_schema_id: string;
  __entity_type__?: "ProjectSchemaObjectType";
  __permissions?: Record<string, any>;
}
export interface ProjectSchemaOverride {
  readonly id: string;
  project_schema_id?: string;
  type_id?: string;
  workflow_schema?: WorkflowSchema;
  workflow_schema_id?: string;
  __entity_type__?: "ProjectSchemaOverride";
  __permissions?: Record<string, any>;
}
export interface Recipient {
  note?: Note;
  readonly note_id: string;
  recipient?: Resource;
  readonly resource_id: string;
  text_mentioned?: string;
  user?: User;
  __entity_type__?: "Recipient";
  __permissions?: Record<string, any>;
}
export interface Resource {
  allocations?: Appointment[];
  appointments?: Appointment[];
  assignments?: Appointment[];
  dashboard_resources?: DashboardResource[];
  readonly id: string;
  resource_type: string;
  __entity_type__?: "Resource";
  __permissions?: Record<string, any>;
}
export interface ReviewSession {
  availability?: string;
  created_at: string;
  created_by?: User;
  created_by_id: string;
  description: string;
  end_date: string;
  readonly id: string;
  is_moderated?: boolean;
  readonly is_open?: boolean;
  metadata?: Metadata[];
  name: string;
  passphrase?: string;
  passphrase_enabled?: boolean;
  project?: Project;
  project_id: string;
  review_session_folder?: ReviewSessionFolder;
  review_session_folder_id?: string;
  review_session_invitees?: ReviewSessionInvitee[];
  review_session_objects?: ReviewSessionObject[];
  settings?: EntitySetting[];
  shareable_url_enabled?: boolean;
  start_date: string;
  readonly thumbnail_id?: string;
  thumbnail_source_id?: string;
  readonly thumbnail_url?: object;
  __entity_type__?: "ReviewSession";
  __permissions?: Record<string, any>;
}
export interface ReviewSessionFolder {
  readonly id: string;
  name: string;
  project?: Project;
  project_id?: string;
  review_sessions?: ReviewSession[];
  __entity_type__?: "ReviewSessionFolder";
  __permissions?: Record<string, any>;
}
export interface ReviewSessionInvitee {
  created_at: string;
  created_by?: User;
  created_by_id: string;
  readonly created_from_shared_url?: boolean;
  email: string;
  readonly id: string;
  last_sent_at?: string;
  name: string;
  resource?: Resource;
  resource_id?: string;
  review_session?: ReviewSession;
  review_session_id: string;
  statuses?: ReviewSessionObjectStatus[];
  __entity_type__?: "ReviewSessionInvitee";
  __permissions?: Record<string, any>;
}
export interface ReviewSessionObject {
  annotations?: ReviewSessionObjectAnnotation[];
  asset_version?: AssetVersion;
  created_at: string;
  description: string;
  readonly id: string;
  name: string;
  notes?: Note[];
  review_session?: ReviewSession;
  review_session_id: string;
  sort_order: number;
  statuses?: ReviewSessionObjectStatus[];
  version: string;
  version_id: string;
  __entity_type__?: "ReviewSessionObject";
  __permissions?: Record<string, any>;
}
export interface ReviewSessionObjectAnnotation {
  created_at: string;
  data?: string;
  frame_number: number;
  readonly id: string;
  review_session_object?: ReviewSessionObject;
  review_session_object_id?: string;
  updated_at?: string;
  __entity_type__?: "ReviewSessionObjectAnnotation";
  __permissions?: Record<string, any>;
}
export interface ReviewSessionObjectAnnotationComponent {
  component?: Component;
  readonly component_id: string;
  readonly frame_number: string;
  review_session_object?: ReviewSessionObject;
  readonly review_session_object_id: string;
  readonly thumbnail_url?: object;
  readonly url?: object;
  __entity_type__?: "ReviewSessionObjectAnnotationComponent";
  __permissions?: Record<string, any>;
}
export interface ReviewSessionObjectStatus {
  created_at: string;
  readonly id: string;
  invitee?: ReviewSessionInvitee;
  resource?: Resource;
  resource_id?: string;
  review_session_invitee_id?: string;
  review_session_object?: ReviewSessionObject;
  review_session_object_id?: string;
  status?: string;
  __entity_type__?: "ReviewSessionObjectStatus";
  __permissions?: Record<string, any>;
}
export type Scene = TypedContextForSubtype<"Scene">;

export interface Schema {
  readonly id: string;
  object_type_id?: string;
  project_schema_id: string;
  statuses?: SchemaStatus[];
  type_id: string;
  types?: SchemaType[];
  __entity_type__?: "Schema";
  __permissions?: Record<string, any>;
}
export interface SchemaStatus {
  readonly schema_id: string;
  sort?: number;
  readonly status_id: string;
  task_status?: Status;
  __entity_type__?: "SchemaStatus";
  __permissions?: Record<string, any>;
}
export interface SchemaType {
  readonly schema_id: string;
  sort?: number;
  task_type?: Type;
  readonly type_id: string;
  __entity_type__?: "SchemaType";
  __permissions?: Record<string, any>;
}
export interface Scope {
  readonly id: string;
  name: string;
  __entity_type__?: "Scope";
  __permissions?: Record<string, any>;
}
export interface SecurityRole {
  readonly id: string;
  name?: string;
  type?: string;
  user_security_roles?: UserSecurityRole[];
  __entity_type__?: "SecurityRole";
  __permissions?: Record<string, any>;
}
export type Sequence = TypedContextForSubtype<"Sequence">;

export interface SequenceComponent
  extends Omit<ContainerComponent, "__entity_type__" | "__permissions"> {
  padding: number;
  __entity_type__?: "SequenceComponent";
  __permissions?: Record<string, any>;
}
export interface Setting {
  readonly group: string;
  readonly name: string;
  value?: string;
  __entity_type__?: "Setting";
  __permissions?: Record<string, any>;
}
export interface SettingComponent {
  component?: Component;
  readonly component_id: string;
  readonly group: string;
  readonly name: string;
  setting?: Setting;
  readonly thumbnail_url?: object;
  readonly url?: object;
  __entity_type__?: "SettingComponent";
  __permissions?: Record<string, any>;
}
export type Shot = TypedContextForSubtype<"Shot">;

export interface SplitTaskPart {
  end_date: string;
  readonly id: string;
  label?: string;
  start_date: string;
  task?: Task;
  task_id: string;
  __entity_type__?: "SplitTaskPart";
  __permissions?: Record<string, any>;
}
export interface State {
  readonly id: string;
  name?: string;
  short?: string;
  __entity_type__?: "State";
  __permissions?: Record<string, any>;
}
export interface Status {
  color?: string;
  readonly id: string;
  is_active: boolean;
  name?: string;
  sort?: number;
  state?: State;
  tasks?: Task[];
  __entity_type__?: "Status";
  __permissions?: Record<string, any>;
}
export interface StatusChange {
  date?: string;
  from_status?: Status;
  from_status_id?: string;
  readonly id: string;
  parent_id?: string;
  parent_type?: string;
  status?: Status;
  status_id?: string;
  user?: User;
  user_id?: string;
  __entity_type__?: "StatusChange";
  __permissions?: Record<string, any>;
}
export interface StatusRule {
  readonly id: string;
  status?: Status;
  status_id: string;
  status_rule_group?: StatusRuleGroup;
  status_rule_group_id: string;
  __entity_type__?: "StatusRule";
  __permissions?: Record<string, any>;
}
export interface StatusRuleGroup {
  entity_type: string;
  readonly id: string;
  role?: SecurityRole;
  role_id?: string;
  schema?: ProjectSchema;
  schema_id: string;
  status?: Status;
  status_id: string;
  status_rules?: StatusRule[];
  __entity_type__?: "StatusRuleGroup";
  __permissions?: Record<string, any>;
}
export type Task = TypedContextForSubtype<"Task">;

export interface TaskTemplate {
  readonly id: string;
  items?: TaskTemplateItem[];
  name: string;
  project_schema?: ProjectSchema;
  project_schema_id: string;
  __entity_type__?: "TaskTemplate";
  __permissions?: Record<string, any>;
}
export interface TaskTemplateItem {
  readonly id: string;
  task_type?: Type;
  task_type_id: string;
  template?: TaskTemplate;
  template_id: string;
  __entity_type__?: "TaskTemplateItem";
  __permissions?: Record<string, any>;
}
export interface TaskTypeSchema {
  readonly id: string;
  name?: string;
  types?: Type[];
  __entity_type__?: "TaskTypeSchema";
  __permissions?: Record<string, any>;
}
export interface TaskTypeSchemaType {
  readonly task_type_schema_id: string;
  readonly type_id: string;
  __entity_type__?: "TaskTypeSchemaType";
  __permissions?: Record<string, any>;
}
export interface Timelog {
  comment: string;
  context?: Context;
  context_id?: string;
  duration: number;
  readonly id: string;
  name?: string;
  start: string;
  time_zone_offset?: number;
  user?: User;
  user_id?: string;
  __entity_type__?: "Timelog";
  __permissions?: Record<string, any>;
}
export interface Timer {
  comment: string;
  context?: Context;
  context_id?: string;
  readonly id: string;
  name?: string;
  start: string;
  user?: User;
  user_id: string;
  __entity_type__?: "Timer";
  __permissions?: Record<string, any>;
}
export interface Trigger {
  automation?: Automation;
  automation_id?: string;
  filter: string;
  readonly id: string;
  __entity_type__?: "Trigger";
  __permissions?: Record<string, any>;
}
export interface Type {
  color: string;
  readonly id: string;
  is_billable: boolean;
  name?: string;
  sort: number;
  task_type_schemas?: TaskTypeSchema[];
  tasks?: Task[];
  __entity_type__?: "Type";
  __permissions?: Record<string, any>;
}
export interface TypedContextForSubtype<K extends TypedContextSubtype>
  extends Omit<
    Context,
    "__entity_type__" | "__permissions" | "custom_attributes"
  > {
  ancestors?: TypedContext[];
  bid: number;
  readonly bid_time_logged_difference?: number;
  descendants?: TypedContext[];
  description?: string;
  end_date?: string;
  incoming_links?: TypedContextLink[];
  lists?: TypedContextList[];
  metadata?: Metadata[];
  object_type?: ObjectType;
  object_type_id: string;
  outgoing_links?: TypedContextLink[];
  priority?: Priority;
  priority_id: string;
  project?: Project;
  sort: number;
  split_parts?: SplitTaskPart[];
  start_date?: string;
  status?: Status;
  status_changes?: StatusChange[];
  status_id: string;
  readonly thumbnail_source_id?: string;
  readonly time_logged?: number;
  type?: Type;
  type_id: string;
  __entity_type__?: K;
  __permissions?: Record<string, any>;
  custom_attributes?: Array<TypedContextCustomAttributesMap[K]>;
}
export interface TypedContextLink {
  from?: TypedContext;
  from_id: string;
  readonly id: string;
  lag?: number;
  metadata?: Metadata[];
  to?: TypedContext;
  to_id: string;
  type?: string;
  __entity_type__?: "TypedContextLink";
  __permissions?: Record<string, any>;
}
export interface TypedContextList
  extends Omit<
    List,
    "__entity_type__" | "__permissions" | "custom_attributes"
  > {
  items?: Task[];
  __entity_type__?: "TypedContextList";
  __permissions?: Record<string, any>;
  custom_attributes?: Array<
    TypedContextCustomAttributesMap["TypedContextList"]
  >;
}
export interface TypedContextStatusChange
  extends Omit<StatusChange, "__entity_type__" | "__permissions"> {
  parent?: TypedContext;
  __entity_type__?: "TypedContextStatusChange";
  __permissions?: Record<string, any>;
}
export interface TypedContextStatusRuleGroup
  extends Omit<StatusRuleGroup, "__entity_type__" | "__permissions"> {
  object_type?: ObjectType;
  object_type_id: string;
  __entity_type__?: "TypedContextStatusRuleGroup";
  __permissions?: Record<string, any>;
}
export interface User
  extends Omit<BaseUser, "__entity_type__" | "__permissions"> {
  custom_attribute_links?: CustomAttributeLink[];
  custom_attribute_links_from?: CustomAttributeLinkFrom[];
  is_active: boolean;
  is_otp_enabled?: boolean;
  is_totp_enabled?: boolean;
  memberships?: Membership[];
  metadata?: Metadata[];
  require_details_update?: boolean;
  task_type_links?: UserTaskTypeLink[];
  timelogs?: Timelog[];
  user_security_roles?: UserSecurityRole[];
  user_type?: UserType;
  user_type_id?: string;
  username: string;
  __entity_type__?: "User";
  __permissions?: Record<string, any>;
  custom_attributes?: Array<TypedContextCustomAttributesMap["User"]>;
}
export interface UserApplicationState {
  readonly key: string;
  readonly user_id: string;
  value: string;
  __entity_type__?: "UserApplicationState";
  __permissions?: Record<string, any>;
}
export interface UserCustomAttributeLink
  extends Omit<CustomAttributeLink, "__entity_type__" | "__permissions"> {
  user?: User;
  __entity_type__?: "UserCustomAttributeLink";
  __permissions?: Record<string, any>;
}
export interface UserCustomAttributeLinkFrom
  extends Omit<CustomAttributeLinkFrom, "__entity_type__" | "__permissions"> {
  user?: User;
  __entity_type__?: "UserCustomAttributeLinkFrom";
  __permissions?: Record<string, any>;
}
export interface UserCustomAttributeValue {
  configuration?: CustomAttributeConfiguration;
  readonly configuration_id: string;
  readonly entity_id: string;
  key?: string;
  value?: string | number | boolean | string[];
  __entity_type__?: "UserCustomAttributeValue";
  __permissions?: Record<string, any>;
}
export interface UserSecurityRole {
  readonly id: string;
  is_all_open_projects?: boolean;
  is_all_projects?: boolean;
  security_role?: SecurityRole;
  security_role_id?: string;
  user?: User;
  user_id?: string;
  user_security_role_projects?: UserSecurityRoleProject[];
  __entity_type__?: "UserSecurityRole";
  __permissions?: Record<string, any>;
}
export interface UserSecurityRoleProject {
  readonly id: string;
  project?: Project;
  project_id?: string;
  user_security_role?: UserSecurityRole;
  user_security_role_id?: string;
  __entity_type__?: "UserSecurityRoleProject";
  __permissions?: Record<string, any>;
}
export interface UserSession {
  readonly accessed_time?: string;
  readonly creation_time?: string;
  readonly id: string;
  readonly user?: User;
  readonly user_id?: string;
  valid?: boolean;
  __entity_type__?: "UserSession";
  __permissions?: Record<string, any>;
}
export interface UserTaskTypeLink {
  type?: Type;
  readonly type_id: string;
  user?: User;
  readonly user_id: string;
  __entity_type__?: "UserTaskTypeLink";
  __permissions?: Record<string, any>;
}
export interface UserType {
  readonly id: string;
  readonly name?: string;
  __entity_type__?: "UserType";
  __permissions?: Record<string, any>;
}
export interface UserView {
  global?: boolean;
  readonly id: string;
  name?: string;
  shared_with?: Resource[];
  user?: User;
  user_id?: string;
  __entity_type__?: "UserView";
  __permissions?: Record<string, any>;
}
export interface WebhookAction
  extends Omit<Action, "__entity_type__" | "__permissions"> {
  headers?: string;
  webhook_url: string;
  __entity_type__?: "WebhookAction";
  __permissions?: Record<string, any>;
}
export interface WorkflowSchema {
  readonly id: string;
  name?: string;
  overrides?: ProjectSchemaOverride[];
  statuses?: Status[];
  __entity_type__?: "WorkflowSchema";
  __permissions?: Record<string, any>;
}
export interface WorkflowSchemaStatus {
  readonly status_id: string;
  readonly workflow_schema_id: string;
  __entity_type__?: "WorkflowSchemaStatus";
  __permissions?: Record<string, any>;
}
export interface BasicLink {
  id: string;
  type: string;
  name: string;
}

export interface EntityTypeMap {
  Action: Action;
  ActionLog: ActionLog;
  ApiKey: ApiKey;
  Appointment: Appointment;
  Asset: Asset;
  AssetBuild: AssetBuild;
  AssetCustomAttributeLink: AssetCustomAttributeLink;
  AssetCustomAttributeLinkFrom: AssetCustomAttributeLinkFrom;
  AssetCustomAttributeValue: AssetCustomAttributeValue;
  AssetType: AssetType;
  AssetVersion: AssetVersion;
  AssetVersionCustomAttributeLink: AssetVersionCustomAttributeLink;
  AssetVersionCustomAttributeLinkFrom: AssetVersionCustomAttributeLinkFrom;
  AssetVersionCustomAttributeValue: AssetVersionCustomAttributeValue;
  AssetVersionLink: AssetVersionLink;
  AssetVersionList: AssetVersionList;
  AssetVersionStatusChange: AssetVersionStatusChange;
  AssetVersionStatusRuleGroup: AssetVersionStatusRuleGroup;
  Automation: Automation;
  BaseUser: BaseUser;
  CalendarEvent: CalendarEvent;
  CalendarEventResource: CalendarEventResource;
  Campaign: Campaign;
  Collaborator: Collaborator;
  Component: Component;
  ComponentCustomAttributeLink: ComponentCustomAttributeLink;
  ComponentCustomAttributeLinkFrom: ComponentCustomAttributeLinkFrom;
  ComponentLocation: ComponentLocation;
  ContainerComponent: ContainerComponent;
  Context: Context;
  ContextCustomAttributeLink: ContextCustomAttributeLink;
  ContextCustomAttributeLinkFrom: ContextCustomAttributeLinkFrom;
  ContextCustomAttributeValue: ContextCustomAttributeValue;
  CustomAttributeConfiguration: CustomAttributeConfiguration;
  CustomAttributeGroup: CustomAttributeGroup;
  CustomAttributeLink: CustomAttributeLink;
  CustomAttributeLinkConfiguration: CustomAttributeLinkConfiguration;
  CustomAttributeLinkFrom: CustomAttributeLinkFrom;
  CustomAttributeType: CustomAttributeType;
  CustomAttributeValue: CustomAttributeValue;
  CustomConfigurationBase: CustomConfigurationBase;
  Dashboard: Dashboard;
  DashboardResource: DashboardResource;
  DashboardWidget: DashboardWidget;
  Disk: Disk;
  EntitySetting: EntitySetting;
  Episode: Episode;
  Event: Event;
  Feed: Feed;
  FileComponent: FileComponent;
  Folder: Folder;
  Group: Group;
  GroupCustomAttributeLink: GroupCustomAttributeLink;
  GroupCustomAttributeLinkFrom: GroupCustomAttributeLinkFrom;
  Image: Image;
  Information: Information;
  Job: Job;
  JobComponent: JobComponent;
  List: List;
  ListCategory: ListCategory;
  ListCustomAttributeLink: ListCustomAttributeLink;
  ListCustomAttributeLinkFrom: ListCustomAttributeLinkFrom;
  ListCustomAttributeValue: ListCustomAttributeValue;
  ListObject: ListObject;
  ListObjectCustomAttributeValue: ListObjectCustomAttributeValue;
  Location: Location;
  Manager: Manager;
  ManagerType: ManagerType;
  Membership: Membership;
  Metadata: Metadata;
  Milestone: Milestone;
  Note: Note;
  NoteAnnotationComponent: NoteAnnotationComponent;
  NoteCategory: NoteCategory;
  NoteComponent: NoteComponent;
  NoteLabel: NoteLabel;
  NoteLabelLink: NoteLabelLink;
  ObjectType: ObjectType;
  Priority: Priority;
  Project: Project;
  ProjectSchema: ProjectSchema;
  ProjectSchemaObjectType: ProjectSchemaObjectType;
  ProjectSchemaOverride: ProjectSchemaOverride;
  Recipient: Recipient;
  Resource: Resource;
  ReviewSession: ReviewSession;
  ReviewSessionFolder: ReviewSessionFolder;
  ReviewSessionInvitee: ReviewSessionInvitee;
  ReviewSessionObject: ReviewSessionObject;
  ReviewSessionObjectAnnotation: ReviewSessionObjectAnnotation;
  ReviewSessionObjectAnnotationComponent: ReviewSessionObjectAnnotationComponent;
  ReviewSessionObjectStatus: ReviewSessionObjectStatus;
  Scene: Scene;
  Schema: Schema;
  SchemaStatus: SchemaStatus;
  SchemaType: SchemaType;
  Scope: Scope;
  SecurityRole: SecurityRole;
  Sequence: Sequence;
  SequenceComponent: SequenceComponent;
  Setting: Setting;
  SettingComponent: SettingComponent;
  Shot: Shot;
  SplitTaskPart: SplitTaskPart;
  State: State;
  Status: Status;
  StatusChange: StatusChange;
  StatusRule: StatusRule;
  StatusRuleGroup: StatusRuleGroup;
  Task: Task;
  TaskTemplate: TaskTemplate;
  TaskTemplateItem: TaskTemplateItem;
  TaskTypeSchema: TaskTypeSchema;
  TaskTypeSchemaType: TaskTypeSchemaType;
  Timelog: Timelog;
  Timer: Timer;
  Trigger: Trigger;
  Type: Type;
  TypedContext: TypedContext;
  TypedContextLink: TypedContextLink;
  TypedContextList: TypedContextList;
  TypedContextStatusChange: TypedContextStatusChange;
  TypedContextStatusRuleGroup: TypedContextStatusRuleGroup;
  User: User;
  UserApplicationState: UserApplicationState;
  UserCustomAttributeLink: UserCustomAttributeLink;
  UserCustomAttributeLinkFrom: UserCustomAttributeLinkFrom;
  UserCustomAttributeValue: UserCustomAttributeValue;
  UserSecurityRole: UserSecurityRole;
  UserSecurityRoleProject: UserSecurityRoleProject;
  UserSession: UserSession;
  UserTaskTypeLink: UserTaskTypeLink;
  UserType: UserType;
  UserView: UserView;
  WebhookAction: WebhookAction;
  WorkflowSchema: WorkflowSchema;
  WorkflowSchemaStatus: WorkflowSchemaStatus;
}

export type EntityType = keyof EntityTypeMap;
export type EntityData<TEntityType extends EntityType = EntityType> =
  EntityTypeMap[TEntityType];

export interface TypedContextSubtypeMap {
  AssetBuild: AssetBuild;
  Campaign: Campaign;
  Episode: Episode;
  Folder: Folder;
  Image: Image;
  Information: Information;
  Milestone: Milestone;
  Scene: Scene;
  Sequence: Sequence;
  Shot: Shot;
  Task: Task;
}
export type TypedContextSubtype = keyof TypedContextSubtypeMap;

export type TypedContext = TypedContextSubtypeMap[TypedContextSubtype];

export function getAttributeConfigurations() {
  return [
    {
      name: "shotSlate",
      type: "text",
      label: "Slate",
      entityType: "task",
      default: "",
      objectType: "Shot",
      isHierarchical: false,
    },
    {
      name: "wsrReportNote",
      type: "text",
      label: "Report Note",
      entityType: "task",
      default: "",
      objectType: "Shot",
      isHierarchical: false,
    },
    {
      name: "latestVersionSentDate",
      type: "date",
      label: "Latest V Sent Date",
      entityType: "task",
      default: null,
      objectType: "Shot",
      isHierarchical: false,
    },
    {
      name: "percentComplete",
      type: "number",
      label: "% Complete",
      entityType: "task",
      default: null,
      objectType: "Shot",
      isHierarchical: false,
    },
    {
      name: "workType",
      type: "text",
      label: "Work Type",
      entityType: "task",
      default: "",
      objectType: "Shot",
      isHierarchical: false,
    },
    {
      name: "shotType",
      type: "enumerator",
      label: "Shot Type",
      entityType: "task",
      default: [],
      objectType: "Shot",
      isHierarchical: false,
    },
    {
      name: "shotNote",
      type: "text",
      label: "Shot Note",
      entityType: "task",
      default: "",
      objectType: "Shot",
      isHierarchical: false,
    },
    {
      name: "vfxDescription",
      type: "text",
      label: "VFX Description",
      entityType: "task",
      default: "",
      objectType: "Shot",
      isHierarchical: false,
    },
    {
      name: "Delivered",
      type: "boolean",
      label: "Delivered",
      entityType: "assetversion",
      default: false,
      objectType: undefined,
      isHierarchical: false,
    },
    {
      name: "clientNextVerDate",
      type: "date",
      label: "Client Next Version Date",
      entityType: "task",
      default: null,
      objectType: "Shot",
      isHierarchical: false,
    },
    {
      name: "clientFinDelDate",
      type: "date",
      label: "Client Final Del Date",
      entityType: "task",
      default: null,
      objectType: "Shot",
      isHierarchical: false,
    },
    {
      name: "TO_Date",
      type: "date",
      label: "TO Date",
      entityType: "task",
      default: null,
      objectType: "Shot",
      isHierarchical: false,
    },
    {
      name: "Turnover",
      type: "text",
      label: "Turnover",
      entityType: "task",
      default: "",
      objectType: "Shot",
      isHierarchical: false,
    },
    {
      name: "prodNote",
      type: "text",
      label: "Production Note",
      entityType: "task",
      default: "",
      objectType: "Shot",
      isHierarchical: false,
    },
    {
      name: "dateSent",
      type: "date",
      label: "Date Sent",
      entityType: "assetversion",
      default: null,
      objectType: undefined,
      isHierarchical: false,
    },
    {
      name: "editNotes",
      type: "text",
      label: "Editorial Notes",
      entityType: "task",
      default: "",
      objectType: "Shot",
      isHierarchical: false,
    },
    {
      name: "fend",
      type: "number",
      label: "Frame end",
      entityType: "task",
      default: 1,
      objectType: "Shot",
      isHierarchical: false,
    },
    {
      name: "handles",
      type: "number",
      label: "Frame handles",
      entityType: "task",
      default: 0,
      objectType: "Shot",
      isHierarchical: false,
    },
    {
      name: "duration",
      type: "expression",
      label: "Frame duration",
      entityType: "task",
      default: "{self.fend - self.fstart + 1}",
      objectType: "Shot",
      isHierarchical: false,
    },
    {
      name: "fstart",
      type: "number",
      label: "Frame start",
      entityType: "task",
      default: 1,
      objectType: "Shot",
      isHierarchical: false,
    },
    {
      name: "fps",
      type: "number",
      label: "fps",
      entityType: "show",
      default: 24,
      objectType: undefined,
      isHierarchical: false,
    },
    {
      name: "fps",
      type: "number",
      label: "fps",
      entityType: "task",
      default: 25,
      objectType: "Sequence",
      isHierarchical: false,
    },
    {
      name: "fps",
      type: "number",
      label: "fps",
      entityType: "task",
      default: 25,
      objectType: "Shot",
      isHierarchical: false,
    },
  ] as const;
}

export type RuntimeCustomAttributeConfiguration = ReturnType<
  typeof getAttributeConfigurations
>[number];
export type RuntimeCustomAttributeConfigurationName =
  RuntimeCustomAttributeConfiguration["name"];
export type RuntimeCustomAttributeConfigurationLabel =
  RuntimeCustomAttributeConfiguration["label"];

type BaseCustomAttributeValue = Omit<
  ContextCustomAttributeValue,
  "key" | "value"
>;

export interface TypedCustomAttributeValueMap {
  shotSlate: string;
  wsrReportNote: string;
  latestVersionSentDate: string;
  percentComplete: number;
  workType: string;
  shotType: string[];
  shotNote: string;
  vfxDescription: string;
  Delivered: boolean;
  clientNextVerDate: string;
  clientFinDelDate: string;
  TO_Date: string;
  Turnover: string;
  prodNote: string;
  dateSent: string;
  editNotes: string;
  fend: number;
  handles: number;
  duration: string;
  fstart: number;
  fps: number;
}

export type TypedCustomAttributeValue<
  K extends keyof TypedCustomAttributeValueMap
> = BaseCustomAttributeValue & {
  key: K;
  value: TypedCustomAttributeValueMap[K];
};

export type TypedContextCustomAttributesMap = {
  Action: never;
  ActionLog: never;
  ApiKey: never;
  Appointment: never;
  Asset: never;
  AssetBuild: never;
  AssetCustomAttributeLink: never;
  AssetCustomAttributeLinkFrom: never;
  AssetCustomAttributeValue: never;
  AssetType: never;
  AssetVersion: TypedCustomAttributeValue<"Delivered"> | TypedCustomAttributeValue<"dateSent">;
  AssetVersionCustomAttributeLink: never;
  AssetVersionCustomAttributeLinkFrom: never;
  AssetVersionCustomAttributeValue: never;
  AssetVersionLink: never;
  AssetVersionList: never;
  AssetVersionStatusChange: never;
  AssetVersionStatusRuleGroup: never;
  Automation: never;
  BaseUser: never;
  CalendarEvent: never;
  CalendarEventResource: never;
  Campaign: never;
  Collaborator: never;
  Component: never;
  ComponentCustomAttributeLink: never;
  ComponentCustomAttributeLinkFrom: never;
  ComponentLocation: never;
  ContainerComponent: never;
  Context: never;
  ContextCustomAttributeLink: never;
  ContextCustomAttributeLinkFrom: never;
  ContextCustomAttributeValue: never;
  CustomAttributeConfiguration: never;
  CustomAttributeGroup: never;
  CustomAttributeLink: never;
  CustomAttributeLinkConfiguration: never;
  CustomAttributeLinkFrom: never;
  CustomAttributeType: never;
  CustomAttributeValue: never;
  CustomConfigurationBase: never;
  Dashboard: never;
  DashboardResource: never;
  DashboardWidget: never;
  Disk: never;
  EntitySetting: never;
  Episode: never;
  Event: never;
  Feed: never;
  FileComponent: never;
  Folder: never;
  Group: never;
  GroupCustomAttributeLink: never;
  GroupCustomAttributeLinkFrom: never;
  Image: never;
  Information: never;
  Job: never;
  JobComponent: never;
  List: never;
  ListCategory: never;
  ListCustomAttributeLink: never;
  ListCustomAttributeLinkFrom: never;
  ListCustomAttributeValue: never;
  ListObject: never;
  ListObjectCustomAttributeValue: never;
  Location: never;
  Manager: never;
  ManagerType: never;
  Membership: never;
  Metadata: never;
  Milestone: never;
  Note: never;
  NoteAnnotationComponent: never;
  NoteCategory: never;
  NoteComponent: never;
  NoteLabel: never;
  NoteLabelLink: never;
  ObjectType: never;
  Priority: never;
  Project: TypedCustomAttributeValue<"fps">;
  ProjectSchema: never;
  ProjectSchemaObjectType: never;
  ProjectSchemaOverride: never;
  Recipient: never;
  Resource: never;
  ReviewSession: never;
  ReviewSessionFolder: never;
  ReviewSessionInvitee: never;
  ReviewSessionObject: never;
  ReviewSessionObjectAnnotation: never;
  ReviewSessionObjectAnnotationComponent: never;
  ReviewSessionObjectStatus: never;
  Scene: never;
  Schema: never;
  SchemaStatus: never;
  SchemaType: never;
  Scope: never;
  SecurityRole: never;
  Sequence: TypedCustomAttributeValue<"fps">;
  SequenceComponent: never;
  Setting: never;
  SettingComponent: never;
  Shot:
    | TypedCustomAttributeValue<"shotSlate">
    | TypedCustomAttributeValue<"wsrReportNote">
    | TypedCustomAttributeValue<"latestVersionSentDate">
    | TypedCustomAttributeValue<"percentComplete">
    | TypedCustomAttributeValue<"workType">
    | TypedCustomAttributeValue<"shotType">
    | TypedCustomAttributeValue<"shotNote">
    | TypedCustomAttributeValue<"vfxDescription">
    | TypedCustomAttributeValue<"clientNextVerDate">
    | TypedCustomAttributeValue<"clientFinDelDate">
    | TypedCustomAttributeValue<"TO_Date">
    | TypedCustomAttributeValue<"Turnover">
    | TypedCustomAttributeValue<"prodNote">
    | TypedCustomAttributeValue<"editNotes">
    | TypedCustomAttributeValue<"fend">
    | TypedCustomAttributeValue<"handles">
    | TypedCustomAttributeValue<"duration">
    | TypedCustomAttributeValue<"fstart">
    | TypedCustomAttributeValue<"fps">;
  SplitTaskPart: never;
  State: never;
  Status: never;
  StatusChange: never;
  StatusRule: never;
  StatusRuleGroup: never;
  Task: never;
  TaskTemplate: never;
  TaskTemplateItem: never;
  TaskTypeSchema: never;
  TaskTypeSchemaType: never;
  Timelog: never;
  Timer: never;
  Trigger: never;
  Type: never;
  TypedContext: never;
  TypedContextLink: never;
  TypedContextList: never;
  TypedContextStatusChange: never;
  TypedContextStatusRuleGroup: never;
  User: never;
  UserApplicationState: never;
  UserCustomAttributeLink: never;
  UserCustomAttributeLinkFrom: never;
  UserCustomAttributeValue: never;
  UserSecurityRole: never;
  UserSecurityRoleProject: never;
  UserSession: never;
  UserTaskTypeLink: never;
  UserType: never;
  UserView: never;
  WebhookAction: never;
  WorkflowSchema: never;
  WorkflowSchemaStatus: never;
};

export function getTypes() {
  return [
    {
      name: "GFX Anim",
      isBillable: true,
    },
    {
      name: "Concept",
      isBillable: true,
    },
    {
      name: "GFX Design",
      isBillable: true,
    },
    {
      name: "Modeling",
      isBillable: true,
    },
    {
      name: "Rigging",
      isBillable: true,
    },
    {
      name: "Texture",
      isBillable: true,
    },
    {
      name: "Lookdev",
      isBillable: true,
    },
    {
      name: "Character",
      isBillable: true,
    },
    {
      name: "Prop",
      isBillable: true,
    },
    {
      name: "Vehicle",
      isBillable: true,
    },
    {
      name: "Environment",
      isBillable: true,
    },
    {
      name: "Matte Painting",
      isBillable: true,
    },
    {
      name: "Production",
      isBillable: false,
    },
    {
      name: "Editing",
      isBillable: true,
    },
    {
      name: "Conform",
      isBillable: true,
    },
    {
      name: "Tracking",
      isBillable: true,
    },
    {
      name: "Rotoscoping",
      isBillable: true,
    },
    {
      name: "Previz",
      isBillable: true,
    },
    {
      name: "Layout",
      isBillable: true,
    },
    {
      name: "Animation",
      isBillable: true,
    },
    {
      name: "FX",
      isBillable: true,
    },
    {
      name: "Lighting",
      isBillable: true,
    },
    {
      name: "Rendering",
      isBillable: true,
    },
    {
      name: "Compositing",
      isBillable: true,
    },
    {
      name: "Deliverable",
      isBillable: true,
    },
  ] as const;
}

export type RuntimeType = ReturnType<typeof getTypes>[number];
export type RuntimeTypeName = RuntimeType["name"];

export function getObjectTypes() {
  return [
    {
      name: "Campaign",
      isTimeReportable: false,
      isTaskable: true,
      isTypeable: true,
      isStatusable: true,
      isSchedulable: false,
      isPrioritizable: true,
      isLeaf: false,
    },
    {
      name: "Folder",
      isTimeReportable: false,
      isTaskable: true,
      isTypeable: false,
      isStatusable: false,
      isSchedulable: false,
      isPrioritizable: true,
      isLeaf: false,
    },
    {
      name: "Asset Build",
      isTimeReportable: false,
      isTaskable: true,
      isTypeable: true,
      isStatusable: true,
      isSchedulable: false,
      isPrioritizable: true,
      isLeaf: false,
    },
    {
      name: "Episode",
      isTimeReportable: false,
      isTaskable: true,
      isTypeable: false,
      isStatusable: true,
      isSchedulable: false,
      isPrioritizable: true,
      isLeaf: false,
    },
    {
      name: "Scene",
      isTimeReportable: false,
      isTaskable: true,
      isTypeable: false,
      isStatusable: true,
      isSchedulable: false,
      isPrioritizable: false,
      isLeaf: false,
    },
    {
      name: "Sequence",
      isTimeReportable: false,
      isTaskable: true,
      isTypeable: false,
      isStatusable: false,
      isSchedulable: false,
      isPrioritizable: true,
      isLeaf: false,
    },
    {
      name: "Shot",
      isTimeReportable: false,
      isTaskable: true,
      isTypeable: false,
      isStatusable: true,
      isSchedulable: false,
      isPrioritizable: true,
      isLeaf: false,
    },
    {
      name: "Milestone",
      isTimeReportable: false,
      isTaskable: false,
      isTypeable: true,
      isStatusable: true,
      isSchedulable: true,
      isPrioritizable: true,
      isLeaf: true,
    },
    {
      name: "Task",
      isTimeReportable: true,
      isTaskable: false,
      isTypeable: true,
      isStatusable: true,
      isSchedulable: true,
      isPrioritizable: true,
      isLeaf: true,
    },
    {
      name: "Image",
      isTimeReportable: false,
      isTaskable: true,
      isTypeable: false,
      isStatusable: false,
      isSchedulable: false,
      isPrioritizable: false,
      isLeaf: false,
    },
    {
      name: "Information",
      isTimeReportable: false,
      isTaskable: true,
      isTypeable: false,
      isStatusable: false,
      isSchedulable: false,
      isPrioritizable: false,
      isLeaf: false,
    },
  ] as const;
}

export type RuntimeObjectType = ReturnType<typeof getObjectTypes>[number];
export type RuntimeObjectTypeName = RuntimeObjectType["name"];

export function getProjectSchemas() {
  return [
    {
      name: "GFX Feature",
      objectTypes: [
        "Milestone",
        "Task",
        "Folder",
        "Asset Build",
        "Shot",
        "Sequence",
      ],
    },
    {
      name: "VFX",
      objectTypes: [
        "Milestone",
        "Task",
        "Episode",
        "Folder",
        "Asset Build",
        "Shot",
        "Sequence",
      ],
    },
    {
      name: "VFX Feature",
      objectTypes: [
        "Milestone",
        "Task",
        "Folder",
        "Asset Build",
        "Shot",
        "Sequence",
      ],
    },
  ] as const;
}

export type RuntimeProjectSchema = ReturnType<typeof getProjectSchemas>[number];
export type RuntimeProjectSchemaName = RuntimeProjectSchema["name"];

export function getPriorities() {
  return [
    {
      name: "Urgent",
      color: "#E74C3C",
      value: 0,
      sort: 0,
    },
    {
      name: "High",
      color: "#E67E22",
      value: 0,
      sort: 1,
    },
    {
      name: "Medium",
      color: "#F1C40F",
      value: 0,
      sort: 2,
    },
    {
      name: "Low",
      color: "#1CBC90",
      value: 0,
      sort: 3,
    },
    {
      name: "None",
      color: "#CACACA",
      value: 0,
      sort: 4,
    },
  ] as const;
}

export type RuntimePriority = ReturnType<typeof getPriorities>[number];
export type RuntimePriorityName = RuntimePriority["name"];

export function getStatuses() {
  return [
    {
      name: "Done",
      color: "#1cbc90",
      isActive: true,
      sort: 0,
    },
    {
      name: "Client approved",
      color: "#1CBC90",
      isActive: true,
      sort: 1,
    },
    {
      name: "Approved",
      color: "#1cbc90",
      isActive: true,
      sort: 2,
    },
    {
      name: "Completed",
      color: "#1cbc90",
      isActive: true,
      sort: 3,
    },
    {
      name: "Awaiting Client",
      color: "#CC99FF",
      isActive: true,
      sort: 4,
    },
    {
      name: "Received",
      color: "#cc99ff",
      isActive: true,
      sort: 5,
    },
    {
      name: "Production",
      color: "#3498db",
      isActive: true,
      sort: 6,
    },
    {
      name: "Post-Production",
      color: "#808000",
      isActive: true,
      sort: 7,
    },
    {
      name: "Needs Attention",
      color: "#e74c3c",
      isActive: true,
      sort: 8,
    },
    {
      name: "Omitted",
      color: "#E74C3C",
      isActive: true,
      sort: 9,
    },
    {
      name: "On Hold",
      color: "#E74C3C",
      isActive: true,
      sort: 10,
    },
    {
      name: "Revise",
      color: "#FF6600",
      isActive: true,
      sort: 11,
    },
    {
      name: "Pending Review",
      color: "#F1C40F",
      isActive: true,
      sort: 12,
    },
    {
      name: "In Progress",
      color: "#3498DB",
      isActive: true,
      sort: 14,
    },
    {
      name: "WIP",
      color: "#CC99FF",
      isActive: true,
      sort: 15,
    },
    {
      name: "Ready to start",
      color: "#00FFFF",
      isActive: true,
      sort: 16,
    },
    {
      name: "Not started",
      color: "#CACACA",
      isActive: true,
      sort: 17,
    },
  ] as const;
}
export type RuntimeStatus = ReturnType<typeof getStatuses>[number];
export type RuntimeStatusName = RuntimeStatus["name"];
