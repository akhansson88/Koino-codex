import type { ComponentProps } from "react";
import type { Feather } from "@expo/vector-icons";

export type FeatherName = ComponentProps<typeof Feather>["name"];

export type DonationAmountOption = "50" | "100" | "200" | "500" | "custom";
