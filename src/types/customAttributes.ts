import type { ContextCustomAttributeValue } from "../schemas/schema.ts";

// Core custom attribute interfaces
export interface AssetVersionCustomAttributes
  extends ContextCustomAttributeValue {
  key: "Delivered";
  value: boolean;
}

export interface FtrackDatetime {
  __type__: "datetime";
  value: {
    __type__: "datetime";
    value: string | null;
  };
}

// Base interface for custom attributes
export interface BaseCustomAttribute {
  key?: string;
  value?: unknown;
}

// Type guards
export function isDeliveredAttribute(
  attr: BaseCustomAttribute,
): attr is AssetVersionCustomAttributes {
  return (
    attr &&
    typeof attr === "object" &&
    "key" in attr &&
    attr.key === "Delivered" &&
    "value" in attr &&
    typeof attr.value === "boolean"
  );
}

// Helpers
export function createFtrackDatetime(value: string | null): FtrackDatetime {
  return {
    __type__: "datetime",
    value: {
      __type__: "datetime",
      value,
    },
  };
}
