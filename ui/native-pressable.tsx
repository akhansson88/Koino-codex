import * as Haptics from "expo-haptics";
import { useRef } from "react";
import { Platform, Pressable, type PressableProps } from "react-native";

/** A hold never also activates the tap. Movement cancels the hold, including while scrolling. */
export function NativePressable({ onLongPress, onPress, onPressIn, onTouchMove, onAccessibilityAction, accessibilityActions, ...props }: PressableProps) {
  const held = useRef(false);
  const cancelled = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const activate: NonNullable<PressableProps["onLongPress"]> = event => {
    if (cancelled.current || held.current || props.disabled) return;
    held.current = true;
    if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => undefined);
    onLongPress?.(event);
  };
  return <Pressable {...props} delayLongPress={500}
    accessibilityActions={onLongPress ? [...(accessibilityActions ?? []), { name: "longpress" }] : accessibilityActions}
    onAccessibilityAction={event => {
      if (event.nativeEvent.actionName === "longpress" && onLongPress && !props.disabled) {
        held.current = false; cancelled.current = false;
        activate(event as never);
      } else onAccessibilityAction?.(event);
    }}
    {...(Platform.OS === "web" && onLongPress ? { onContextMenu: (event: { preventDefault(): void }) => {
      event.preventDefault(); held.current = false; cancelled.current = false; activate(event as never);
    } } : {})}
    onPressIn={event => {
      held.current = false; cancelled.current = false;
      origin.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
      onPressIn?.(event);
    }}
    onTouchMove={event => {
      if (Math.hypot(event.nativeEvent.pageX - origin.current.x, event.nativeEvent.pageY - origin.current.y) > 10) cancelled.current = true;
      onTouchMove?.(event);
    }}
    onLongPress={onLongPress ? activate : undefined}
    onPress={event => { if (!held.current && !cancelled.current) onPress?.(event); }} />;
}
