import { View } from "react-native";

import { BodyText, Card, PrimaryButton, SecondaryButton, SectionHeading, TextInputField } from "@/ui/app-components";

export function BiblePlanReflectionEditor({
  onCancel,
  onChangeText,
  onSave,
  passageReference,
  placeholder,
  saveIcon = "check-circle",
  title,
  value,
}: {
  onCancel: () => void;
  onChangeText: (value: string) => void;
  onSave: () => void;
  passageReference: string;
  placeholder: string;
  saveIcon?: "check-circle" | "send";
  title: string;
  value: string;
}) {
  return (
    <Card>
      <SectionHeading>{title}</SectionHeading>
      <BodyText muted>{passageReference}</BodyText>
      <TextInputField
        multiline
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSave}
        placeholder={placeholder}
        returnKeyType="done"
        style={{ minHeight: 112 }}
        submitBehavior="submit"
      />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <SecondaryButton onPress={onCancel} style={{ flex: 1 }}>
          Cancel
        </SecondaryButton>
        <PrimaryButton disabled={!value.trim()} icon={saveIcon} onPress={onSave} style={{ flex: 1 }}>
          Save
        </PrimaryButton>
      </View>
    </Card>
  );
}
