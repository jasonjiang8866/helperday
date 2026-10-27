import React from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { router, usePathname } from "expo-router";
import {
  CalendarDays,
  House,
  Settings2,
  Sun,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react-native";
import { useApp } from "../state/AppProvider";
import { Busy, Label, Row, Tile, useTheme } from "./ui";
import { Onboarding, Welcome } from "./Auth";
const nav = [
  { path: "/", label: "Today", icon: Sun },
  { path: "/schedule", label: "Schedule", icon: CalendarDays },
  { path: "/household", label: "Household", icon: House },
  { path: "/settings", label: "Settings", icon: Settings2 },
] as const;
export function Shell({ children }: React.PropsWithChildren) {
  const app = useApp();
  const c = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const path = usePathname();
  const active = app.demo || !!app.user;
  function navigation(vertical = false) {
    return (
      <View
        style={{
          flexDirection: vertical ? "column" : "row",
          gap: vertical ? 10 : 0,
          justifyContent: "space-around",
        }}
      >
        {nav.map(({ path: p, label, icon: Icon }) => (
          <Pressable
            key={p}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: path === p }}
            aria-current={path === p ? "page" : undefined}
            onPress={() => router.navigate(p)}
            style={{
              flexDirection: vertical ? "row" : "column",
              gap: vertical ? 14 : 4,
              alignItems: "center",
              padding: vertical ? 15 : 10,
              minHeight: 56,
              borderRadius: 14,
              backgroundColor: path === p ? c.soft : "transparent",
              flex: vertical ? undefined : 1,
            }}
          >
            <Icon size={21} color={path === p ? c.primary : c.muted} />
            <Label
              style={{
                fontSize: vertical ? 15 : 11,
                fontWeight: path === p ? "700" : "400",
                color: path === p ? c.primary : c.muted,
              }}
            >
              {label}
            </Label>
          </Pressable>
        ))}
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, flexDirection: "row" }}>
      {wide && active && app.snapshot.household && (
        <View
          style={{
            width: 238,
            padding: 24,
            borderRightWidth: 1,
            borderColor: c.line,
            backgroundColor: c.card,
            gap: 40,
          }}
        >
          <Row>
            <Tile size={34} />
            <Label style={{ fontSize: 23, fontWeight: "700" }}>helperday</Label>
          </Row>
          {navigation(true)}
          <View style={{ flex: 1 }} />
          <View
            style={{
              backgroundColor: c.soft,
              padding: 18,
              borderRadius: 18,
              gap: 8,
            }}
          >
            <Tile size={40} />
            <Label style={{ fontFamily: "Georgia", fontSize: 20 }}>
              Better, together.
            </Label>
            <Label muted style={{ fontSize: 12 }}>
              Small routines.{"\n"}More room for living.
            </Label>
          </View>
          <Label muted style={{ fontSize: 11 }}>
            MADE FOR THE EVERYDAY
          </Label>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <ScrollView
          key={path}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: wide ? 40 : 20,
            paddingTop: wide ? 28 : 18,
            paddingBottom: 32,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={{
              width: "100%",
              maxWidth: 1200,
              alignSelf: "center",
              gap: 22,
            }}
          >
            {active && app.snapshot.household && (
              <>
                <Row style={{ justifyContent: "space-between" }}>
                  <View>
                    <Label muted style={{ fontSize: 11, letterSpacing: 2 }}>
                      YOUR SHARED SPACE
                    </Label>
                    <Label style={{ fontWeight: "600" }}>
                      {app.snapshot.household.name}
                    </Label>
                  </View>
                  <Row>
                    <View
                      style={{
                        backgroundColor: c.soft,
                        borderRadius: 24,
                        paddingHorizontal: 13,
                        paddingVertical: 8,
                      }}
                    >
                      <Label style={{ fontSize: 12 }}>
                        {app.demo ? "Demo · " : ""}
                        {app.role === "employer" ? "Employer" : "Helper"}
                      </Label>
                    </View>
                    {app.role === "employer" && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Add task"
                        onPress={() => router.push("/new-task")}
                        style={{
                          backgroundColor: c.primary,
                          padding: 12,
                          borderRadius: 14,
                        }}
                      >
                        <ArrowUpRight size={20} color={c.onPrimary} />
                      </Pressable>
                    )}
                  </Row>
                </Row>
                {app.demo ? (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: c.line,
                      borderRadius: 12,
                      padding: 10,
                    }}
                  >
                    <Label muted style={{ fontSize: 12 }}>
                      Demo household · saved on this device only
                    </Label>
                  </View>
                ) : (
                  <Row>
                    <RefreshCw size={14} color={c.muted} />
                    <Label muted style={{ fontSize: 12 }}>
                      {app.syncing
                        ? "Syncing…"
                        : app.queue.length
                          ? `${app.queue.length} change(s) pending`
                          : app.lastSync
                            ? `Last synced ${app.lastSync}`
                            : "Connecting…"}
                    </Label>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void app.refresh()}
                      style={{ padding: 8 }}
                    >
                      <Label style={{ fontSize: 12, color: c.primary }}>
                        Sync now
                      </Label>
                    </Pressable>
                  </Row>
                )}
              </>
            )}
            {app.error && (
              <View
                style={{
                  padding: 14,
                  backgroundColor: c.coralSoft,
                  borderRadius: 12,
                }}
              >
                <Label
                  accessibilityRole="alert"
                  style={{ color: c.coral, fontSize: 13 }}
                >
                  {app.error}
                </Label>
                <Pressable
                  onPress={() => app.setError("")}
                  accessibilityRole="button"
                  style={{ paddingVertical: 8 }}
                >
                  <Label style={{ fontSize: 12 }}>Dismiss</Label>
                </Pressable>
              </View>
            )}
            {!app.ready ? (
              <Busy />
            ) : !active ? (
              <Welcome />
            ) : !app.snapshot.household ? (
              <Onboarding />
            ) : (
              children
            )}
          </View>
        </ScrollView>
        {!wide && active && app.snapshot.household && (
          <View
            style={{
              borderTopWidth: 1,
              borderColor: c.line,
              backgroundColor: c.card,
              paddingHorizontal: 8,
            }}
          >
            {navigation()}
          </View>
        )}
      </View>
    </View>
  );
}
