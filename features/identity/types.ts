import type { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";

export type FeatherName = ComponentProps<typeof Feather>["name"];

export type IdentitySheet = "profile" | "language" | "account" | "help" | "security" | "privacy" | "terms";

export type IdentityPresentation = "screen" | "sheet";

export type RoomSheet = "members" | "rename" | "transfer";
