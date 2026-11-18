import { forwardRef, useState } from "react";
import { Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";

import { colors, radius, shadcn, typography } from "@/ui/theme";

type InputProps = TextInputProps & {
  containerStyle?: StyleProp<ViewStyle>;
  invalid?: boolean;
  style?: StyleProp<TextStyle>;
};

export const Input = forwardRef<TextInput, InputProps>(function Input({
  containerStyle,
  editable = true,
  invalid = false,
  onBlur,
  onFocus,
  style,
  ...props
}, ref) {
  const [focused, setFocused] = useState(false);
  const borderColor = invalid ? shadcn.destructive : focused ? shadcn.ring : shadcn.border;

  return (
    <View style={containerStyle}>
      <TextInput
        {...props}
        editable={editable}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        placeholderTextColor={shadcn.mutedForeground}
        ref={ref}
        style={[
          {
            backgroundColor: editable ? shadcn.input : shadcn.secondary,
            borderColor,
            borderCurve: "continuous",
            borderRadius: radius.lg,
            borderWidth: 1,
            color: shadcn.foreground,
            fontSize: 15,
            minHeight: props.multiline ? 112 : 48,
            paddingHorizontal: 14,
            paddingVertical: props.multiline ? 12 : 0,
            textAlignVertical: props.multiline ? "top" : "center",
          },
          typography.body,
          style,
        ]}
      />
    </View>
  );
});

export function Textarea(props: InputProps) {
  return <Input multiline {...props} style={[{ minHeight: 112 }, props.style]} />;
}

export function FieldLabel({ children }: { children: string }) {
  return <Text style={[typography.label, { color: colors.ink, marginBottom: 6 }]}>{children}</Text>;
}
