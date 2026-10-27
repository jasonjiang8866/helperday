import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useApp } from "../state/AppProvider";
export function useTheme() {
  const { dark, prefs } = useApp();
  const minimal = prefs.style === "minimal";
  return {
    dark,
    minimal,
    bg: dark ? "#101E1C" : minimal ? "#F6F7F9" : "#FAF7EF",
    card: dark ? "#192D29" : "#FFFFFF",
    text: dark ? "#F4F1E7" : "#183E36",
    muted: dark ? "#AFBFB5" : "#61746B",
    line: dark ? "#31483F" : "#E2E8DF",
    primary: dark ? "#94D5B6" : minimal ? "#334F8A" : "#236B55",
    onPrimary: dark ? "#10271F" : "#FFFFFF",
    soft: dark ? "#284339" : "#EAF2E8",
    coral: dark ? "#EBAA94" : "#A74E3D",
    coralSoft: dark ? "#44342E" : "#FBECE4",
    gold: dark ? "#E3C58C" : "#8C6B32",
  };
}
export function Label({
  children,
  style,
  muted = false,
  ...rest
}: React.ComponentProps<typeof Text> & { muted?: boolean }) {
  const c = useTheme();
  return (
    <Text
      {...rest}
      style={[
        { color: muted ? c.muted : c.text, fontSize: 15, lineHeight: 22 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Title({
  children,
  small = false,
}: React.PropsWithChildren<{ small?: boolean }>) {
  return (
    <Label
      accessibilityRole="header"
      style={{
        fontFamily: "Georgia",
        fontSize: small ? 26 : 38,
        lineHeight: small ? 34 : 46,
        letterSpacing: -0.7,
      }}
    >
      {children}
    </Label>
  );
}
export function Card({
  children,
  style,
}: React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const c = useTheme();
  return (
    <View
      className="rounded-3xl"
      style={[
        {
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.line,
          padding: 22,
          gap: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Button({
  children,
  onPress,
  secondary = false,
  disabled = false,
  style,
  testID,
}: React.PropsWithChildren<{
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>) {
  const c = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 48,
          paddingHorizontal: 18,
          paddingVertical: 12,
          borderRadius: 14,
          backgroundColor: secondary ? c.soft : c.primary,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Label
        style={{
          color: secondary ? c.text : c.onPrimary,
          fontWeight: "600",
          textAlign: "center",
        }}
      >
        {children}
      </Label>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const c = useTheme();
  return (
    <View style={{ gap: 7 }}>
      <Label style={{ fontWeight: "600", fontSize: 13 }}>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        {...props}
        style={[
          {
            minHeight: 50,
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: 12,
            backgroundColor: c.bg,
            color: c.text,
            padding: 14,
            fontSize: 16,
          },
          props.multiline && { minHeight: 100, textAlignVertical: "top" },
          props.style,
        ]}
      />
    </View>
  );
}
export function Chip({
  children,
  selected = false,
  onPress,
}: React.PropsWithChildren<{ selected?: boolean; onPress?: () => void }>) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={{ selected }}
      aria-pressed={onPress ? selected : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={{
        minHeight: onPress ? 44 : 28,
        paddingVertical: onPress ? 10 : 3,
        paddingHorizontal: 14,
        borderRadius: 24,
        backgroundColor: selected ? c.primary : c.soft,
        justifyContent: "center",
      }}
    >
      <Label
        style={{
          color: selected ? c.onPrimary : c.text,
          fontSize: 12,
          fontWeight: "600",
        }}
      >
        {children}
      </Label>
    </Pressable>
  );
}
export function Row({
  children,
  style,
}: React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return (
    <View
      className="flex-row items-center"
      style={[{ gap: 10, flexWrap: "wrap" }, style]}
    >
      {children}
    </View>
  );
}
export function Tile({
  size = 44,
  coral = false,
}: {
  size?: number;
  coral?: boolean;
}) {
  const c = useTheme();
  const ink = coral ? c.coral : c.primary;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Rect
        x="1"
        y="1"
        width="78"
        height="78"
        rx="8"
        fill={c.soft}
        stroke={ink}
        strokeWidth="1"
      />
      <Path
        d="M40 12 C57 12 61 30 40 40 C19 30 23 12 40 12 M68 40 C68 57 50 61 40 40 C50 19 68 23 68 40 M40 68 C23 68 19 50 40 40 C61 50 57 68 40 68 M12 40 C12 23 30 19 40 40 C30 61 12 57 12 40"
        fill="none"
        stroke={ink}
        strokeWidth="2"
      />
      <Circle cx="40" cy="40" r="5" fill={ink} />
      <Path
        d="M10 10L19 10M10 10L10 19M70 10L61 10M70 10L70 19M10 70L19 70M10 70L10 61M70 70L61 70M70 70L70 61"
        stroke={ink}
        strokeWidth="2"
      />
    </Svg>
  );
}
export function Busy() {
  const c = useTheme();
  return <ActivityIndicator color={c.primary} style={{ padding: 40 }} />;
}
export function ErrorText({ children }: React.PropsWithChildren) {
  const c = useTheme();
  return children ? (
    <Label accessibilityRole="alert" style={{ color: c.coral }}>
      {children}
    </Label>
  ) : null;
}
export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <Card style={{ alignItems: "center", paddingVertical: 38 }}>
      <Tile size={52} />
      <Title small>{title}</Title>
      <Label muted style={{ textAlign: "center", maxWidth: 360 }}>
        {body}
      </Label>
    </Card>
  );
}
